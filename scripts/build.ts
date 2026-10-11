import { readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { $ } from "bun"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { ROOT, loadRubrics, modelName } from "./lib"
import { PAGE_COMPONENTS, type PageName } from "../app/web/pages"
import { ICON, SITE } from "../app/web/lib/site"

const OUT = `${ROOT}/public`
const ARCHIVE = `${ROOT}/app/web/data/archive`

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Geist+Mono:wght@400;500&display=swap">`

// the theme follows the OS setting; set before paint so dark mode never flashes
const THEME = `<script>try{const m=matchMedia("(prefers-color-scheme: dark)");const f=()=>document.documentElement.classList.toggle("dark",m.matches);f();m.addEventListener("change",f)}catch(e){}</script>`

const rubrics = await loadRubrics()
const tasks = rubrics.map(r => ({ id: r.id, name: r.name, kind: r.kind }))
const weights = Object.fromEntries(rubrics.map(r => [r.id, r.weights]))
const council = (await import("../review/council.toml")).default as { members: string[]; judge: string; version: number }
const panel = { members: council.members.map(modelName), judge: modelName(council.judge), version: council.version }

// the reviews snapshot the static site is built from (scripts/archive.ts refreshes it)
const finalists = await Bun.file(`${ARCHIVE}/finalists.json`).json()
const community = await Bun.file(`${ARCHIVE}/community.json`).json()
const reviewIds = readdirSync(`${ARCHIVE}/reviews`).map(f => f.slice(0, -5)).sort()
const reviews = Object.fromEntries(await Promise.all(reviewIds.map(async id => [id, await Bun.file(`${ARCHIVE}/reviews/${id}.json`).json()]))) as Record<
  string,
  { submission: { title: string; team: string; task: string; repo: string }; review: { verdict: string } | null }
>

const PAGES: { name: PageName; out: string; href?: string; title: string; desc: string; props: object; noindex?: boolean }[] = [
  {
    name: "home",
    out: "index.html",
    href: "/",
    title: "HackYeah 2026 Results",
    desc: "Every HackYeah 2026 finalist by task, ordered by result, with its public GitHub repo and an AI council score against the task's official criteria and weights.",
    props: { weights, panel, finalists, community },
  },
  {
    name: "submit",
    out: "submit.html",
    href: "/submit",
    title: "Submissions closed",
    desc: "HackYeah 2026 ended and the review form is closed; the council reviews stay online as an archive.",
    props: {},
  },
  // one pre-rendered page per review; reviews themselves are static, so their data is baked in
  ...reviewIds.map(id => ({
    name: "review" as PageName,
    out: `r/${id}/index.html`,
    href: `/r/${id}`,
    title: `${reviews[id].submission.title} · Council review`,
    desc: reviews[id].review?.verdict.slice(0, 180) ?? "A HackYeah 2026 project reviewed by an AI council against its task's official criteria.",
    props: { status: reviews[id], tasks },
  })),
  // unlisted: no href means no canonical and no sitemap entry; noindex keeps it out of search
  {
    name: "mentors",
    out: "mentors.html",
    title: "Mentors",
    desc: "The HackYeah 2026 mentors with the LinkedIn profile found for each.",
    props: {},
    noindex: true,
  },
]

await $`rm -rf ${OUT}`

const bundle = await Bun.build({
  entrypoints: [`${ROOT}/app/web/main.tsx`],
  outdir: `${OUT}/assets`,
  naming: "[name]-[hash].[ext]",
  target: "browser",
  minify: true,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
})
if (!bundle.success) {
  for (const log of bundle.logs) console.error(log)
  process.exit(1)
}
const script = `/assets/${basename(bundle.outputs[0].path)}`

const tmpCss = join(tmpdir(), "hackyeah-review-app.css")
await $`bunx @tailwindcss/cli -i ${ROOT}/app/web/app.css -o ${tmpCss} --minify`.cwd(ROOT).quiet()
const css = await Bun.file(tmpCss).text()
const style = `/assets/app-${Bun.hash(css).toString(36)}.css`
await Bun.write(`${OUT}${style}`, css)

// titles and descriptions now carry team-supplied text, so they're escaped for html and attributes
const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;").replaceAll(/\s+/g, " ")

for (const p of PAGES) {
  const html = renderToString(createElement(PAGE_COMPONENTS[p.name] as never, p.props))
  const props = JSON.stringify(p.props).replaceAll("<", "\\u003c")
  const url = p.href ? `<link rel="canonical" href="${SITE}${p.href}">\n<meta property="og:url" content="${SITE}${p.href}">\n` : ""
  const robots = p.noindex ? `<meta name="robots" content="noindex">\n` : ""
  const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(p.title)} · HackYeah 2026 Review</title>
<meta name="description" content="${esc(p.desc)}">
${robots}${url}<meta property="og:type" content="website">
<meta property="og:title" content="${esc(p.title)} · HackYeah 2026 Review">
<meta property="og:description" content="${esc(p.desc)}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="${ICON}">
${FONTS}
<link rel="stylesheet" href="${style}">
${THEME}
<script type="module" src="${script}"></script>
</head>
<body>
<div id="root" data-page="${p.name}">${html}</div>
<script id="props" type="application/json">${props}</script>
</body>
</html>
`
  await Bun.write(`${OUT}/${p.out}`, doc)
  console.log(`built public/${p.out} (${doc.length.toLocaleString("en")} bytes)`)
}
console.log(`built ${script} and ${style} (${css.length.toLocaleString("en")} bytes)`)

// github pages serves this custom domain; the dns record is the cutover switch
await Bun.write(`${OUT}/CNAME`, `${new URL(SITE).host}\n`)

// a review that was hidden or removed has no page of its own; pages serves this for any unknown path
await Bun.write(
  `${OUT}/404.html`,
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Not found · HackYeah 2026 Review</title>
<meta name="robots" content="noindex">
<link rel="icon" href="${ICON}">
${FONTS}
<link rel="stylesheet" href="${style}">
${THEME}
</head>
<body>
<div style="max-width:760px;margin:0 auto;padding:56px 16px;font-size:13px;line-height:1.6">
<h1 style="font-size:22px;font-weight:500;margin:0 0 8px">Not found</h1>
<p style="color:#71717a">This page doesn't exist — the review may have been removed or the link is wrong.</p>
<p><a href="/">Back to the results</a></p>
</div>
</body>
</html>
`,
)

// the old scorecard links redirect home; browsers keep the #fragment across a meta refresh
await Bun.write(
  `${OUT}/scorecard/index.html`,
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=/">
<link rel="canonical" href="${SITE}/">
<title>HackYeah 2026 Results</title>
</head>
<body>
<p><a href="/">Go to the results</a></p>
</body>
</html>
`,
)
console.log("built public/CNAME, public/404.html, public/scorecard/index.html")

await Bun.write(`${OUT}/robots.txt`, `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`)

const today = new Date().toISOString().slice(0, 10)
const urls = PAGES.filter(p => p.href).map(p => `  <url><loc>${SITE}${p.href}</loc><lastmod>${today}</lastmod></url>`)
await Bun.write(
  `${OUT}/sitemap.xml`,
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`,
)
console.log("built public/robots.txt, public/sitemap.xml")
