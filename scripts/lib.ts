import { basename, join } from "node:path"

export const ROOT = join(import.meta.dir, "..")
export const CACHE = join(ROOT, ".cache")

export type Rubric = {
  id: string
  name: string
  kind: string
  order: number
  deadline: string
  brief: string
  weights: Record<string, number>
  weights_note?: string
  checks: string[]
}

export type Result = "best" | 1 | 2 | 3 | "fin" | "ours"

export type Score = { criterion: string; weight: number; score: number; why: string }

export type Review = {
  repo: string
  project: string
  task_fit?: string
  scores: Score[]
  weighted_total: number
  build_reality: number
  source_loc: number
  has_tests: boolean
  live_demo: string
  built_during_event: string
  strengths: string[]
  weaknesses: string[]
  red_flags: string[]
  verdict: string
}

export type TaskScores = {
  task: string
  weights_used: Record<string, number>
  projects: Review[]
  ranking: string[]
  calibration_note?: string
}

export type Excluded = { repo: string; project: string; weighted_total: number; reason: string }

export type TeamTask = {
  ours?: boolean
  entries: Record<string, { team: string; result: Result; note?: string }>
  unscored: { team: string; result: Result }[]
  excluded: Excluded[]
}

export async function loadRubrics() {
  const files = [...new Bun.Glob("rubrics/*.toml").scanSync(ROOT)]
  const rubrics = await Promise.all(files.map(f => loadRubric(basename(f, ".toml"))))
  return rubrics.sort((a, b) => a.order - b.order)
}

export async function loadRubric(id: string): Promise<Rubric> {
  const path = join(ROOT, "rubrics", `${id}.toml`)
  if (!(await Bun.file(path).exists())) throw new Error(`no rubric for "${id}": add rubrics/${id}.toml first`)
  const r = (await import(path)).default
  const sum = Object.values(r.weights as Record<string, number>).reduce((a, b) => a + b, 0)
  if (sum !== 100) throw new Error(`rubrics/${id}.toml: weights add up to ${sum}, not 100`)
  return { id, checks: [], ...r }
}

export async function loadTeams(): Promise<Record<string, TeamTask>> {
  return Bun.file(join(ROOT, "src/teams.json")).json()
}

export async function saveTeams(teams: Record<string, TeamTask>) {
  await Bun.write(join(ROOT, "src/teams.json"), JSON.stringify(teams, null, 2) + "\n")
}

export async function loadScores(id: string): Promise<TaskScores | null> {
  const file = Bun.file(join(ROOT, "src/scores", `${id}.json`))
  return (await file.exists()) ? file.json() : null
}

export async function saveScores(id: string, s: TaskScores) {
  await Bun.write(join(ROOT, "src/scores", `${id}.json`), JSON.stringify(s, null, 2) + "\n")
}

export function weightedTotal(scores: Score[]) {
  return Math.round(scores.reduce((sum, s) => sum + (s.score * s.weight) / 10, 0) * 100) / 100
}

export async function scorecardData() {
  const [rubrics, teams] = await Promise.all([loadRubrics(), loadTeams()])
  const tasks = []

  for (const r of rubrics) {
    const scores = await loadScores(r.id)
    if (!scores?.projects.length) continue
    const t = teams[r.id] ?? { entries: {}, unscored: [], excluded: [] }

    const projects = scores.projects
      .map(p => {
        const e = t.entries[p.repo]
        return { ...p, result: e?.result ?? "fin", team: e?.team ?? "Unknown team", ...(e?.note ? { result_note: e.note } : {}) }
      })
      .sort((a, b) => b.weighted_total - a.weighted_total)

    tasks.push({
      id: r.id,
      name: r.name,
      kind: t.ours ? `${r.kind} · our task` : r.kind,
      weights: r.weights,
      projects,
      unscored: t.unscored,
      excluded: t.excluded,
      note: scores.calibration_note ?? "",
    })
  }
  return tasks
}
