import { type Entry, type Place, type ResultsTask, TASKS } from "@/data/results"
import { reviewId } from "@/lib/site"
import type { CouncilReview } from "@/lib/types"

export type Review = CouncilReview & { link: string; result_note?: string }

export type Pending = { status: string; position: number }

// one submission from the api: a finalist or an upload, with its review once the council is done
export type ReviewEntry = Pending & {
  id: string
  task: string
  repo: string
  title: string
  team: string
  uploaded_at: number
  review: CouncilReview | null
}

export type Project = Entry & {
  id: string
  title: string
  review?: Review
  pending?: Pending
  reviewUrl?: string
  self?: boolean
}

export type Task = ResultsTask & { weights?: Record<string, number>; projects: Project[] }

export type Sort = "result" | "score"

const ORDER: Record<Place, number> = { best: 0, 1: 1, 2: 2, 3: 3 }

function withReview(p: Project, e: ReviewEntry | undefined, note?: string): Project {
  if (!e) return p
  return {
    ...p,
    reviewUrl: `/r/${e.id}`,
    review: e.review ? { ...e.review, link: `/r/${e.review.id}`, result_note: note } : undefined,
    pending: e.review ? undefined : { status: e.status, position: e.position },
  }
}

export function buildTasks(weights: Record<string, Record<string, number>>, finalists: Record<string, ReviewEntry>): Task[] {
  return TASKS.map(t => ({
    ...t,
    weights: weights[t.id],
    projects: t.entries.map(e => {
      const repo = e.repos?.[0]
      const base: Project = { ...e, id: reviewId(t.id, repo || e.team), title: e.project ?? e.team }
      return withReview(base, repo ? finalists[`${t.id}|${repo}`] : undefined)
    }),
  }))
}

export function communityProject(task: string, e: ReviewEntry): Project {
  const base: Project = { id: reviewId(`${task}--c`, e.repo), team: e.team, title: e.title, status: "found", repos: [e.repo], self: true }
  return withReview(base, e, e.review ? `Self-declared result: ${e.review.result}.` : undefined)
}

function score(p: Project) {
  return p.review?.weighted_total ?? -1
}

// winners and podium by place, then finalists, then entries that weren't finalists; within a group by score
function group(p: Project) {
  return p.place ? 0 : p.ours || p.self ? 2 : 1
}

export function sortProjects(projects: Project[], sort: Sort) {
  if (sort === "score") return [...projects].sort((a, b) => score(b) - score(a))
  return [...projects].sort((a, b) => group(a) - group(b) || (a.place && b.place ? ORDER[a.place] - ORDER[b.place] : score(b) - score(a)))
}

export function sortCommunity(entries: ReviewEntry[]) {
  const pending = entries.filter(e => !e.review).sort((a, b) => b.uploaded_at - a.uploaded_at)
  const done = entries.filter(e => e.review).sort((a, b) => b.review!.weighted_total - a.review!.weighted_total)
  return [...pending, ...done]
}
