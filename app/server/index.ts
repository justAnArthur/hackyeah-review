import { createHash, randomBytes } from "node:crypto"
import { join, normalize } from "node:path"
import { ROOT, loadRubrics } from "../../scripts/lib"
import { type CouncilReview, loadCouncil } from "./council"
import { allCurated, curatedId, insertCurated } from "./curated"
import { UPLOADS, events, getJob, getSubmission, logEvent, openDb, queuePosition } from "./db"
import { checkRepo, parseRepo } from "./evidence"
import { quotaUsed } from "./models"
import { enqueue, startWorker } from "./queue"

const PORT = Number(process.env.PORT ?? 3000)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? ""
const IP_SALT = process.env.IP_SALT ?? randomBytes(16).toString("hex")
const TRUST_PROXY = process.env.TRUST_PROXY === "1"
const SUBMISSIONS_PER_HOUR = Number(process.env.SUBMISSIONS_PER_HOUR ?? 3)
const MAX_DECK = 15 * 1024 * 1024
const PUBLIC = join(ROOT, "public")

const RESULTS = ["Winner", "1st place", "2nd place", "3rd place", "Finalist", "Not a finalist"]
const LIMITS = { title: 120, team: 80, problem: 5000, solution: 5000, progress: 5000, instructions: 3000, additional: 2000 }

const db = openDb()
const tasks = (await loadRubrics()).map(r => ({ id: r.id, name: r.name, kind: r.kind }))

const json = (data: unknown, status = 200) => Response.json(data, { status })
const fail = (error: string, status = 400) => json({ error }, status)

function clientIp(req: Request, server: Bun.Server<unknown>) {
  const forwarded = TRUST_PROXY ? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : null
  return forwarded || server.requestIP(req)?.address || "unknown"
}

function newId() {
  return randomBytes(6).toString("base64url")
}

async function submit(req: Request, server: Bun.Server<unknown>) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return fail("The form could not be read.")
  }
  const values = Object.fromEntries(Object.entries(LIMITS).map(([k]) => [k, String(form.get(k) ?? "").trim()])) as Record<
    keyof typeof LIMITS,
    string
  >

  for (const [k, max] of Object.entries(LIMITS)) {
    if (values[k as keyof typeof LIMITS].length > max) return fail(`"${k}" is longer than ${max} characters.`)
  }
  if (!values.title || !values.team) return fail("Project title and team name are required.")
  if (!values.problem || !values.solution || !values.progress) return fail("Fill in the problem, the solution and what's done so far.")

  const task = String(form.get("task") ?? "")
  if (!tasks.some(t => t.id === task)) return fail("Choose the task you entered.")
  const result = String(form.get("result") ?? "")
  if (!RESULTS.includes(result)) return fail("Choose how your project placed.")
  if (form.get("consent") !== "on") return fail("Confirm that you're on the team and agree to publication.")

  const repo = parseRepo(String(form.get("repo") ?? ""))
  if (!repo) return fail("Code Repository must be a public GitHub repo link, like https://github.com/owner/name.")

  const ipHash = createHash("sha256").update(IP_SALT + clientIp(req, server)).digest("hex")
  const recent = db.query<{ n: number }, [string, number]>("select count(*) as n from submissions where ip_hash = ? and created_at > ?")
    .get(ipHash, Date.now() - 3_600_000)
  if ((recent?.n ?? 0) >= SUBMISSIONS_PER_HOUR) return fail("Too many submissions from your network in the last hour. Try again later.", 429)

  const repoError = await checkRepo(repo)
  if (repoError) return fail(repoError)

  const id = newId()
  let deckPath: string | null = null
  const deck = form.get("deck")
  if (deck instanceof File && deck.size > 0) {
    if (deck.size > MAX_DECK) return fail("The presentation must be a PDF of at most 15 MB.")
    const head = new TextDecoder().decode(await deck.slice(0, 5).arrayBuffer())
    if (head !== "%PDF-") return fail("The presentation must be a PDF file.")
    deckPath = join(UPLOADS, `${id}.pdf`)
    await Bun.write(deckPath, deck)
  }

  const now = Date.now()
  const old = db.query<{ id: string }, [string, string]>("select id from submissions where repo = ? and task = ? and hidden = 0").all(repo, task)
  for (const o of old) {
    db.query("update submissions set hidden = 2 where id = ?").run(o.id)
    db.query("update jobs set status = 'cancelled' where id = ? and status not in ('done', 'failed')").run(o.id)
  }

  const { title, team, ...fields } = values
  db.query(
    "insert into submissions (id, created_at, task, team, title, result, repo, fields, deck_path, ip_hash) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, now, task, team, title, result, repo, JSON.stringify(fields), deckPath, ipHash)
  enqueue(db, id)
  return json({ id, url: `/r/${id}` }, 201)
}

function status(id: string, after = 0) {
  const sub = getSubmission(db, id)
  const job = getJob(db, id)
  if (!sub || !job || sub.hidden === 1) return null
  const row = db.query<{ review: string }, [string]>("select review from reviews where id = ?").get(id)
  return {
    submission: { id: sub.id, title: sub.title, team: sub.team, task: sub.task, result: sub.result, repo: sub.repo, created_at: sub.created_at, superseded: sub.hidden === 2, source: sub.source },
    job: { status: job.status, step: job.step, position: queuePosition(db, job), next_run_at: job.next_run_at, error: job.error },
    events: events(db, id, after),
    review: row ? (JSON.parse(row.review) as CouncilReview) : null,
  }
}

function sse(id: string) {
  let timer: Timer | undefined
  let closed = false
  const enc = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        let after = 0
        const close = () => {
          closed = true
          clearInterval(timer)
          controller.close()
        }
        // runs on a timer, so an error here must not escape and take the server down
        const tick = () => {
          if (closed) return
          try {
            const s = status(id, after)
            if (!s) {
              controller.enqueue(enc.encode("event: gone\ndata: {}\n\n"))
              return close()
            }
            after = s.events.at(-1)?.seq ?? after
            controller.enqueue(enc.encode(`data: ${JSON.stringify(s)}\n\n`))
            if (["done", "failed", "cancelled"].includes(s.job.status)) close()
          } catch {
            closed = true
            clearInterval(timer)
          }
        }
        tick()
        if (!closed) timer = setInterval(tick, 2000)
      },
      cancel() {
        closed = true
        clearInterval(timer)
      },
    }),
    { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } },
  )
}

function community() {
  const rows = db
    .query<{ review: string }, []>(
      `select r.review from reviews r join submissions s on s.id = r.id join jobs j on j.id = r.id
       where s.hidden = 0 and s.source = 'form' and j.status = 'done' order by r.created_at desc`,
    )
    .all()
  const byTask: Record<string, CouncilReview[]> = {}
  for (const { review } of rows) {
    const r = JSON.parse(review) as CouncilReview
    ;(byTask[r.task] ??= []).push(r)
  }
  return byTask
}

// council scores of the finalists, keyed "task|repo", shown next to their blind reviews
function councilScores() {
  const rows = db
    .query<{ id: string; review: string }, []>(
      `select r.id, r.review from reviews r join submissions s on s.id = r.id join jobs j on j.id = r.id
       where s.source = 'curated' and s.hidden = 0 and j.status = 'done'`,
    )
    .all()
  return Object.fromEntries(
    rows.map(({ id, review }) => {
      const r = JSON.parse(review) as CouncilReview
      return [`${r.task}|${r.repo}`, { id, total: r.weighted_total, version: r.council.version }]
    }),
  )
}

const isAdmin = (req: Request) => !!ADMIN_TOKEN && req.headers.get("authorization") === `Bearer ${ADMIN_TOKEN}`

type CuratedRequest = { import?: CouncilReview[]; enqueue?: { task: string; repo: string }[] | "all" }

// imports finished comparison reviews of the finalists and queues the rest behind form submissions
async function curated(req: Request) {
  if (!isAdmin(req)) return fail("Not allowed.", 403)
  const body = (await req.json().catch(() => null)) as CuratedRequest | null
  if (!body) return fail("Send a JSON body.")
  const { version } = await loadCouncil()
  const counts = { imported: 0, queued: 0, skipped: 0 }

  for (const r of body.import ?? []) {
    const id = curatedId(r.task, r.repo)
    const known = db.query("select 1 from reviews where id = ?").get(id)
    if (r.council?.version !== version || known || (!getSubmission(db, id) && !(await insertCurated(db, id, r.task, r.repo)))) {
      counts.skipped++
      continue
    }
    const now = Date.now()
    db.query(
      "insert or replace into jobs (id, status, step, attempts, next_run_at, priority, error, created_at, updated_at) values (?, 'done', 'done', 0, ?, -1, null, ?, ?)",
    ).run(id, now, now, now)
    db.query("insert into reviews (id, review, council_version, created_at) values (?, ?, ?, ?)").run(id, JSON.stringify({ ...r, id }), version, r.created_at ?? now)
    logEvent(db, id, `Imported from a council v${version} comparison run`)
    counts.imported++
  }

  for (const t of body.enqueue === "all" ? await allCurated() : (body.enqueue ?? [])) {
    const id = curatedId(t.task, t.repo)
    const job = getJob(db, id)
    if ((job && job.status !== "failed") || (!job && !getSubmission(db, id) && !(await insertCurated(db, id, t.task, t.repo)))) {
      counts.skipped++
      continue
    }
    enqueue(db, id, -1)
    counts.queued++
  }
  return json(counts)
}

async function staticFile(pathname: string) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "")
  const base = join(PUBLIC, clean)
  if (!base.startsWith(PUBLIC)) return null
  for (const candidate of [base, `${base}.html`, join(base, "index.html")]) {
    const file = Bun.file(candidate)
    if ((await file.exists()) && !candidate.endsWith("/")) return file
  }
  return null
}

const server = Bun.serve({
  port: PORT,
  idleTimeout: 120,
  maxRequestBodySize: MAX_DECK + 1024 * 1024,
  routes: {
    "/api/health": () => json({ ok: true, quota_used_today: quotaUsed(db) }),
    "/api/tasks": () => json(tasks),
    "/api/submissions": { POST: (req, srv) => submit(req, srv) },
    "/api/reviews/:id": req => {
      const s = status(req.params.id)
      return s ? json(s) : fail("Not found.", 404)
    },
    "/api/reviews/:id/events": req => sse(req.params.id),
    "/api/community": () => json(community()),
    "/api/council-scores": () => json(councilScores()),
    "/api/admin/curated": { POST: req => curated(req) },
    "/api/admin/reviews/:id/hide": {
      POST: req => {
        if (!isAdmin(req)) return fail("Not allowed.", 403)
        db.query("update submissions set hidden = 1 where id = ?").run(req.params.id)
        return json({ ok: true })
      },
    },
    "/r/:id": () => new Response(Bun.file(join(PUBLIC, "review.html"))),
    // the scorecard merged into the results page; browsers keep the #fragment across the redirect
    "/scorecard": () => Response.redirect("/", 301),
  },
  async fetch(req) {
    const url = new URL(req.url)
    const file = await staticFile(url.pathname === "/" ? "/index" : url.pathname)
    if (file) return new Response(file)
    return new Response("Not found", { status: 404 })
  },
})

startWorker(db)
console.log(`hackyeah-review listening on http://localhost:${server.port}`)
