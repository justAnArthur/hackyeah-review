import { join, normalize } from "node:path"
import { ROOT } from "../scripts/lib"

const PORT = Number(process.env.PORT ?? 3000)
const PUBLIC = join(ROOT, "public")

async function staticFile(pathname: string) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "")
  const base = join(PUBLIC, clean)
  if (!base.startsWith(PUBLIC)) return null
  for (const candidate of [base, `${base}.html`, join(base, "index.html")]) {
    const file = Bun.file(candidate)
    if ((await file.exists()) && !candidate.endsWith("/")) return file
  }
  return null
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    const file = await staticFile(url.pathname === "/" ? "/index" : url.pathname)
    return file ? new Response(file) : new Response("Not found", { status: 404 })
  },
})

console.log(`hackyeah-review listening on http://localhost:${server.port}`)
