import { HomePage } from "./home"
import { MentorsPage } from "./mentors"
import { ReviewPage } from "./review"
import { SubmitPage } from "./submit"

export const PAGE_COMPONENTS = {
  home: HomePage,
  submit: SubmitPage,
  review: ReviewPage,
  mentors: MentorsPage,
} as const

export type PageName = keyof typeof PAGE_COMPONENTS
