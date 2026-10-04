import { scorecardData } from "./scripts/lib"

const ROOT = import.meta.dir
const SRC = `${ROOT}/src`
const OUT = `${ROOT}/public`
const SITE = "https://hackyeah-review.justadomainname.dev"

type Project = { repo: string; weighted_total: number }
type Task = { id: string; projects: Project[] }

const ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E" +
  "%3Crect width='32' height='32' rx='8' fill='%23171717'/%3E" +
  "%3Crect x='8' y='17' width='4' height='7' rx='1' fill='%23a3a3a3'/%3E" +
  "%3Crect x='14' y='9' width='4' height='15' rx='1' fill='%23fcd34d'/%3E" +
  "%3Crect x='20' y='13' width='4' height='11' rx='1' fill='%23d4d4d4'/%3E%3C/svg%3E"

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Geist+Mono:wght@400;500&display=swap">`

const BASE_CSS = `
html { -webkit-text-size-adjust: 100%; }
:root { padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
body { margin: 0; }
img { max-width: 100%; }
[hidden] { display: none !important; }
.item { scroll-margin-top: 16px; }

.sitebar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.brand { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; color: var(--fg); text-decoration: none; }
.brand img { width: 20px; height: 20px; border-radius: 6px; }
.nav-right { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.pages { position: relative; display: inline-flex; gap: 2px; padding: 3px; background: var(--surface-2); box-shadow: var(--shadow-2); border-radius: 10px; }
.pages a {
  position: relative; z-index: 2; height: 28px; display: flex; align-items: center; padding-inline: 12px;
  border-radius: 8px; color: var(--muted); text-decoration: none; font-size: 13px; transition: color .16s;
}
.pages a.is-hot { color: var(--fg); }
.pages a[aria-current="page"] { color: var(--fg); font-weight: 500; background: var(--surface-5); box-shadow: var(--shadow-3); }
.cta {
  height: 34px; display: inline-flex; align-items: center; padding-inline: 14px; border-radius: 10px; font-size: 13px;
  font-weight: 500; text-decoration: none; background: var(--fg); color: var(--surface-1); transition: opacity .16s;
}
.cta:hover { opacity: .88; }
.cta[aria-current="page"] { opacity: .6; pointer-events: none; }
`

const PAGES = [
  {
    src: "results.html",
    out: "index.html",
    href: "/",
    label: "Results",
    desc: "Every HackYeah 2026 finalist by task, ordered by result, with the public GitHub repo found for each team.",
  },
  {
    src: "scorecard.html",
    out: "scorecard.html",
    href: "/scorecard",
    label: "Scorecard",
    desc: "Blind repo reviews of {reviewed} HackYeah 2026 entries against each task's official weights, next to the jury's results.",
  },
]

const APPS = [
  {
    entry: "web/submit.tsx",
    out: "submit.html",
    href: "/submit",
    title: "Review my project",
    desc: "Send your HackYeah 2026 project for a free review by an AI council, scored against your task's official criteria.",
  },
  {
    entry: "web/review.tsx",
    out: "review.html",
    href: "/r",
    title: "Council review",
    desc: "A HackYeah 2026 project reviewed by an AI council against its task's official criteria.",
  },
]

function sitebar(current: string) {
  const links = PAGES.map(
    p => `<a href="${p.href}"${p.href === current ? ' aria-current="page"' : ""}>${p.label}</a>`,
  ).join("")
  const cta = `<a class="cta" href="/submit"${current === "/submit" ? ' aria-current="page"' : ""}>Review my project</a>`
  return (
    `<div class="sitebar"><a class="brand" href="/"><img src="${ICON}" alt="">HackYeah 2026 Review</a>` +
    `<div class="nav-right"><nav class="pages" aria-label="Pages">${links}</nav>${cta}</div></div>`
  )
}

function document(o: { title: string; desc: string; url?: string; head: string; body: string }) {
  const url = o.url ? `<link rel="canonical" href="${o.url}">\n<meta property="og:url" content="${o.url}">\n` : ""
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${o.title}</title>
<meta name="description" content="${o.desc}">
${url}<meta property="og:type" content="website">
<meta property="og:title" content="${o.title}">
<meta property="og:description" content="${o.desc}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="${ICON}">
<style>${BASE_CSS}</style>
${o.head.trim()}
</head>
<body>
${o.body.trim()}
</body>
</html>
`
}

function scoresMap(data: Task[]) {
  return Object.fromEntries(data.flatMap(t => t.projects.map(p => [`${t.id}|${p.repo}`, p.weighted_total])))
}

const data = await scorecardData()
const dataRaw = JSON.stringify(data).replaceAll("</", "<\\/")
const scores = JSON.stringify(scoresMap(data))
const reviewed = data.reduce((n, t) => n + t.projects.length, 0)

for (const entry of PAGES) {
  const p = { ...entry, desc: entry.desc.replace("{reviewed}", String(reviewed)) }
  const page = (await Bun.file(`${SRC}/${p.src}`).text())
    .replace("/*DATA*/", () => dataRaw)
    .replace("/*SCORES*/", () => scores)

  const title = page.match(/<title>(.*?)<\/title>/)?.[1] ?? "HackYeah 2026 Review"
  const [head, body] = page.replace(/<title>.*?<\/title>\n?/, "").split(/(?=<div class="wrap")/)

  const content = body
    .replace(/(<div class="wrap"[^>]*>)/, m => `${m}\n  ${sitebar(p.href)}`)
    .replace(/<\/script>(?![\s\S]*<\/script>)/, '\nfluid(document.querySelector(".pages"), "a");\n</script>')

  const doc = document({ title, desc: p.desc, url: SITE + p.href, head, body: content })
  await Bun.write(`${OUT}/${p.out}`, doc)
  console.log(`built public/${p.out} (${doc.length.toLocaleString("en")} bytes)`)
}

const bundle = await Bun.build({
  entrypoints: APPS.map(a => `${ROOT}/${a.entry}`),
  outdir: `${OUT}/assets`,
  naming: "[name].[ext]",
  target: "browser",
  minify: true,
})
if (!bundle.success) {
  for (const log of bundle.logs) console.error(log)
  process.exit(1)
}

const theme = await Bun.file(`${SRC}/theme.css`).text()
for (const app of APPS) {
  const name = app.entry.split("/").pop()!.replace(/\.tsx$/, "")
  const doc = document({
    title: `${app.title} · HackYeah 2026 Review`,
    desc: app.desc,
    url: app.href === "/r" ? undefined : SITE + app.href,
    head: `${FONTS}\n<style>${theme}</style>`,
    body: `<div class="wrap">\n  ${sitebar(app.href)}\n  <div id="app"></div>\n</div>\n<script type="module" src="/assets/${name}.js"></script>`,
  })
  await Bun.write(`${OUT}/${app.out}`, doc)
  console.log(`built public/${app.out} and public/assets/${name}.js`)
}

await Bun.write(`${OUT}/robots.txt`, `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`)

const today = new Date().toISOString().slice(0, 10)
await Bun.write(
  `${OUT}/sitemap.xml`,
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...PAGES.map(p => p.href), "/submit"].map(h => `  <url><loc>${SITE}${h}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>
`,
)
console.log("built public/robots.txt, public/sitemap.xml")
