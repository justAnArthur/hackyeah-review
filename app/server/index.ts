import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { join, normalize } from "node:path"
import { ROOT, loadRubrics } from "../../scripts/lib"
import { type CouncilReview, loadCouncil } from "./council"
import { allCurated, curatedId, insertCurated } from "./curated"
import { type Submission, UPLOADS, events, getJob, getSubmission, logEvent, openDb, queuePosition } from "./db"
import { checkRepo, parseRepo } from "./evidence"
import { DAILY_LIMIT, quotaUsed } from "./models"
import { enqueue, resumeInterrupted, startWorker } from "./queue"

const PORT = Number(process.env.PORT ?? 3000)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? ""
const IP_SALT = process.env.IP_SALT ?? randomBytes(16).toString("hex")
const TRUST_PROXY = process.env.TRUST_PROXY === "1"
const SUBMISSIONS_PER_HOUR = Number(process.env.SUBMISSIONS_PER_HOUR ?? 3)
const SUBMISSIONS_PER_DAY = Number(process.env.SUBMISSIONS_PER_DAY ?? 60)
const MAX_DECK = 15 * 1024 * 1024
// a review per task plus one correction, and a repo entered in at most a few tasks
const REVIEWS_PER_TASK = 2
const TASKS_PER_REPO = 3
const PUBLIC = join(ROOT, "public")

const RESULTS = ["Winner", "1st place", "2nd place", "3rd place", "Finalist", "Not a finalist"]
const LIMITS = { title: 120, team: 80, problem: 5000, solution: 5000, progress: 5000, instructions: 3000, additional: 2000 }

const db = openDb()
const tasks = (await loadRubrics()).map(r => ({ id: r.id, name: r.name, kind: r.kind }))

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

function fail(error: string, status = 400) {
  return json({ error }, status)
}

// traefik appends the address it saw to x-forwarded-for; anything before it came from the client
function clientIp(req: Request, server: Bun.Server<unknown>) {
  const forwarded = TRUST_PROXY ? req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() : null
  return forwarded || server.requestIP(req)?.address || "unknown"
}

type Prior = { id: string; task: string; title: string; team: string; fields: string; deck_path: string | null }

// every submission of this repo except failed ones; one replaced by a correction while still in the
// queue is cancelled, and it still counts
function priorReviews(repo: string) {
  return db
    .query<Prior, [string]>(
      `select s.id, s.task, s.title, s.team, s.fields, s.deck_path from submissions s join jobs j on j.id = s.id
       where lower(s.repo) = lower(?) and j.status <> 'failed' order by s.created_at`,
    )
    .all(repo)
}

async function sameDeck(path: string | null, deck: Uint8Array | null) {
  if (!path || !deck) return !path && !deck
  const file = Bun.file(path)
  return (await file.exists()) && Bun.hash(await file.bytes()) === Bun.hash(deck)
}

// a project gets one review per task, and one correction when the team changed the form or the deck;
// sending the same details again only points to the review it already has
async function admit(s: { repo: string; task: string; title: string; team: string; fields: Submission["fields"] }, deck: Uint8Array | null) {
  const prior = priorReviews(s.repo)
  const entered = new Set(prior.map(p => p.task))
  if (!entered.has(s.task) && entered.size >= TASKS_PER_REPO) return fail(`A project can be reviewed for at most ${TASKS_PER_REPO} tasks.`)

  const same = prior.filter(p => p.task === s.task)
  const latest = same.at(-1)
  if (!latest) return null

  const url = `/r/${latest.id}`
  if (same.length >= REVIEWS_PER_TASK) return json({ error: "This project already had its review and one correction for this task.", url }, 409)
  const unchanged = latest.title === s.title && latest.team === s.team && latest.fields === JSON.stringify(s.fields) && (await sameDeck(latest.deck_path, deck))
  if (unchanged) return json({ error: "This project was already reviewed with the same details. Change the form or the deck to send a correction.", url }, 409)
  return null
}

async function submit(req: Request, server: Bun.Server<unknown>) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return fail("The form could not be read.")
  }

  const values = Object.fromEntries(Object.keys(LIMITS).map(k => [k, String(form.get(k) ?? "").trim()])) as Record<keyof typeof LIMITS, string>
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
  const today = db.query<{ n: number }, [number]>("select count(*) as n from submissions where source = 'form' and ip_hash <> 'admin' and created_at > ?")
    .get(Date.now() - 86_400_000)
  if ((today?.n ?? 0) >= SUBMISSIONS_PER_DAY) return fail("The review queue has taken all the projects it can for today. Try again tomorrow.", 429)

  const file = form.get("deck")
  let deck: Uint8Array | null = null
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_DECK) return fail("The presentation must be a PDF of at most 15 MB.")
    deck = await file.bytes()
    if (new TextDecoder().decode(deck.slice(0, 5)) !== "%PDF-") return fail("The presentation must be a PDF file.")
  }

  const { title, team, ...fields } = values
  const refused = await admit({ repo, task, title, team, fields }, deck)
  if (refused) return refused

  const repoError = await checkRepo(repo)
  if (repoError) return fail(repoError)

  const id = randomBytes(6).toString("base64url")
  const deckPath = deck ? join(UPLOADS, `${id}.pdf`) : null
  if (deckPath && deck) await Bun.write(deckPath, deck)
  addSubmission({ id, task, team, title, result, repo, fields, deck_path: deckPath, ip_hash: ipHash, source: "form" })
  return json({ id, url: `/r/${id}` }, 201)
}

// a correction replaces the review it corrects
function addSubmission(s: Omit<Submission, "created_at" | "hidden">) {
  const old = db.query<{ id: string }, [string, string]>("select id from submissions where lower(repo) = lower(?) and task = ? and hidden = 0").all(s.repo, s.task)
  for (const o of old) {
    db.query("update submissions set hidden = 2 where id = ?").run(o.id)
    db.query("update jobs set status = 'cancelled' where id = ? and status not in ('done', 'failed')").run(o.id)
  }

  db.query(
    "insert into submissions (id, created_at, task, team, title, result, repo, fields, deck_path, ip_hash, source) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(s.id, Date.now(), s.task, s.team, s.title, s.result, s.repo, JSON.stringify(s.fields), s.deck_path, s.ip_hash, s.source)
  enqueue(db, s.id)
}

type AdminSubmission = { task: string; team: string; title: string; repo: string; result?: string; fields?: Partial<Submission["fields"]> }

// a review a team asked for somewhere else, such as the HackYeah Discord, added without the form;
// it shows with the other community submissions
async function adminSubmission(req: Request) {
  if (!isAdmin(req)) return fail("Not allowed.", 403)
  const body = (await req.json().catch(() => null)) as AdminSubmission | null
  if (!body?.title || !body.team) return fail("Send the task, team, title and repo.")
  if (!tasks.some(t => t.id === body.task)) return fail("Unknown task.")
  const result = body.result ?? "Not a finalist"
  if (!RESULTS.includes(result)) return fail("Unknown result.")
  const repo = parseRepo(body.repo ?? "")
  if (!repo) return fail("The repo must be a GitHub link.")
  // the team's own submission always wins over one added for it
  const existing = priorReviews(repo).find(p => p.task === body.task)
  if (existing) return json({ error: "This project already has a submission for this task.", url: `/r/${existing.id}` }, 409)
  const repoError = await checkRepo(repo)
  if (repoError) return fail(repoError)

  const id = randomBytes(6).toString("base64url")
  const fields = { problem: "", solution: "", progress: "", instructions: "", additional: "", ...body.fields }
  addSubmission({ id, task: body.task, team: body.team, title: body.title, result, repo, fields, deck_path: null, ip_hash: "admin", source: "form" })
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

type Entry = { id: string; task: string; repo: string; title: string; team: string; uploaded_at: number; status: string; position: number; review: CouncilReview | null }

// every visible submission with its state, so an upload shows in the list right away and its
// score fills in when the council is done; failed and replaced reviews stay off the list
function entries(source: "form" | "curated") {
  const rows = db
    .query<{ id: string; task: string; repo: string; title: string; team: string; created_at: number; review: string | null }, [string]>(
      `select s.id, s.task, s.repo, s.title, s.team, s.created_at, r.review from submissions s join jobs j on j.id = s.id
       left join reviews r on r.id = s.id
       where s.source = ? and s.hidden = 0 and j.status not in ('failed', 'cancelled') order by s.created_at desc`,
    )
    .all(source)
  return rows.map((r): Entry => {
    const job = getJob(db, r.id)!
    return {
      id: r.id,
      task: r.task,
      repo: r.repo,
      title: r.title,
      team: r.team,
      uploaded_at: r.created_at,
      status: job.status,
      position: queuePosition(db, job),
      review: r.review ? (JSON.parse(r.review) as CouncilReview) : null,
    }
  })
}

function community() {
  const byTask: Record<string, Entry[]> = {}
  for (const e of entries("form")) (byTask[e.task] ??= []).push(e)
  return byTask
}

function finalists() {
  return Object.fromEntries(entries("curated").map(e => [`${e.task}|${e.repo}`, e]))
}

// hashed first so both sides have the same length, which timingSafeEqual needs
function isAdmin(req: Request) {
  if (!ADMIN_TOKEN) return false
  const digest = (s: string) => createHash("sha256").update(s).digest()
  return timingSafeEqual(digest(req.headers.get("authorization") ?? ""), digest(`Bearer ${ADMIN_TOKEN}`))
}

type CuratedRequest = { import?: CouncilReview[]; enqueue?: { task: string; repo: string }[] | "all" }

// imports finished council reviews of the finalists (from scripts/council-sync.ts) and queues the rest, in upload order
async function curated(req: Request) {
  if (!isAdmin(req)) return fail("Not allowed.", 403)
  const body = (await req.json().catch(() => null)) as CuratedRequest | null
  if (!body) return fail("Send a JSON body.")
  const { version } = await loadCouncil()
  const counts = { imported: 0, queued: 0, skipped: 0 }

  for (const r of body.import ?? []) {
    const id = curatedId(r.task, r.repo)
    const known = db.query("select 1 from reviews where id = ?").get(id)
    if (r.council?.version !== version || known || (!getSubmission(db, id) && !insertCurated(db, id, r.task, r.repo))) {
      counts.skipped++
      continue
    }
    const now = Date.now()
    db.query(
      "insert or replace into jobs (id, status, step, attempts, next_run_at, priority, error, created_at, updated_at) values (?, 'done', 'done', 0, ?, 0, null, ?, ?)",
    ).run(id, now, now, now)
    db.query("insert into reviews (id, review, council_version, created_at) values (?, ?, ?, ?)").run(id, JSON.stringify({ ...r, id }), version, r.created_at ?? now)
    logEvent(db, id, `Imported from a council v${version} comparison run`)
    counts.imported++
  }

  for (const t of body.enqueue === "all" ? allCurated() : (body.enqueue ?? [])) {
    const id = curatedId(t.task, t.repo)
    const job = getJob(db, id)
    if ((job && job.status !== "failed") || (!job && !getSubmission(db, id) && !insertCurated(db, id, t.task, t.repo))) {
      counts.skipped++
      continue
    }
    // a finalist queued now counts as uploaded now, so it waits its turn like any upload
    db.query("update submissions set created_at = ? where id = ?").run(Date.now(), id)
    enqueue(db, id)
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
    "/api/health": () => json({ ok: true, quota_used_today: quotaUsed(db), daily_limit: DAILY_LIMIT }),
    "/api/tasks": () => json(tasks),
    "/api/submissions": { POST: submit },
    "/api/reviews/:id": req => {
      const s = status(req.params.id)
      return s ? json(s) : fail("Not found.", 404)
    },
    "/api/reviews/:id/events": req => sse(req.params.id),
    "/api/community": () => json(community()),
    "/api/finalists": () => json(finalists()),
    "/api/admin/curated": { POST: curated },
    "/api/admin/submissions": { POST: adminSubmission },
    "/api/admin/reviews/:id/hide": {
      POST: req => {
        if (!isAdmin(req)) return fail("Not allowed.", 403)
        db.query("update submissions set hidden = 1 where id = ?").run(req.params.id)
        return json({ ok: true })
      },
    },
    // drops a finished or failed review and queues it again from fresh evidence; it keeps its upload time
    "/api/admin/reviews/:id/rerun": {
      POST: req => {
        if (!isAdmin(req)) return fail("Not allowed.", 403)
        const id = req.params.id
        if (!getSubmission(db, id)) return fail("Not found.", 404)
        for (const table of ["reviews", "member_results", "member_tries", "evidence"]) db.query(`delete from ${table} where id = ?`).run(id)
        enqueue(db, id)
        return json({ ok: true, position: queuePosition(db, getJob(db, id)!) })
      },
    },
    // wakes reviews waiting for the daily quota, after DAILY_LIMIT was raised; they keep what they finished
    "/api/admin/queue/resume": {
      POST: req => {
        if (!isAdmin(req)) return fail("Not allowed.", 403)
        return json({ ok: true, resumed: resumeInterrupted(db) })
      },
    },
    "/r/:id": () => new Response(Bun.file(join(PUBLIC, "review.html"))),
    // the scorecard merged into the results page; browsers keep the #fragment across the redirect
    "/scorecard": () => Response.redirect("/", 301),
  },
  async fetch(req) {
    const url = new URL(req.url)
    const file = await staticFile(url.pathname === "/" ? "/index" : url.pathname)
    return file ? new Response(file) : new Response("Not found", { status: 404 })
  },
})

startWorker(db)
console.log(`hackyeah-review listening on http://localhost:${server.port}`)
