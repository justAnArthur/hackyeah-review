import { TASKS } from "../web/data/results"
import type { Db } from "./db"

// a finalist with public code, queued for a council review. it gets what a team would type into
// the form (the description and the demo link), minus the jury's result
export function curatedSubmission(task: string, repo: string) {
  const entry = TASKS.find(t => t.id === task)?.entries.find(e => e.repos?.includes(repo))
  if (!entry) return null
  return {
    title: entry.project ?? entry.team,
    team: entry.team,
    fields: {
      problem: "",
      solution: entry.desc ?? "",
      progress: "",
      instructions: entry.demo ? `Live demo: ${entry.demo}` : "",
      additional: "",
    },
  }
}

export function curatedId(task: string, repo: string, prefix = "curated") {
  return `${prefix}--${task}--${repo.replace(/[^a-z0-9]/gi, "-")}`
}

export function insertCurated(db: Db, id: string, task: string, repo: string) {
  const c = curatedSubmission(task, repo)
  if (!c) return false
  db.query(
    "insert into submissions (id, created_at, task, team, title, result, repo, fields, deck_path, ip_hash, source) values (?, ?, ?, ?, ?, ?, ?, ?, null, '', 'curated')",
  ).run(id, Date.now(), task, c.team, c.title, "Not disclosed", repo, JSON.stringify(c.fields))
  return true
}

// every finalist with public code; an entry with several repos is reviewed on its first, main one
export function allCurated() {
  return TASKS.flatMap(t => t.entries.filter(e => e.repos?.length).map(e => ({ task: t.id, repo: e.repos![0] })))
}
