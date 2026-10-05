// runs the free-model council on projects that already have a blind review, to see how close its scores land
// bun scripts/council-check.ts sport:uteg-labs/just-mate defence:Mikformatycy/SafeWall
// needs OPENROUTER_API_KEY; finished steps are kept in .cache/council-check.db, so a re-run resumes
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import type { CouncilReview } from "../server/council"
import { events, getJob, getSubmission, openDb } from "../server/db"
import { enqueue, processJob } from "../server/queue"
import { TASKS } from "../web/data/results"
import { CACHE, type Review, loadScores, loadTeams } from "./lib"

const ENDED = ["done", "failed", "cancelled"]
const fmt = (n: number) => (Math.round(n * 10) / 10).toFixed(1)
const sign = (n: number) => `${n >= 0 ? "+" : ""}${fmt(n)}`

if (!process.env.OPENROUTER_API_KEY) {
  console.error("Set OPENROUTER_API_KEY (for example in .env) first.")
  process.exit(1)
}

const targets = process.argv.slice(2).map(arg => {
  const [task, repo] = arg.split(":")
  if (!task || !repo) throw new Error(`expected task:owner/repo, got "${arg}"`)
  return { task, repo }
})
if (!targets.length) {
  console.error("Usage: bun scripts/council-check.ts <task>:<owner/repo> …")
  process.exit(1)
}

const db = openDb(join(CACHE, "council-check.db"))
const teams = await loadTeams()

async function blindReview(task: string, repo: string): Promise<Review> {
  const review = (await loadScores(task))?.projects.find(p => p.repo === repo)
  if (!review) throw new Error(`no blind review for ${repo} in ${task}`)
  return review
}

// the council gets what a team would type into the form, minus the result, so it stays as blind as the original review
function submit(task: string, repo: string, blind: Review) {
  const id = `check--${task}--${repo.replace(/[^a-z0-9]/gi, "-")}`
  if (getSubmission(db, id)) return id
  const entry = TASKS.find(t => t.id === task)?.entries.find(e => e.repos?.includes(repo))
  const fields = {
    problem: "",
    solution: entry?.desc ?? "",
    progress: "",
    instructions: entry?.demo ? `Live demo: ${entry.demo}` : "",
    additional: "",
  }
  db.query(
    "insert into submissions (id, created_at, task, team, title, result, repo, fields, deck_path, ip_hash) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, Date.now(), task, teams[task]?.entries[repo]?.team ?? entry?.team ?? "Unknown team", blind.project, "Not disclosed", repo, JSON.stringify(fields), null, "council-check")
  enqueue(db, id)
  return id
}

async function run(id: string) {
  let seen = 0
  while (true) {
    const job = getJob(db, id)!
    for (const e of events(db, id, seen)) {
      console.log(`  ${new Date(e.at).toLocaleTimeString("en-GB")}  ${e.message}`)
      seen = e.seq
    }
    if (ENDED.includes(job.status)) return job
    const wait = job.next_run_at - Date.now()
    if (wait > 0) await Bun.sleep(wait)
    await processJob(db, getJob(db, id)!)
  }
}

const rows: { project: string; task: string; blind: Review; council: CouncilReview | null; error: string | null }[] = []

for (const { task, repo } of targets) {
  const blind = await blindReview(task, repo)
  console.log(`\n${blind.project} (${task}, ${repo}) · blind review ${fmt(blind.weighted_total)}`)
  const id = submit(task, repo, blind)
  const job = await run(id)
  const stored = db.query<{ review: string }, [string]>("select review from reviews where id = ?").get(id)
  rows.push({ project: blind.project, task, blind, council: stored ? JSON.parse(stored.review) : null, error: job.error })
}

console.log("\n=== Council vs blind review (Opus) ===\n")
for (const r of rows) {
  if (!r.council) {
    console.log(`${r.project}: no council result (${r.error ?? "unknown error"})\n`)
    continue
  }
  const c = r.council
  const members = c.council.members.map(m => `${m.letter} ${m.ok ? fmt(m.total ?? 0) : "skipped"}`).join(", ")
  console.log(`${r.project} (${r.task}): blind ${fmt(r.blind.weighted_total)} · council ${fmt(c.weighted_total)} · ${sign(c.weighted_total - r.blind.weighted_total)}`)
  console.log(`  members: ${members}`)
  for (const s of c.scores) {
    const b = r.blind.scores.find(x => x.criterion.toLowerCase() === s.criterion.toLowerCase())
    console.log(`  ${s.criterion.padEnd(40)} blind ${b ? fmt(b.score) : " –"}  council ${fmt(s.score)} (${Object.values(s.members).join("/")})  ${b ? sign(s.score - b.score) : ""}`)
  }
  console.log("")
}

const scored = rows.filter(r => r.council)
if (scored.length) {
  const gaps = scored.map(r => Math.abs(r.council!.weighted_total - r.blind.weighted_total))
  console.log(`Mean absolute gap: ${fmt(gaps.reduce((a, b) => a + b, 0) / gaps.length)} points over ${scored.length} projects`)
  const order = (xs: typeof scored, key: (r: (typeof scored)[number]) => number) => [...xs].sort((a, b) => key(b) - key(a)).map(r => r.project).join(" > ")
  console.log(`Blind order:   ${order(scored, r => r.blind.weighted_total)}`)
  console.log(`Council order: ${order(scored, r => r.council!.weighted_total)}`)
}

await mkdir(join(CACHE, "council-check"), { recursive: true })
await Bun.write(join(CACHE, "council-check", "report.json"), JSON.stringify(rows, null, 2))
console.log(`\nFull results: .cache/council-check/report.json`)
