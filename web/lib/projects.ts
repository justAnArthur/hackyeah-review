import { type Entry, type Place, type ResultsTask, TASKS } from "@/data/results"
import { reviewId } from "@/lib/site"
import type { CouncilReview, ScorecardProject, ScorecardTask } from "@/lib/types"

export type Review = ScorecardProject & { link?: string; tests_label?: string }

// one finalist, with its blind review when the repo was public
export type Project = Entry & {
  id: string
  title: string
  review?: Review
  self?: boolean
}

export type Task = ResultsTask & {
  weights?: Record<string, number>
  projects: Project[]
  scored?: ScorecardTask
}

export type Sort = "result" | "score"

const ORDER: Record<Place, number> = { best: 0, 1: 1, 2: 2, 3: 3 }

const slug = (s: string) => s.replace(/[^a-z0-9]/gi, "-")

function toProject(task: string, e: Entry, scored?: ScorecardTask): Project {
  const review = scored?.projects.find(p => e.repos?.includes(p.repo))
  const repo = review?.repo ?? e.repos?.[0]
  return {
    ...e,
    id: repo ? reviewId(task, repo) : `${task}--${slug(e.team)}`,
    title: e.project ?? e.team,
    review,
  }
}

export function communityProject(task: string, r: CouncilReview): Project {
  return {
    id: reviewId(`${task}--c`, r.repo),
    team: r.team,
    title: r.project,
    status: "found",
    repos: [r.repo],
    self: true,
    review: {
      ...r,
      result: "fin",
      result_note: `Self-declared result: ${r.result}. Reviewed by council v${r.council.version}.`,
      link: `/r/${r.id}`,
      tests_label: r.tests.cases ? `${r.tests.cases} cases` : r.has_tests ? `${r.tests.files} files` : "None",
    },
  }
}

export function mergeTasks(data: ScorecardTask[]): Task[] {
  return TASKS.map(t => {
    const scored = data.find(s => s.id === t.id)
    return { ...t, scored, weights: scored?.weights, projects: t.entries.map(e => toProject(t.id, e, scored)) }
  })
}

const score = (p: Project) => p.review?.weighted_total ?? -1

// winners and podium by place, then finalists, then entries that weren't finalists; within a group by review score
const group = (p: Project) => (p.place ? 0 : p.ours || p.self ? 2 : 1)

export function sortProjects(projects: Project[], sort: Sort) {
  if (sort === "score") return [...projects].sort((a, b) => score(b) - score(a))
  return [...projects].sort((a, b) => group(a) - group(b) || (a.place && b.place ? ORDER[a.place] - ORDER[b.place] : score(b) - score(a)))
}

export function reviewRank(task: Task, p: Project) {
  const ranked = task.scored?.projects ?? []
  const i = ranked.findIndex(r => r.repo === p.review?.repo)
  return i < 0 ? null : { rank: i + 1, of: ranked.length }
}
