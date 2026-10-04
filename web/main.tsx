import { createElement } from "react"
import { hydrateRoot } from "react-dom/client"
import { PAGE_COMPONENTS, type PageName } from "@/pages"

// build.ts pre-renders each page and writes its name and props next to the markup
const root = document.getElementById("root")!
const name = root.dataset.page as PageName
const props = JSON.parse(document.getElementById("props")!.textContent!)

hydrateRoot(root, createElement(PAGE_COMPONENTS[name] as never, props))
