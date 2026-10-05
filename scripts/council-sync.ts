// sends finished comparison reviews of the finalists to the site and queues the rest there
//   ADMIN_TOKEN=… bun scripts/council-sync.ts [--site https://hackyeah-review.justadomainname.dev] [--import-only]
// only reviews made by the current council version are sent; the server skips what it already has
import { Database } from "bun:sqlite"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { type CouncilReview, loadCouncil } from "../app/server/council"
import { CACHE } from "./lib"

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: { site: { type: "string", default: "https://hackyeah-review.justadomainname.dev" }, "import-only": { type: "boolean" } },
})
const token = process.env.ADMIN_TOKEN
if (!token) {
  console.error("Set ADMIN_TOKEN to the site's admin token first.")
  process.exit(1)
}

const { version } = await loadCouncil()
const file = join(CACHE, `council-check-v${version}.db`)
const reviews: CouncilReview[] = []
if (await Bun.file(file).exists()) {
  const db = new Database(file, { readonly: true })
  for (const row of db.query<{ review: string }, []>("select review from reviews").all()) {
    const r = JSON.parse(row.review) as CouncilReview
    if (r.council.version === version) reviews.push(r)
  }
  db.close()
}

const res = await fetch(`${values.site}/api/admin/curated`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ import: reviews, enqueue: values["import-only"] ? [] : "all" }),
})
const body = await res.json().catch(() => ({}))
if (!res.ok) {
  console.error(`The site answered ${res.status}: ${JSON.stringify(body)}`)
  process.exit(1)
}
console.log(`council v${version}: sent ${reviews.length} finished reviews · ${JSON.stringify(body)}`)
