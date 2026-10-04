import type { scorecardData } from "../../scripts/lib"
import type { CouncilReview } from "../../server/council"

export type ScorecardTask = Awaited<ReturnType<typeof scorecardData>>[number]
export type ScorecardProject = ScorecardTask["projects"][number]
export type TaskOption = { id: string; name: string; kind: string }
export type { CouncilReview }
