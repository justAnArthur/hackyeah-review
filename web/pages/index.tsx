import { HomePage } from "./home"
import { ReviewPage } from "./review"
import { SubmitPage } from "./submit"

export const PAGE_COMPONENTS = {
  home: HomePage,
  submit: SubmitPage,
  review: ReviewPage,
} as const

export type PageName = keyof typeof PAGE_COMPONENTS
