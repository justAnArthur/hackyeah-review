import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { join } from "node:path"

export const DATA_DIR = process.env.DATA_DIR ?? join(import.meta.dir, "../.cache/data")
export const UPLOADS = join(DATA_DIR, "uploads")
mkdirSync(UPLOADS, { recursive: true })

export type JobStatus = "queued" | "running" | "waiting_quota" | "done" | "failed" | "cancelled"

export type Fields = {
  problem: string
  solution: string
  progress: string
  instructions: string
  additional: string
}

export type Submission = {
  id: string
  created_at: number
  task: string
  team: string
  title: string
  result: string
  repo: string
  fields: Fields
  deck_path: string | null
  ip_hash: string
  hidden: number
}

export type Job = {
  id: string
  status: JobStatus
  step: string
  attempts: number
  next_run_at: number
  priority: number
  error: string | null
  created_at: number
  updated_at: number
}

export function openDb(path = join(DATA_DIR, "reviews.db")) {
  const db = new Database(path, { create: true, strict: true })
  db.run("pragma journal_mode = wal")
  db.run("pragma busy_timeout = 5000")
  db.run(`create table if not exists submissions (
    id text primary key, created_at integer not null, task text not null, team text not null, title text not null,
    result text not null, repo text not null, fields text not null, deck_path text, ip_hash text not null,
    hidden integer not null default 0
  )`)
  db.run(`create table if not exists jobs (
    id text primary key, status text not null, step text not null, attempts integer not null default 0,
    next_run_at integer not null, priority integer not null default 0, error text,
    created_at integer not null, updated_at integer not null
  )`)
  db.run("create table if not exists evidence (id text primary key, pack text not null, facts text not null)")
  db.run(`create table if not exists member_results (
    id text not null, member text not null, model text not null, ok integer not null, result text, error text,
    primary key (id, member)
  )`)
  db.run("create table if not exists reviews (id text primary key, review text not null, council_version integer not null, created_at integer not null)")
  db.run("create table if not exists events (seq integer primary key autoincrement, job_id text not null, at integer not null, message text not null)")
  db.run("create table if not exists quota (day text primary key, used integer not null)")
  db.run("create table if not exists member_tries (id text not null, member text not null, tries integer not null, primary key (id, member))")
  db.run("create index if not exists jobs_pick on jobs (status, next_run_at)")
  db.run("create index if not exists submissions_repo on submissions (repo, task)")
  return db
}

export type Db = ReturnType<typeof openDb>

export function getSubmission(db: Db, id: string): Submission | null {
  const row = db.query<any, [string]>("select * from submissions where id = ?").get(id)
  return row ? { ...row, fields: JSON.parse(row.fields) } : null
}

export function getJob(db: Db, id: string): Job | null {
  return db.query<Job, [string]>("select * from jobs where id = ?").get(id)
}

export function logEvent(db: Db, jobId: string, message: string) {
  db.query("insert into events (job_id, at, message) values (?, ?, ?)").run(jobId, Date.now(), message)
}

export function events(db: Db, jobId: string, after = 0) {
  return db
    .query<{ seq: number; at: number; message: string }, [string, number]>(
      "select seq, at, message from events where job_id = ? and seq > ? order by seq",
    )
    .all(jobId, after)
}

export function updateJob(db: Db, id: string, patch: Partial<Job>) {
  const keys = Object.keys(patch)
  const set = [...keys.map(k => `${k} = $${k}`), "updated_at = $updated_at"].join(", ")
  db.query(`update jobs set ${set} where id = $id`).run({ ...patch, updated_at: Date.now(), id } as any)
}

export function queuePosition(db: Db, job: Job) {
  if (!["queued", "waiting_quota"].includes(job.status)) return 0
  const row = db
    .query<{ n: number }, [number, number, number]>(
      `select count(*) as n from jobs where status in ('queued', 'waiting_quota', 'running')
       and (priority > ? or (priority = ? and created_at < ?))`,
    )
    .get(job.priority, job.priority, job.created_at)
  return (row?.n ?? 0) + 1
}
