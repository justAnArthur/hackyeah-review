// runs the council on projects that already have a blind review, to see how close its scores land
//   bun scripts/council-check.ts sport:uteg-labs/just-mate defence:Mikformatycy/SafeWall
//   bun scripts/council-check.ts --all [--shard 1/3]
// each council version gets its own database (.cache/council-check-v<version>.db), shared by shards,
// so a re-run resumes: finished members are kept and failed reviews are queued again.
// bun scripts/council-report.ts turns the database into the comparison page
import { join } from "node:path"
import { parseArgs } from "node:util"
import { type CouncilReview, loadCouncil } from "../app/server/council"
import { allCurated, curatedId, insertCurated } from "../app/server/curated"
import { events, getJob, openDb } from "../app/server/db"
import { enqueue, processJob } from "../app/server/queue"
import { CACHE, type Review, loadScores } from "./lib"

const ENDED = ["done", "failed", "cancelled"]
const fmt = (n: number) => (Math.round(n * 10) / 10).toFixed(1)
const sign = (n: number) => `${n >= 0 ? "+" : ""}${fmt(n)}`

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: { all: { type: "boolean" }, shard: { type: "string" } },
  allowPositionals: true,
})

let targets = values.all
  ? await allCurated()
  : positionals.map(arg => {
      const [task, repo] = arg.split(":")
      if (!task || !repo) throw new Error(`expected task:owner/repo, got "${arg}"`)
      return { task, repo }
    })
if (values.shard) {
  const [i, n] = values.shard.split("/").map(Number)
  if (!(i >= 1 && i <= n)) throw new Error(`--shard expects i/n, got "${values.shard}"`)
  targets = targets.filter((_, k) => k % n === i - 1)
}
if (!targets.length) {
  console.error("Usage: bun scripts/council-check.ts <task>:<owner/repo> … | --all [--shard i/n]")
  process.exit(1)
}

const council = await loadCouncil()
const dbName = process.env.CHECK_DB ?? `council-check-v${council.version}.db`
const db = openDb(join(CACHE, dbName))
console.log(`council v${council.version} · ${targets.length} projects · ${dbName}`)

async function blindReview(task: string, repo: string): Promise<Review> {
  const review = (await loadScores(task))?.projects.find(p => p.repo === repo)
  if (!review) throw new Error(`no blind review for ${repo} in ${task}`)
  return review
}

async function submit(task: string, repo: string) {
  const id = curatedId(task, repo, "check")
  const job = getJob(db, id)
  if (job?.status === "failed") enqueue(db, id)
  if (job || !(await insertCurated(db, id, task, repo))) return id
  enqueue(db, id)
  return id
}

async function run(id: string) {
  let seen = events(db, id).at(-1)?.seq ?? 0
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

const gaps: number[] = []
for (const { task, repo } of targets) {
  const blind = await blindReview(task, repo)
  console.log(`\n${blind.project} (${task}, ${repo}) · blind ${fmt(blind.weighted_total)}`)
  const id = await submit(task, repo)
  const job = await run(id)
  const stored = db.query<{ review: string }, [string]>("select review from reviews where id = ?").get(id)
  const review = stored ? (JSON.parse(stored.review) as CouncilReview) : null
  if (review) gaps.push(review.weighted_total - blind.weighted_total)
  console.log(
    review
      ? `  ⇒ council ${fmt(review.weighted_total)} vs blind ${fmt(blind.weighted_total)} (${sign(review.weighted_total - blind.weighted_total)})`
      : `  ⇒ no council review: ${job.error ?? job.status}`,
  )
}

if (gaps.length) {
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  console.log(`\n${gaps.length}/${targets.length} reviewed · mean absolute gap ${fmt(mean(gaps.map(Math.abs)))} · mean signed gap ${sign(mean(gaps))}`)
}
console.log("Comparison page: bun scripts/council-report.ts")
