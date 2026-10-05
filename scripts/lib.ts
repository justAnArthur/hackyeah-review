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
  const files = [...new Bun.Glob("review/rubrics/*.toml").scanSync(ROOT)]
  const rubrics = await Promise.all(files.map(f => loadRubric(basename(f, ".toml"))))
  return rubrics.sort((a, b) => a.order - b.order)
}

export async function loadRubric(id: string): Promise<Rubric> {
  const path = join(ROOT, "review/rubrics", `${id}.toml`)
  if (!(await Bun.file(path).exists())) throw new Error(`no rubric for "${id}": add review/rubrics/${id}.toml first`)
  const r = (await import(path)).default
  const sum = Object.values(r.weights as Record<string, number>).reduce((a, b) => a + b, 0)
  if (sum !== 100) throw new Error(`review/rubrics/${id}.toml: weights add up to ${sum}, not 100`)
  return { id, checks: [], ...r }
}

export async function loadTeams(): Promise<Record<string, TeamTask>> {
  return Bun.file(join(ROOT, "app/web/data/teams.json")).json()
}

export async function saveTeams(teams: Record<string, TeamTask>) {
  await Bun.write(join(ROOT, "app/web/data/teams.json"), JSON.stringify(teams, null, 2) + "\n")
}

export async function loadScores(id: string): Promise<TaskScores | null> {
  const file = Bun.file(join(ROOT, "app/web/data/scores", `${id}.json`))
  return (await file.exists()) ? file.json() : null
}

export async function saveScores(id: string, s: TaskScores) {
  await Bun.write(join(ROOT, "app/web/data/scores", `${id}.json`), JSON.stringify(s, null, 2) + "\n")
}

export function weightedTotal(scores: Score[]) {
  return Math.round(scores.reduce((sum, s) => sum + (s.score * s.weight) / 10, 0) * 100) / 100
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" }

// model output and extracted documents arrive with html entities; decode before parsing or matching
export function decode(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1))
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

// model output often wraps json in prose or fences and leaves trailing commas
export function extractJson(text: string) {
  const blocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)]
  let raw = blocks.length ? blocks[blocks.length - 1][1] : text
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start === -1 || end <= start) throw new Error("no JSON object in the reply")
  raw = decode(raw.slice(start, end + 1)).replace(/,\s*([}\]])/g, "$1")
  return JSON.parse(raw)
}

type RawScore = { criterion: string; score: unknown; why?: string }

export function normalizeScores(rubric: Rubric, raw: RawScore[], label: string): Score[] {
  if (!Array.isArray(raw)) throw new Error(`${label}: "scores" must be a list`)
  const key = (s: string) => decode(String(s)).toLowerCase().replace(/\s+/g, " ").trim()
  const byKey = new Map(raw.map(s => [key(s.criterion), s]))

  return Object.keys(rubric.weights).map(name => {
    // models sometimes shorten criterion names; a short form that matches exactly one
    // criterion ("design" -> "design (visual/ui)") is that criterion, not a missing one
    const k = key(name)
    let s = byKey.get(k)
    if (!s) {
      const alias = [...byKey.keys()].filter(x => k.startsWith(x) || x.startsWith(k))
      if (alias.length === 1) s = byKey.get(alias[0])
    }
    if (!s) throw new Error(`${label}: missing criterion "${name}" (got: ${raw.map(x => x.criterion).join(", ")})`)
    const score = Number(s.score)
    if (!Number.isFinite(score) || score < 0 || score > 10) throw new Error(`${label}: "${name}" score must be 0–10`)
    return { criterion: name, weight: rubric.weights[name], score, why: decode(String(s.why ?? "")) }
  })
}

export function normalize(rubric: Rubric, p: Review): Review {
  const scores = normalizeScores(rubric, p.scores, p.repo)
  const total = weightedTotal(scores)
  if (Math.abs(total - p.weighted_total) > 0.5) {
    console.warn(`  ${p.repo}: reviewer said ${p.weighted_total}, recomputed ${total}; using ${total}`)
  }
  return { ...p, scores, weighted_total: total }
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
