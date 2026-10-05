import type { BadgeColor } from "@/components/ui/badge"

export const SITE = "https://hackyeah-review.justadomainname.dev"
export const GH = "https://github.com/"

export const REPO = "justAnArthur/hackyeah-review"
// github's generated social preview; the first path segment is only a cache key
export const REPO_IMAGE = `https://opengraph.githubassets.com/2/${REPO}`

export const ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E" +
  "%3Crect width='32' height='32' rx='8' fill='%23171717'/%3E" +
  "%3Crect x='8' y='17' width='4' height='7' rx='1' fill='%23a3a3a3'/%3E" +
  "%3Crect x='14' y='9' width='4' height='15' rx='1' fill='%23fcd34d'/%3E" +
  "%3Crect x='20' y='13' width='4' height='11' rx='1' fill='%23d4d4d4'/%3E%3C/svg%3E"

export const RESULT: Record<string, { label: string; color: BadgeColor; dot?: boolean }> = {
  best: { label: "Winner", color: "amber" },
  1: { label: "1st place", color: "amber" },
  2: { label: "2nd place", color: "gray" },
  3: { label: "3rd place", color: "orange" },
  fin: { label: "Finalist", color: "gray", dot: true },
  ours: { label: "Our entry", color: "green" },
  self: { label: "Self-submitted", color: "blue" },
}

export const fmt = (n: number) => (Math.round(n * 10) / 10).toFixed(1)

export const reviewId = (task: string, repo: string) => `${task}--${repo.replace(/[^a-z0-9]/gi, "-")}`
