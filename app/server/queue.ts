import { runCouncil } from "./council"
import { type Db, type Job, type Submission, getSubmission, logEvent, updateJob } from "./db"
import { EVIDENCE_VERSION, type Facts, buildEvidence } from "./evidence"
import { FatalError, QuotaExhausted, RateLimited } from "./models"
import { describeImages } from "./vision"

const MAX_ATTEMPTS = 8
const PERMANENT = /not found|not public|private|larger than|could not unpack|HTTP 4\d\d/

export function enqueue(db: Db, id: string) {
  const now = Date.now()
  db.query(
    "insert or replace into jobs (id, status, step, attempts, next_run_at, priority, error, created_at, updated_at) values (?, 'queued', 'queued', 0, ?, 0, null, ?, ?)",
  ).run(id, now, now, now)
  logEvent(db, id, "Queued")
}

// on start, jobs waiting for quota are checked again, since a restart is how a raised DAILY_LIMIT
// takes effect. running jobs are left alone: during a deploy the old server may still be finishing
// one, and requeueStale picks it up once it stops making progress
export function resumeInterrupted(db: Db) {
  return db.query("update jobs set status = 'queued', next_run_at = ? where status = 'waiting_quota'").run(Date.now()).changes
}

export function nextJob(db: Db, now = Date.now()) {
  return db
    .query<Job, [number]>(
      `select j.* from jobs j join submissions s on s.id = j.id
       where j.status in ('queued', 'waiting_quota') and j.next_run_at <= ?
       order by s.created_at asc, j.id asc limit 1`,
    )
    .get(now)
}

export function backoff(attempts: number) {
  return Math.min(30_000 * 2 ** attempts, 30 * 60_000)
}

function fmtTime(ms: number) {
  return `${new Date(ms).toISOString().slice(11, 16)} UTC`
}

async function evidenceFor(db: Db, sub: Submission) {
  const cached = db
    .query<{ pack: string; facts: string }, [string, number]>("select pack, facts from evidence where id = ? and version = ?")
    .get(sub.id, EVIDENCE_VERSION)
  if (cached) return cached

  // members who read an older pack would not have seen the same evidence as the rest
  db.query("delete from member_results where id = ?").run(sub.id)
  updateJob(db, sub.id, { step: "evidence" })
  logEvent(db, sub.id, "Collecting evidence from the repo and deck")
  const built = await buildEvidence(sub, (shots, prompt) => describeImages(db, shots, prompt)).catch(e => {
    const msg = (e as Error).message
    throw PERMANENT.test(msg) ? new FatalError(msg) : e
  })
  const facts = JSON.stringify(built.facts)
  db.query("insert or replace into evidence (id, pack, facts, version) values (?, ?, ?, ?)").run(sub.id, built.pack, facts, EVIDENCE_VERSION)
  const f = built.facts
  logEvent(db, sub.id, `Found ${f.source_loc.toLocaleString("en")} source lines, ${f.tests.cases} test cases and ${f.commits.count} commits`)
  logEvent(db, sub.id, `Read ${f.docs_read} docs and ${f.repo_decks.length} decks, opened ${f.demo_checks.filter(d => d.title).length} demo pages and described ${f.screenshots_described} screenshots`)
  return { pack: built.pack, facts }
}

function retryOrFail(db: Db, job: Job, e: unknown) {
  const now = Date.now()
  if (e instanceof QuotaExhausted) {
    updateJob(db, job.id, { status: "waiting_quota", next_run_at: e.resumeAt })
    logEvent(db, job.id, `Today's free-model quota is used up; continuing at ${fmtTime(e.resumeAt)}`)
    return
  }

  if (e instanceof RateLimited) {
    updateJob(db, job.id, { status: "queued", next_run_at: now + e.retryAfterMs })
    logEvent(db, job.id, `A model is busy; trying again in ${Math.round(e.retryAfterMs / 1000)} s`)
    return
  }

  const message = (e as Error).message
  if (e instanceof FatalError || job.attempts + 1 >= MAX_ATTEMPTS) {
    updateJob(db, job.id, { status: "failed", step: "failed", error: message })
    logEvent(db, job.id, `Failed: ${message}`)
    return
  }

  const wait = backoff(job.attempts)
  updateJob(db, job.id, { status: "queued", attempts: job.attempts + 1, next_run_at: now + wait, error: message })
  logEvent(db, job.id, `Temporary problem (${message}); trying again in ${Math.round(wait / 1000)} s`)
}

export async function processJob(db: Db, job: Job) {
  updateJob(db, job.id, { status: "running" })
  const sub = getSubmission(db, job.id)
  if (!sub || sub.hidden) {
    updateJob(db, job.id, { status: "cancelled", step: "cancelled" })
    return
  }

  try {
    const ev = await evidenceFor(db, sub)
    updateJob(db, job.id, { step: "council" })
    await runCouncil(db, sub, JSON.parse(ev.facts) as Facts, ev.pack)
    updateJob(db, job.id, { status: "done", step: "done", error: null })
  } catch (e) {
    retryOrFail(db, job, e)
  }
}

// during a deploy the old and new server share the database for a minute, so a worker claims a job
// atomically, and a running job with no progress for a while (its server was stopped) is queued again
const STALE_MS = 20 * 60_000

export function claimJob(db: Db, id: string) {
  const { changes } = db
    .query("update jobs set status = 'running', updated_at = ? where id = ? and status in ('queued', 'waiting_quota')")
    .run(Date.now(), id)
  return changes === 1
}

export function requeueStale(db: Db, now = Date.now()) {
  const stale = db
    .query<{ id: string }, [number]>(
      `select j.id from jobs j where j.status = 'running'
       and coalesce((select max(at) from events e where e.job_id = j.id), j.updated_at) < ?`,
    )
    .all(now - STALE_MS)
  for (const { id } of stale) {
    db.query("update jobs set status = 'queued', next_run_at = ? where id = ?").run(now, id)
    logEvent(db, id, "Picked up again: the server that was running this review stopped")
  }
  return stale.length
}

export function startWorker(db: Db, intervalMs = 3000) {
  resumeInterrupted(db)
  let busy = false
  const timer = setInterval(async () => {
    if (busy) return
    requeueStale(db)
    const job = nextJob(db)
    if (!job || !claimJob(db, job.id)) return
    busy = true
    try {
      await processJob(db, job)
    } catch (e) {
      console.error(`job ${job.id}:`, e)
    } finally {
      busy = false
    }
  }, intervalMs)
  return () => clearInterval(timer)
}
