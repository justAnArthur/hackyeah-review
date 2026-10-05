// builds .cache/council-check/compare.html from the council-check databases plus the blind
// reviews. the panel score is recomputed per project as the median of the three-member
// panel (every stored member except zai:glm-4.7-flash), so v5 runs show as the v6 panel
// bun scripts/council-report.ts
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { memberSystemPrompt } from "../app/server/council"
import { DECK_PAGE_PROMPT, SHOT_PROMPT } from "../app/server/evidence"
import { CACHE, loadRubric, loadRubrics, ROOT } from "./lib"

const EXCLUDED = "zai:glm-4.7-flash"
const SHORT: Record<string, string> = {
  "claude:glm-5.3-flash": "glm-5.3-flash",
  "dots-studio/dots-3-note-preview:free": "dots",
  "inclusionai/ling-3.0-flash-sante:free": "ling",
  [EXCLUDED]: "glm-4.7 (off panel)",
}

type Stored = {
  repo: string
  task: string
  project: string
  weighted_total: number
  created_at: number
  scores: { criterion: string; weight: number; members: Record<string, number> }[]
  council: { version: number; judge_ok: boolean; members: { letter: string; model: string; ok: boolean; total: number | null }[] }
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 100) / 100
}

// newest stored review per submission id across every shard db
const reviews = new Map<string, Stored>()
const failures: { task: string; repo: string; error: string }[] = []
for (const dbFile of [...new Bun.Glob("council-check*.db").scanSync(CACHE)].filter(f => f.endsWith(".db"))) {
  // read-write open: the shards were killed mid-run, so their -wal journals need recovery
  const db = new Database(join(CACHE, dbFile))
  for (const { id, review, created_at } of db.query("select id, review, created_at from reviews").all() as any[]) {
    const parsed = JSON.parse(review) as Stored
    if (!reviews.has(id) || created_at > reviews.get(id)!.created_at) reviews.set(id, { ...parsed, created_at })
  }
  for (const j of db.query("select id, error from jobs where status = 'failed'").all() as any[]) {
    const s = db.query("select task, repo from submissions where id = ?").get(j.id) as any
    if (s && !reviews.has(j.id)) failures.push({ task: s.task, repo: s.repo, error: j.error ?? "failed" })
  }
  db.close()
}

const rubrics = await loadRubrics()
const blindOf = (task: string, repo: string) => {
  const file = Bun.file(join(CACHE, "../app/web/data/scores", `${task}.json`))
  return file.exists().then(async ok => (ok ? ((await file.json()) as any).projects.find((p: any) => p.repo === repo) : null))
}

type Row = { project: string; task: string; repo: string; blind: any; panel: { total: number; n: number; scores: { criterion: string; weight: number; score: number; members: Record<string, number> }[] }; judge: boolean; version: number; allMembers: { letter: string; model: string; ok: boolean; total: number | null }[] }
const rows: Row[] = []
for (const r of reviews.values()) {
  const meta = new Map(r.council.members.map(m => [m.letter, m.model]))
  const scores = r.scores.map(s => {
    const members = Object.fromEntries(Object.entries(s.members).filter(([l]) => meta.get(l) !== EXCLUDED))
    return { criterion: s.criterion, weight: s.weight, score: median(Object.values(members)), members }
  })
  rows.push({
    project: r.project,
    task: r.task,
    repo: r.repo,
    blind: await blindOf(r.task, r.repo),
    panel: { total: Math.round(scores.reduce((sum, s) => sum + (s.score * s.weight) / 10, 0) * 100) / 100, n: Math.min(...scores.map(s => Object.keys(s.members).length)), scores },
    judge: r.council.judge_ok,
    version: r.council.version,
    allMembers: r.council.members,
  })
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toFixed(1)
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
const br = (s: string) => esc(s).split("\n").join("<br>")
const bar = (v: number, cls: string) => `<b class="score ${cls}">${fmt(v)}%</b>`
const chip = (gap: number) =>
  `<span class="chip ${Math.abs(gap) <= 5 ? "ok" : Math.abs(gap) <= 10 ? "warn" : "off"}">${gap >= 0 ? "+" : ""}${fmt(gap)}</span>`

const compared = rows.filter(r => r.blind && r.panel.n >= 2)
const gaps = compared.map(r => r.panel.total - r.blind.weighted_total)
const meanGap = gaps.length ? gaps.reduce((a, b) => a + Math.abs(b), 0) / gaps.length : 0
const within5 = gaps.filter(g => Math.abs(g) <= 5).length
const byTask = rubrics.map(r => compared.filter(x => x.task === r.id)).filter(xs => xs.length >= 2)
const top1 = byTask.filter(
  xs => xs.reduce((a, b) => (a.blind.weighted_total >= b.blind.weighted_total ? a : b)).repo === xs.reduce((a, b) => (a.panel.total >= b.panel.total ? a : b)).repo,
).length

const sections = rubrics
  .map(r => {
    const xs = rows.filter(x => x.task === r.id).sort((a, b) => (b.blind?.weighted_total ?? 0) - (a.blind?.weighted_total ?? 0))
    const failed = failures.filter(f => f.task === r.id)
    if (!xs.length && !failed.length) return ""
    return `<section><h2>${esc(r.name)}</h2><table>
      <thead><tr><th>project</th><th>original review</th><th>council</th><th>difference</th><th>council models</th></tr></thead><tbody>
      ${xs.map(x => {
        const members = x.allMembers
          .map(m => `<span class="m ${m.ok ? (m.model === EXCLUDED ? "off" : "") : "skip"}">${SHORT[m.model] ?? m.model}${m.ok ? ` ${fmt(m.total ?? 0)}` : " skip"}</span>`)
          .join("")
        const crit = x.panel.scores
          .map(s => {
            const b = x.blind?.scores.find((y: any) => y.criterion === s.criterion)?.score
            const d = s.score - (b ?? 0)
            return `<tr><td>${esc(s.criterion)} <small>${s.weight}%</small></td><td>${b === undefined ? "–" : fmt(b)}</td><td>${fmt(s.score)}</td><td>${d >= 0 ? "+" : ""}${fmt(d)}</td><td><small>${Object.values(s.members).join(" / ")}</small></td></tr>`
          })
          .join("")
        return `<tr><td><b>${esc(x.project)}</b><small>${esc(x.repo)}</small></td>
          <td>${bar(x.blind?.weighted_total ?? 0, "blind")}</td>
          <td>${bar(x.panel.total, "council")}</td>
          <td>${x.blind ? chip(x.panel.total - x.blind.weighted_total) : "–"}</td>
          <td>${members}<small class="judge">${x.judge ? "judge ✓" : "judge fallback"} · ran as v${x.version}${x.panel.n < 3 ? ` · ${x.panel.n} members only` : ""}</small></td></tr>
          <tr class="detail"><td colspan="5"><details><summary>show the five criteria (idea, category fit, usability, design, completeness)</summary><table>
          <thead><tr><th>criterion</th><th>blind</th><th>council</th><th>Δ</th><th>member scores</th></tr></thead>${crit}</table></details></td></tr>`
      }).join("")}
      ${failed.map(f => `<tr class="failed"><td><b>${esc(f.repo)}</b><small>${esc(f.task)}</small></td><td colspan="4">no review — ${esc(f.error.slice(0, 90))}</td></tr>`).join("")}
      </tbody></table></section>`
  })
  .join("")

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Council vs blind reviews · HackYeah 2026</title><style>
  :root { color-scheme: light dark; --ink: #1f2937; --paper: #fff; --dim: #6b7280; --line: rgba(0,0,0,.08); --wash: rgba(0,0,0,.05); }
  @media (prefers-color-scheme: dark) { :root { --ink: #e5e7eb; --paper: #141414; --dim: #9ca3af; --line: rgba(255,255,255,.1); --wash: rgba(255,255,255,.06); } }
  body { font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; margin: 0 auto; max-width: 980px; padding: 32px 20px 60px; color: var(--ink); background: var(--paper); }
  h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 16px; margin: 28px 0 8px; color: var(--ink); }
  .sub { color: var(--dim); margin-bottom: 20px; max-width: 72ch; }
  .stats { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
  .stat { border: 1px solid var(--line); border-radius: 10px; padding: 8px 14px; }
  .stat b { font-size: 18px; display: block; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 6px 10px 6px 0; vertical-align: middle; border-bottom: 1px solid var(--line); }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--dim); }
  td small { display: block; color: var(--dim); font-weight: 400; font-size: 11px; }
  .score { font-size: 15px; font-variant-numeric: tabular-nums; }
  .score.blind { color: var(--dim); } .score.council { color: #16a34a; }
  .chip { display: inline-block; border-radius: 999px; padding: 1px 9px; font-size: 12px; font-weight: 600; }
  .chip.ok { background: #dcfce7; color: #166534; } .chip.warn { background: #fef3c7; color: #92400e; } .chip.off { background: #fee2e2; color: #991b1b; }
  .m { display: inline-block; margin-right: 6px; font-size: 12px; } .m.skip { color: var(--dim); text-decoration: line-through; } .m.off { color: var(--dim); }
  .judge { display: block; }
  .legend { display: grid; gap: 6px; margin: 0 0 18px; color: var(--dim); font-size: 12.5px; }
  .legend .bar { width: 40px; }
  tr.failed td { color: var(--dim); } tr.detail td { border-bottom: none; padding-top: 0; }
  details summary { cursor: pointer; color: var(--dim); font-size: 12px; margin: 6px 0; }
  pre { background: var(--wash); color: var(--ink); border-radius: 10px; padding: 14px; font-size: 12px; line-height: 1.55; overflow-x: auto; white-space: normal; }
  @media (prefers-color-scheme: dark) { .chip.ok { background: #14532d; color: #bbf7d0; } .chip.warn { background: #78350f; color: #fde68a; } .chip.off { background: #7f1d1d; color: #fecaca; } }
</style></head><body>
<h1>Council vs blind reviews</h1>
<p class="sub">Every project below was scored twice: once by the original blind Claude review, and once by our 3-model council (glm-5.3-flash, dots, ling — median per criterion, glm-5.3 writing the verdict) reading the same public material: repo, decks, docs, demo page, screenshots. The council never saw the original scores. The greyed model ran in some reviews but is excluded from the panel. Generated ${new Date().toISOString().slice(0, 10)}.</p>
<div class="legend">
  <div><b class="score blind">74.5%</b> original blind Claude review</div>
  <div><b class="score council">78.0%</b> council score</div>
  <div><span class="chip ok">+3.5</span> difference: green within 5 pts, amber within 10, red further</div>
  <div><span class="m">model 71</span> each council model's own total · <span class="m skip">skip</span> model unavailable · <span class="m off">grey</span> excluded from the panel</div>
</div>
<div class="stats">
  <div class="stat"><b>${compared.length} / 25</b>projects reviewed so far</div>
  <div class="stat"><b>${fmt(meanGap)}</b>points off on average</div>
  <div class="stat"><b>${within5} / ${compared.length}</b>within ±5 of the original</div>
  <div class="stat"><b>${top1} / ${byTask.length}</b>tasks: same winner picked</div>
</div>
${sections}
<section id="prompts"><h2>The prompts the council sees</h2>
<p class="sub">The member prompt below is the real one, filled in for the Sport &amp; Healthcare task. Every member of every task gets this same shape: rules, the task brief with the official criteria and weights, task-specific checks, and calibration anchors (other entries' blind scores, never the entry under review). The evidence pack — measured facts, the form, deck text, README, docs, demo page, screenshot descriptions, file tree, manifests, source samples — arrives as the member's single user message.</p>
<details><summary>member system prompt (Sport &amp; Healthcare, filled)</summary><pre>${br(await memberSystemPrompt(await loadRubric("sport"), "sport", "uteg-labs/just-mate"))}</pre></details>
<details><summary>judge prompt template</summary><pre>${br(await Bun.file(join(ROOT, "review/prompts/council-judge.md")).text())}</pre></details>
<details><summary>screenshot describer prompt</summary><pre>${br(SHOT_PROMPT)}</pre></details>
<details><summary>image-only deck describer prompt</summary><pre>${br(DECK_PAGE_PROMPT)}</pre></details>
</section>
</body></html>`

await Bun.write(join(CACHE, "council-check", "compare.html"), html)
console.log(`${compared.length}/25 compared · mean abs gap ${fmt(meanGap)} · within ±5: ${within5} · top-1 match ${top1}/${byTask.length}`)
console.log(join(CACHE, "council-check", "compare.html"))
