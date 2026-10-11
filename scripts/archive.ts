// refreshes the static site's data snapshot from a running server, so the build can bake it in:
//   bun scripts/archive.ts [--site https://hackyeah-review.justadomainname.dev]
// every finalist and community entry is fetched whole, so the snapshot only needs the base calls
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { ROOT } from "./lib"

const site = process.argv.includes("--site") ? process.argv[process.argv.indexOf("--site") + 1] : "https://hackyeah-review.justadomainname.dev"
const out = join(ROOT, "app/web/data/archive")

const finalists = await (await fetch(`${site}/api/finalists`)).json()
const community = await (await fetch(`${site}/api/community`)).json()
const entries = [...Object.values(finalists), ...Object.values(community).flat()] as { id: string; review: unknown }[]

const pending = entries.filter(e => !e.review)
if (pending.length) {
  console.error(`${pending.length} reviews are still pending (${pending.map(e => e.id).join(", ")}); snapshot anyway? they would show as unfinished on the static site`)
  process.exit(1)
}

mkdirSync(join(out, "reviews"), { recursive: true })
writeFileSync(join(out, "finalists.json"), JSON.stringify(finalists, null, 1) + "\n")
writeFileSync(join(out, "community.json"), JSON.stringify(community, null, 1) + "\n")
for (const e of entries) {
  const status = await (await fetch(`${site}/api/reviews/${e.id}`)).json()
  writeFileSync(join(out, "reviews", `${e.id}.json`), JSON.stringify(status, null, 1) + "\n")
}
console.log(`snapshotted ${entries.length} reviews from ${site} into app/web/data/archive/`)
