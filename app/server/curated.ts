import { loadScores, loadTeams } from "../../scripts/lib"
import { TASKS } from "../web/data/results"
import type { Db } from "./db"

// a finalist with a blind review, sent through the council for comparison. it gets what a team
// would type into the form, minus the result, so the council is as blind as the original reviewer
export async function curatedSubmission(task: string, repo: string) {
  const blind = (await loadScores(task))?.projects.find(p => p.repo === repo)
  if (!blind) return null
  const entry = TASKS.find(t => t.id === task)?.entries.find(e => e.repos?.includes(repo))
  const team = (await loadTeams())[task]?.entries[repo]?.team ?? entry?.team ?? "Unknown team"
  return {
    blind,
    title: blind.project,
    team,
    fields: {
      problem: "",
      solution: entry?.desc ?? "",
      progress: "",
      instructions: entry?.demo ? `Live demo: ${entry.demo}` : "",
      additional: "",
    },
  }
}

export function curatedId(task: string, repo: string, prefix = "curated") {
  return `${prefix}--${task}--${repo.replace(/[^a-z0-9]/gi, "-")}`
}

export async function insertCurated(db: Db, id: string, task: string, repo: string) {
  const c = await curatedSubmission(task, repo)
  if (!c) return false
  db.query(
    "insert into submissions (id, created_at, task, team, title, result, repo, fields, deck_path, ip_hash, source) values (?, ?, ?, ?, ?, ?, ?, ?, null, '', 'curated')",
  ).run(id, Date.now(), task, c.team, c.title, "Not disclosed", repo, JSON.stringify(c.fields))
  return true
}

export async function allCurated() {
  const out: { task: string; repo: string }[] = []
  for (const t of TASKS) {
    for (const p of (await loadScores(t.id))?.projects ?? []) out.push({ task: t.id, repo: p.repo })
  }
  return out
}
