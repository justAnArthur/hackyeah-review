import { ResultsPage } from "./results"
import { ReviewPage } from "./review"
import { ScorecardPage } from "./scorecard"
import { SubmitPage } from "./submit"

export const PAGE_COMPONENTS = {
  results: ResultsPage,
  scorecard: ScorecardPage,
  submit: SubmitPage,
  review: ReviewPage,
} as const

export type PageName = keyof typeof PAGE_COMPONENTS
