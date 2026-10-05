// builds .cache/council-check/compare.html: one council version against the blind reviews.
// only reviews made by that version count (newest per project), so runs of different panels never mix
//   bun scripts/council-report.ts [--version 7]
import { Database } from "bun:sqlite"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { type CouncilReview, loadCouncil, memberSystemPrompt } from "../app/server/council"
import { DECK_PAGE_PROMPT, SHOT_PROMPT } from "../app/server/evidence"
import { CACHE, ROOT, type Review, loadRubric, loadRubrics, loadScores } from "./lib"

const { values } = parseArgs({ args: process.argv.slice(2), options: { version: { type: "string" } } })
const council = await loadCouncil()
const version = Number(values.version ?? council.version)

const reviews = new Map<string, CouncilReview>()
const failures = new Map<string, { task: string; repo: string; error: string }>()
for (const file of new Bun.Glob("council-check*.db").scanSync(CACHE)) {
  const db = new Database(join(CACHE, file))
  for (const row of db.query<{ id: string; review: string }, []>("select id, review from reviews").all()) {
    const r = JSON.parse(row.review) as CouncilReview
    if (r.council.version !== version) continue
    if ((reviews.get(row.id)?.created_at ?? 0) < r.created_at) reviews.set(row.id, r)
  }
  if (file === `council-check-v${version}.db`) {
    const failed = db
      .query<{ id: string; task: string; repo: string; error: string | null }, []>(
        "select j.id, s.task, s.repo, j.error from jobs j join submissions s on s.id = j.id where j.status = 'failed'",
      )
      .all()
    for (const f of failed) failures.set(f.id, { task: f.task, repo: f.repo, error: f.error ?? "failed" })
  }
  db.close()
}
for (const id of reviews.keys()) failures.delete(id)

type Row = { review: CouncilReview; blind: Review; gap: number }
const rubrics = await loadRubrics()
const tasks: { id: string; name: string; rows: Row[]; failed: { repo: string; error: string }[]; blindCount: number }[] = []
for (const rubric of rubrics) {
  const blind = (await loadScores(rubric.id))?.projects ?? []
  const rows = [...reviews.values()]
    .filter(r => r.task === rubric.id)
    .flatMap(r => {
      const b = blind.find(p => p.repo === r.repo)
      return b ? [{ review: r, blind: b, gap: r.weighted_total - b.weighted_total }] : []
    })
    .sort((a, b) => b.blind.weighted_total - a.blind.weighted_total)
  const failed = [...failures.values()].filter(f => f.task === rubric.id)
  tasks.push({ id: rubric.id, name: rubric.name, rows, failed, blindCount: blind.length })
}

const all = tasks.flatMap(t => t.rows)
const total = tasks.reduce((n, t) => n + t.blindCount, 0)
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const mae = mean(all.map(r => Math.abs(r.gap)))
const bias = mean(all.map(r => r.gap))
const within = (d: number) => all.filter(r => Math.abs(r.gap) <= d).length

function ranks(xs: number[]) {
  const order = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
  const out = new Array<number>(xs.length)
  for (let i = 0; i < order.length; ) {
    let j = i
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++
    for (let k = i; k <= j; k++) out[order[k][1]] = (i + j) / 2 + 1
    i = j + 1
  }
  return out
}

// spearman's rho: does the council order projects the way the blind reviews do
function spearman(a: number[], b: number[]) {
  if (a.length < 3) return null
  const [ra, rb] = [ranks(a), ranks(b)]
  const [ma, mb] = [mean(ra), mean(rb)]
  const cov = mean(ra.map((x, i) => (x - ma) * (rb[i] - mb)))
  const sd = (r: number[], m: number) => Math.sqrt(mean(r.map(x => (x - m) ** 2)))
  return cov / (sd(ra, ma) * sd(rb, mb))
}

const rho = spearman(all.map(r => r.review.weighted_total), all.map(r => r.blind.weighted_total))
const contested = tasks.filter(t => t.rows.length >= 2)
const sameTop = contested.filter(t => {
  const top = (key: (r: Row) => number) => t.rows.reduce((a, b) => (key(b) > key(a) ? b : a)).review.repo
  return top(r => r.blind.weighted_total) === top(r => r.review.weighted_total)
}).length

const fmt = (n: number) => (Math.round(n * 10) / 10).toFixed(1)
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${fmt(Math.abs(n))}`
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const tone = (gap: number) => (Math.abs(gap) <= 5 ? "ok" : Math.abs(gap) <= 10 ? "warn" : "off")
const short = (model: string) => model.replace(/^(claude|zai):/, "").replace(/^[\w-]+\//, "").replace(/:free$/, "")

function projectRow(r: Row) {
  const members = r.review.council.members
    .map(m => `<span class="member">${esc(short(m.model))} <b>${m.total === null ? "–" : fmt(m.total)}</b></span>`)
    .join("")
  const criteria = r.review.scores
    .map(s => {
      const b = r.blind.scores.find(x => x.criterion.toLowerCase() === s.criterion.toLowerCase())?.score
      const d = b === undefined ? null : s.score - b
      return `<tr><td>${esc(s.criterion)} <span class="dim">${s.weight}%</span></td><td class="num">${b === undefined ? "–" : fmt(b)}</td><td class="num">${fmt(s.score)}</td>
        <td class="num">${d === null ? "–" : `<span class="delta ${tone(d * 2)}">${signed(d)}</span>`}</td><td class="dim num">${Object.values(s.members).join(" · ")}</td></tr>`
    })
    .join("")
  return `<tr>
    <td><div class="project">${esc(r.review.project)}</div><div class="dim mono">${esc(r.review.repo)}</div></td>
    <td class="num">${fmt(r.blind.weighted_total)}</td>
    <td class="num strong">${fmt(r.review.weighted_total)}</td>
    <td class="num"><span class="chip ${tone(r.gap)}">${signed(r.gap)}</span></td>
    <td>${members}</td>
  </tr>
  <tr class="more"><td colspan="5"><details><summary>Criteria</summary>
    <table class="inner"><thead><tr><th>Criterion</th><th class="num">Blind</th><th class="num">Council</th><th class="num">Δ</th><th class="num">Members</th></tr></thead><tbody>${criteria}</tbody></table>
    <p class="verdict"><b>Council verdict.</b> ${esc(r.review.verdict)}</p>
    <p class="verdict"><b>Blind verdict.</b> ${esc(r.blind.verdict)}</p>
  </details></td></tr>`
}

const sections = tasks
  .filter(t => t.rows.length || t.failed.length)
  .map(
    t => `<section><h2>${esc(t.name)} <span class="dim">${t.rows.length} of ${t.blindCount} compared</span></h2>
    <table><thead><tr><th>Project</th><th class="num">Blind</th><th class="num">Council</th><th class="num">Gap</th><th>Members</th></tr></thead><tbody>
    ${t.rows.map(projectRow).join("")}
    ${t.failed.map(f => `<tr class="failed"><td><div class="mono">${esc(f.repo)}</div></td><td colspan="4">No council review: ${esc(f.error.slice(0, 160))}</td></tr>`).join("")}
    </tbody></table></section>`,
  )
  .join("")

const guides = (
  await Promise.all(
    rubrics.map(async r => `<details><summary>Reviewing guide · ${esc(r.name)}</summary><pre>${esc(await Bun.file(join(ROOT, "review/guides", `${r.id}.md`)).text())}</pre></details>`),
  )
).join("")

const panel = council.members.map(short).join(", ")
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Council v${version} vs blind reviews</title>
<style>
  :root { --bg: #fafafa; --card: #fff; --fg: #171717; --dim: #737373; --line: #e5e5e5;
    --ok: #166534; --ok-bg: #dcfce7; --warn: #92400e; --warn-bg: #fef3c7; --off: #991b1b; --off-bg: #fee2e2; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root { --bg: #171717; --card: #1e1e1e; --fg: #f5f5f5; --dim: #a3a3a3; --line: #2e2e2e;
    --ok: #bbf7d0; --ok-bg: #14532d; --warn: #fde68a; --warn-bg: #78350f; --off: #fecaca; --off-bg: #7f1d1d; color-scheme: dark; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.55 Inter, ui-sans-serif, system-ui, sans-serif; }
  main { max-width: 960px; margin: 0 auto; padding: 48px 16px 72px; }
  h1 { font-size: 24px; font-weight: 600; margin: 0 0 6px; letter-spacing: -.01em; }
  h2 { font-size: 16px; font-weight: 600; margin: 36px 0 10px; }
  h2 .dim { font-weight: 400; font-size: 13px; margin-left: 6px; }
  p { margin: 0 0 10px; max-width: 75ch; }
  .dim { color: var(--dim); } .mono { font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 24px 0; }
  .stat { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
  .stat b { display: block; font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .stat span { color: var(--dim); font-size: 12px; }
  .note { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; margin: 16px 0; }
  .note ul { margin: 6px 0 0; padding-left: 18px; } .note li { margin: 4px 0; max-width: 80ch; }
  table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  th, td { padding: 9px 12px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); }
  th { font-size: 11px; font-weight: 500; color: var(--dim); text-transform: uppercase; letter-spacing: .04em; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .strong { font-weight: 600; } .project { font-weight: 500; }
  .member { display: inline-block; margin: 0 10px 2px 0; font-size: 12px; color: var(--dim); } .member b { color: var(--fg); font-weight: 500; }
  .chip, .delta { display: inline-block; border-radius: 999px; padding: 1px 8px; font-size: 12px; font-weight: 600; }
  .delta { padding: 0 6px; font-weight: 500; }
  .ok { background: var(--ok-bg); color: var(--ok); } .warn { background: var(--warn-bg); color: var(--warn); } .off { background: var(--off-bg); color: var(--off); }
  tr.more td { padding-top: 0; } tr.failed td { color: var(--dim); }
  details summary { cursor: pointer; color: var(--dim); font-size: 12px; padding: 4px 0; }
  table.inner { border: 0; margin: 6px 0 10px; } table.inner td, table.inner th { padding: 5px 8px; }
  .verdict { font-size: 13px; color: var(--dim); } .verdict b { color: var(--fg); font-weight: 500; }
  pre { white-space: pre-wrap; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; font-size: 12px; }
  @media (max-width: 640px) { th:nth-child(5), td:nth-child(5) { display: none; } }
</style></head><body><main>
<h1>Council v${version} vs blind reviews</h1>
<p class="dim">HackYeah 2026 Review · generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC</p>
<p>Each project here was scored twice against its task's official weights: first by a blind Claude Opus review (an agent with the whole repo, its decks, docs and screenshots, which did not run the code), then by the council: ${esc(panel)} score an evidence pack built from the same public material, the median per criterion is the result, and ${esc(short(council.judge))} writes the verdict.</p>

<div class="stats">
  <div class="stat"><b>${all.length} / ${total}</b><span>projects compared</span></div>
  <div class="stat"><b>${fmt(mae)}</b><span>mean absolute gap, points of 100</span></div>
  <div class="stat"><b>${signed(bias)}</b><span>mean signed gap (council − blind)</span></div>
  <div class="stat"><b>${within(5)} / ${all.length}</b><span>within ±5 points (±10: ${within(10)})</span></div>
  <div class="stat"><b>${rho === null ? "–" : rho.toFixed(2)}</b><span>rank correlation (Spearman)</span></div>
  <div class="stat"><b>${sameTop} / ${contested.length}</b><span>tasks with the same top project</span></div>
</div>

<div class="note"><b>How to read this</b><ul>
  <li>The blind review is a reference, not ground truth: it is one model's careful reading, and the jury, who saw the pitches, often disagreed with it.</li>
  <li>The council is told neither the jury result nor this project's blind score. It does get calibration anchors: the blind scores and verdicts of two or three <i>other</i> entries in the same task, to keep it on the same scale. Agreement measured here is therefore not fully independent of the blind reviews.</li>
  <li>The evidence pack holds measured repo facts, the project description, extracted deck and doc text, demo page text and screenshot descriptions, up to about 75k tokens. The council reads that pack once; the blind reviewer could open any file.</li>
  <li>Gap colours: green within 5 points, amber within 10, red beyond. Criterion deltas use half those bands, on the 0–10 scale.</li>
</ul></div>

${sections || "<p>No reviews for this version yet. Run <span class='mono'>bun scripts/council-check.ts --all</span>.</p>"}

<section><h2>Prompts and reviewing guides</h2>
<p class="dim">Each task's guide travels inside that task's member prompt, together with the brief, official weights, task checks and the calibration anchors. The evidence pack is the member's single user message.</p>
${guides}
<details><summary>Member system prompt, filled for Sport &amp; Healthcare</summary><pre>${esc(await memberSystemPrompt(await loadRubric("sport"), "sport", "uteg-labs/just-mate"))}</pre></details>
<details><summary>Judge prompt template</summary><pre>${esc(await Bun.file(join(ROOT, "review/prompts/council-judge.md")).text())}</pre></details>
<details><summary>Screenshot describer prompt</summary><pre>${esc(SHOT_PROMPT)}</pre></details>
<details><summary>Image-only deck describer prompt</summary><pre>${esc(DECK_PAGE_PROMPT)}</pre></details>
</section>
</main></body></html>
`

const out = join(CACHE, "council-check", "compare.html")
await Bun.write(out, html)
console.log(`council v${version}: ${all.length}/${total} compared · mean abs gap ${fmt(mae)} · signed ${signed(bias)} · within ±5 ${within(5)} · rho ${rho === null ? "–" : rho.toFixed(2)} · same top ${sameTop}/${contested.length}`)
console.log(out)
