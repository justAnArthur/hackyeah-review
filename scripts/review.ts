import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { parseArgs } from "node:util"
import {
  CACHE,
  type Result,
  type Review,
  ROOT,
  type Rubric,
  type TaskScores,
  loadRubric,
  loadRubrics,
  loadScores,
  loadTeams,
  saveScores,
  saveTeams,
  weightedTotal,
} from "./lib"

const USAGE = `usage:
  bun scripts/review.ts tasks
  bun scripts/review.ts prompt <task> <owner/repo>... [--fresh] [--context "owner/repo=text"]...
  bun scripts/review.ts run <task> <owner/repo>... [--fresh] [--context ...] [--team "owner/repo=Team"] [--result "owner/repo=fin"] [--model opus]
  bun scripts/review.ts add <task> <review-file> [--team "owner/repo=Team"]... [--result "owner/repo=best|1|2|3|fin|ours"]...

  --fresh    no calibration anchors (use when scoring every project of a task in one run)
  results    best = single winner, 1/2/3 = podium, fin = finalist, ours = our own entry`

const CLONES = join(CACHE, "clones")
const RESULTS = new Set(["best", "1", "2", "3", "fin", "ours"])

const TOOLS = [
  "Read", "Grep", "Glob", "WebFetch",
  "Bash(ls:*)", "Bash(rg:*)", "Bash(wc:*)", "Bash(find:*)", "Bash(head:*)", "Bash(cat:*)", "Bash(du:*)",
  "Bash(git log:*)", "Bash(git -C:*)", "Bash(gh api:*)", "Bash(curl -sI:*)", "Bash(pdftotext:*)",
].join(",")

const { values: flags, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    fresh: { type: "boolean", default: false },
    context: { type: "string", multiple: true, default: [] },
    team: { type: "string", multiple: true, default: [] },
    result: { type: "string", multiple: true, default: [] },
    model: { type: "string" },
    minutes: { type: "string", default: "20" },
  },
})

function pairs(list: string[]) {
  return Object.fromEntries(
    list.map(s => {
      const i = s.indexOf("=")
      if (i < 1) throw new Error(`expected "owner/repo=value", got "${s}"`)
      return [s.slice(0, i), s.slice(i + 1)]
    }),
  )
}

function stamp() {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")
}

function cloneDir(repo: string) {
  return join(CLONES, repo.replace("/", "_"))
}

async function clone(repo: string) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`not an owner/repo: ${repo}`)
  const dir = cloneDir(repo)
  if (await Bun.file(join(dir, ".git/HEAD")).exists()) return dir
  await mkdir(CLONES, { recursive: true })
  const p = Bun.spawnSync(["git", "clone", "-q", "--depth", "100", `https://github.com/${repo}.git`, dir], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  })
  if (p.exitCode !== 0) throw new Error(`could not clone ${repo}: ${p.stderr.toString().trim()}`)
  return dir
}

function anchors(rubric: Rubric, scores: TaskScores | null, skip: Set<string>) {
  const others = (scores?.projects ?? []).filter(p => !skip.has(p.repo))
  if (!others.length) return ""
  const names = Object.keys(rubric.weights)
  const lines = others.map((p, i) => {
    const byName = Object.fromEntries(p.scores.map(s => [s.criterion, s.score]))
    const parts = names.map(n => byName[n] ?? "?").join(", ")
    return `- Entry ${String.fromCharCode(65 + i)}: ${p.weighted_total} (${parts}). ${p.verdict}`
  })
  return `
## Calibration anchors

Other entries in this task were already scored with this rubric. Keep your scale consistent with them (totals, then criteria in the order listed above):

${lines.join("\n")}
`
}

async function buildPrompt(taskId: string, repos: string[]) {
  if (!repos.length) throw new Error("give at least one owner/repo")
  const rubric = await loadRubric(taskId)
  const context = pairs(flags.context!)
  for (const repo of repos) await clone(repo)

  const projects = repos
    .map((repo, i) => `${i + 1}. \`${repo}\` → \`${cloneDir(repo)}\`${context[repo] ? `. ${context[repo]}` : ""}`)
    .join("\n")

  const vars: Record<string, string> = {
    CLONE_ROOT: CLONES,
    DEADLINE: rubric.deadline,
    MINUTES: flags.minutes!,
    TASK_ID: rubric.id,
    TASK_NAME: rubric.name,
    TASK_KIND: rubric.kind,
    BRIEF: rubric.brief.trim(),
    WEIGHTS: Object.entries(rubric.weights).map(([k, v]) => `- ${k}: ${v}`).join("\n"),
    WEIGHTS_NOTE: rubric.weights_note ? `\n${rubric.weights_note}\n` : "",
    CHECKS: rubric.checks.map(c => `- ${c}`).join("\n") || "- Nothing task-specific.",
    PROJECTS: projects,
    ANCHORS: flags.fresh ? "" : anchors(rubric, await loadScores(taskId), new Set(repos)),
  }
  const template = await Bun.file(join(ROOT, "prompts/reviewer.md")).text()
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`prompts/reviewer.md: unknown placeholder {{${k}}}`)
    return vars[k]
  })
}

function decode(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}

function extractJson(text: string) {
  const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)]
  const raw = blocks.length ? blocks[blocks.length - 1][1] : text
  return JSON.parse(decode(raw))
}

function normalize(rubric: Rubric, p: Review): Review {
  const expected = Object.keys(rubric.weights)
  const key = (s: string) => decode(s).toLowerCase().replace(/\s+/g, " ").trim()
  const byKey = new Map(p.scores.map(s => [key(s.criterion), s]))

  const scores = expected.map(name => {
    const s = byKey.get(key(name))
    if (!s) throw new Error(`${p.repo}: missing criterion "${name}" (got: ${p.scores.map(x => x.criterion).join(", ")})`)
    if (typeof s.score !== "number" || s.score < 0 || s.score > 10) throw new Error(`${p.repo}: "${name}" score must be 0–10`)
    return { criterion: name, weight: rubric.weights[name], score: s.score, why: s.why }
  })

  const total = weightedTotal(scores)
  if (Math.abs(total - p.weighted_total) > 0.5) {
    console.warn(`  ${p.repo}: reviewer said ${p.weighted_total}, recomputed ${total}; using ${total}`)
  }
  return { ...p, scores, weighted_total: total }
}

async function add(taskId: string, file: string) {
  const rubric = await loadRubric(taskId)
  const parsed = extractJson(await Bun.file(file).text())
  const incoming: Review[] = Array.isArray(parsed.projects) ? parsed.projects : [parsed]
  const teamOf = pairs(flags.team!)
  const resultOf = pairs(flags.result!)

  const scores: TaskScores = (await loadScores(taskId)) ?? { task: rubric.name, weights_used: rubric.weights, projects: [], ranking: [] }
  const teams = await loadTeams()
  const t = (teams[taskId] ??= { entries: {}, unscored: [], excluded: [] })

  for (const raw of incoming) {
    const p = normalize(rubric, raw)
    scores.projects = scores.projects.filter(x => x.repo !== p.repo)
    t.excluded = t.excluded.filter(x => x.repo !== p.repo)

    if (p.task_fit && /^no\b/i.test(p.task_fit)) {
      t.excluded.push({ repo: p.repo, project: p.project, weighted_total: p.weighted_total, reason: p.task_fit.replace(/^no:?\s*/i, "") })
      console.log(`  excluded ${p.repo}: ${p.task_fit}`)
      continue
    }
    scores.projects.push(p)

    const result = resultOf[p.repo] ?? t.entries[p.repo]?.result ?? "fin"
    if (!RESULTS.has(String(result))) throw new Error(`${p.repo}: unknown result "${result}"`)
    t.entries[p.repo] = {
      ...t.entries[p.repo],
      team: teamOf[p.repo] ?? t.entries[p.repo]?.team ?? "Unknown team",
      result: (/^\d$/.test(String(result)) ? Number(result) : result) as Result,
    }
    console.log(`  ${p.repo}: ${p.weighted_total} (${t.entries[p.repo].team}, ${t.entries[p.repo].result})`)
  }

  scores.weights_used = rubric.weights
  scores.projects.sort((a, b) => b.weighted_total - a.weighted_total)
  scores.ranking = scores.projects.map(p => p.repo)
  if (parsed.calibration_note) scores.calibration_note = decode(parsed.calibration_note)

  await saveScores(taskId, scores)
  await saveTeams(teams)
  console.log(`saved src/scores/${taskId}.json and src/teams.json; run "bun run build" to rebuild the site`)
}

async function run(taskId: string, repos: string[]) {
  const prompt = await buildPrompt(taskId, repos)
  await mkdir(join(CACHE, "reviews"), { recursive: true })
  const out = join(CACHE, "reviews", `${taskId}-${stamp()}.md`)
  console.log(`reviewing ${repos.join(", ")} for ${taskId} with Claude Code…`)

  const args = ["claude", "-p", "--allowedTools", TOOLS, "--add-dir", CLONES]
  if (flags.model) args.push("--model", flags.model)
  const p = Bun.spawn(args, { stdin: new Blob([prompt]), stdout: "pipe", stderr: "inherit" })
  const text = await new Response(p.stdout).text()
  await Bun.write(out, text)
  if ((await p.exited) !== 0) throw new Error(`claude exited with ${p.exitCode}; output kept in ${out}`)

  console.log(`review saved to ${out}`)
  await add(taskId, out)
}

async function tasks() {
  const teams = await loadTeams()
  for (const r of await loadRubrics()) {
    const s = await loadScores(r.id)
    console.log(`${r.id.padEnd(10)} ${r.name.padEnd(32)} ${String(s?.projects.length ?? 0).padStart(2)} reviewed, ${teams[r.id]?.excluded.length ?? 0} excluded`)
  }
}

const [cmd, task, ...rest] = positionals
try {
  if (cmd === "tasks") await tasks()
  else if (cmd === "prompt" && task) {
    await mkdir(join(CACHE, "prompts"), { recursive: true })
    const file = join(CACHE, "prompts", `${task}-${stamp()}.md`)
    await Bun.write(file, await buildPrompt(task, rest))
    console.log(file)
  } else if (cmd === "run" && task) await run(task, rest)
  else if (cmd === "add" && task && rest[0]) await add(task, rest[0])
  else console.log(USAGE)
} catch (e) {
  console.error(`error: ${(e as Error).message}`)
  process.exit(1)
}
