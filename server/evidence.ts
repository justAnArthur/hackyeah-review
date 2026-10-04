import { mkdtemp, readdir, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, extname, join, relative } from "node:path"
import type { Submission } from "./db"
import { checkUrl } from "./ssrf"

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? ""
const MAX_TARBALL = 150 * 1024 * 1024
const PACK_BUDGET = 110_000
const SAMPLE_BUDGET = 40_000

// 3 Oct 11:00 CEST and 4 Oct 11:00 CEST
export const EVENT_START = Date.UTC(2026, 9, 3, 9, 0)
export const EVENT_DEADLINE = Date.UTC(2026, 9, 4, 9, 0)

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".nuxt", ".output", "out", "vendor", "third_party", "third-party",
  "target", "Pods", "oh_modules", ".venv", "venv", "env", "__pycache__", "coverage", "Library", "Temp", ".gradle",
  ".idea", ".vscode", "bin", "obj", ".turbo", ".expo", "public/build", "android/build", "android/app/build",
])

const LANGS: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript", ".mts": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript",
  ".mjs": "JavaScript", ".vue": "Vue", ".svelte": "Svelte", ".py": "Python", ".rs": "Rust", ".go": "Go",
  ".java": "Java", ".kt": "Kotlin", ".swift": "Swift", ".dart": "Dart", ".cs": "C#", ".cpp": "C++", ".cc": "C++",
  ".c": "C", ".h": "C/C++ header", ".ets": "ArkTS", ".rb": "Ruby", ".php": "PHP", ".sql": "SQL", ".sol": "Solidity",
  ".html": "HTML", ".css": "CSS", ".scss": "CSS", ".sh": "Shell", ".move": "Move",
}

const LOCKFILES = /(^|\/)(package-lock\.json|bun\.lockb?|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|uv\.lock|Gemfile\.lock|composer\.lock|go\.sum)$/
const GENERATED = /\.(min\.js|bundle\.js|map|g\.dart|pb\.go|generated\.\w+)$|(^|\/)generated\//
const TEST_PATH = /(^|\/)(tests?|__tests__|spec|e2e)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$|_test\.(go|py)$|(^|\/)test_[^/]*\.py$|Test\.(java|kt|cs)$|\.test\.ets$/
const TEST_CASE = /\b(it|test)\s*\(\s*["'`]|\bdef test_\w+|#\[(tokio::)?test\]|@Test\b|\bfunc Test\w+\(/g
const IMAGE = /\.(png|jpe?g|webp|gif)$/i
const INJECTION = /(ignore (all |any )?(the )?(previous|prior|above) (instructions|prompts|rules)|disregard (the )?(previous|above)|you are (now )?(an? |the )?(judge|reviewer|jury)|(give|award|score) (this|us|it|the project) (a )?(10|ten|full|maximum|perfect)|(10|ten) ?\/ ?10 (score|points)|system prompt)/i

export type Facts = {
  repo: string
  description: string
  default_branch: string
  created_at: string
  stars: number
  languages: Record<string, number>
  commits: { count: number; authors: number; first: string | null; last: string | null; before_event: number; during_event: number; after_deadline: number }
  source_loc: number
  loc_by_language: Record<string, number>
  files: number
  tests: { files: number; cases: number }
  screenshots: number
  deck: string
  demo_checks: { url: string; status: string }[]
  injection_hits: string[]
}

export type Evidence = { pack: string; facts: Facts }

export function parseRepo(input: string) {
  const m = input.trim().match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#].*)?$/i)
  if (!m) return null
  return `${m[1]}/${m[2]}`
}

async function gh(path: string) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "hackyeah-review",
      ...(GITHUB_TOKEN ? { authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (res.status === 404) throw new Error("repo not found or not public")
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`)
  return res.json() as Promise<any>
}

// a quick check at submit time; GitHub outages or rate limits shouldn't block the form
export async function checkRepo(repo: string) {
  try {
    const meta = await gh(`/repos/${repo}`)
    return meta.private ? "That repo is private. Make it public so it can be reviewed." : null
  } catch (e) {
    return /not found|not public/.test((e as Error).message) ? "That repo doesn't exist or isn't public." : null
  }
}

async function commitStats(repo: string) {
  const commits: any[] = []
  for (let page = 1; page <= 5; page++) {
    const batch = await gh(`/repos/${repo}/commits?per_page=100&page=${page}`)
    commits.push(...batch)
    if (batch.length < 100) break
  }
  const dates = commits.map(c => Date.parse(c.commit?.committer?.date ?? c.commit?.author?.date)).filter(Number.isFinite)
  const authors = new Set(commits.map(c => c.author?.login ?? c.commit?.author?.email))
  return {
    count: commits.length,
    authors: authors.size,
    first: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
    last: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
    before_event: dates.filter(d => d < EVENT_START).length,
    during_event: dates.filter(d => d >= EVENT_START && d <= EVENT_DEADLINE).length,
    after_deadline: dates.filter(d => d > EVENT_DEADLINE).length,
  }
}

async function downloadRepo(repo: string, branch: string) {
  const dir = await mkdtemp(join(tmpdir(), "hyr-"))
  const tarball = join(dir, "repo.tar.gz")
  const res = await fetch(`https://codeload.github.com/${repo}/tar.gz/${encodeURIComponent(branch)}`, {
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) throw new Error(`could not download the repo (HTTP ${res.status})`)
  if (Number(res.headers.get("content-length") ?? 0) > MAX_TARBALL) throw new Error("repo is larger than 150 MB")
  await Bun.write(tarball, res)
  if ((await stat(tarball)).size > MAX_TARBALL) throw new Error("repo is larger than 150 MB")

  const tar = Bun.spawnSync(["tar", "-xzf", tarball, "-C", dir])
  if (tar.exitCode !== 0) throw new Error("could not unpack the repo")
  await rm(tarball)
  const [top] = (await readdir(dir, { withFileTypes: true })).filter(d => d.isDirectory())
  return { tmp: dir, root: join(dir, top.name) }
}

type FileInfo = { path: string; size: number }

async function walk(root: string, limit = 20_000) {
  const files: FileInfo[] = []
  async function go(dir: string) {
    if (files.length >= limit) return
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      const rel = relative(root, full)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !SKIP_DIRS.has(rel) && !entry.name.startsWith(".")) await go(full)
      } else if (entry.isFile()) {
        files.push({ path: rel, size: (await stat(full)).size })
      }
    }
  }
  await go(root)
  return files
}

async function readText(path: string, max = 512 * 1024) {
  const file = Bun.file(path)
  if (file.size > max) return null
  const buf = new Uint8Array(await file.arrayBuffer())
  if (buf.subarray(0, 8000).includes(0)) return null
  return new TextDecoder().decode(buf)
}

function tree(files: FileInfo[], depth = 3, max = 120) {
  const dirs = new Map<string, number>()
  for (const f of files) {
    const parts = f.path.split("/")
    for (let i = 1; i <= Math.min(parts.length, depth); i++) {
      const key = parts.slice(0, i).join("/") + (i < parts.length ? "/" : "")
      dirs.set(key, (dirs.get(key) ?? 0) + 1)
    }
  }
  return [...dirs.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, max)
    .map(([p, n]) => `${"  ".repeat(p.split("/").filter(Boolean).length - 1)}${basename(p)}${p.endsWith("/") ? `/ (${n})` : ""}`)
    .join("\n")
}

function centrality(path: string) {
  const name = basename(path).toLowerCase()
  let score = 0
  if (/^(main|index|app|server|lib|core|engine|service|api|handler|routes?|program)\./.test(name)) score += 3
  if (/(^|\/)src\//.test(path)) score += 1
  return score - path.split("/").length * 0.2
}

function untrusted(source: string, text: string) {
  return `<untrusted source="${source}">\n${text.trim()}\n</untrusted>`
}

function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}\n[… truncated]` : text
}

function deckText(path: string | null) {
  if (!path) return { text: "", status: "not provided" }
  const p = Bun.spawnSync(["pdftotext", "-l", "10", "-layout", path, "-"])
  if (p.exitCode !== 0) return { text: "", status: "uploaded, but the text could not be extracted" }
  const text = p.stdout.toString().replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  return { text, status: text ? "uploaded" : "uploaded, but it contains no text (images only)" }
}

const HOSTING = /\.(vercel\.app|netlify\.app|onrender\.com|github\.io|pages\.dev|fly\.dev|railway\.app|herokuapp\.com|web\.app|firebaseapp\.com|azurewebsites\.net|expo\.dev|streamlit\.app|hf\.space|trycloudflare\.com)(\/|$)/i
const NOT_DEMO = /github\.com|githubusercontent|shields\.io|youtu\.?be|\.(png|jpe?g|gif|svg|webp|pdf)$/i

function urlsIn(text: string) {
  return (text.match(/https:\/\/[^\s)<>"'`\]]+/g) ?? []).map(u => u.replace(/[.,;:]+$/, ""))
}

// the form is the team's own pointer to the demo; from the README only hosted apps count
function demoUrls(sub: Submission, readme: string) {
  const fromForm = urlsIn(`${sub.fields.instructions}\n${sub.fields.additional}`).filter(u => !NOT_DEMO.test(u))
  const fromReadme = urlsIn(readme).filter(u => HOSTING.test(u))
  return [...new Set([...fromForm, ...fromReadme])].slice(0, 3)
}

export async function buildEvidence(sub: Submission): Promise<Evidence> {
  const meta = await gh(`/repos/${sub.repo}`)
  if (meta.private) throw new Error("repo is private")
  const [languages, commits] = await Promise.all([gh(`/repos/${sub.repo}/languages`), commitStats(sub.repo)])
  const { tmp, root } = await downloadRepo(sub.repo, meta.default_branch)

  try {
    const files = await walk(root)
    const locByLang: Record<string, number> = {}
    let sourceLoc = 0
    let testFiles = 0
    let testCases = 0
    let screenshots = 0
    const sources: (FileInfo & { text: string })[] = []
    const docs: string[] = []
    let readme = ""
    let aiDocs = ""
    const injection = new Set<string>()

    for (const f of files) {
      if (IMAGE.test(f.path)) {
        screenshots++
        continue
      }
      const lower = f.path.toLowerCase()
      if (!readme && /^readme(\.md|\.txt)?$/i.test(f.path)) readme = (await readText(join(root, f.path))) ?? ""
      if (lower.endsWith(".md") && !/^readme/i.test(basename(f.path)) && docs.length < 40) {
        const text = (await readText(join(root, f.path), 200_000)) ?? ""
        docs.push(`${f.path}: ${text.match(/^#\s+(.+)$/m)?.[1] ?? ""}`)
        if (/ai[_-]?(workflow|features|disclosure|usage)/i.test(f.path)) aiDocs += `\n## ${f.path}\n${clip(text, 2500)}`
      }

      const lang = LANGS[extname(f.path).toLowerCase()]
      if (!lang || LOCKFILES.test(f.path) || GENERATED.test(f.path)) continue
      const text = await readText(join(root, f.path))
      if (text === null) continue
      const lines = text.split("\n").filter(l => l.trim()).length
      locByLang[lang] = (locByLang[lang] ?? 0) + lines
      sourceLoc += lines

      const m = text.match(INJECTION)
      if (m) injection.add(`${f.path}: "${m[0]}"`)

      if (TEST_PATH.test(f.path)) {
        testFiles++
        testCases += text.match(TEST_CASE)?.length ?? 0
      } else if (!["HTML", "CSS"].includes(lang)) {
        sources.push({ ...f, text })
      }
    }

    for (const [source, text] of [["readme", readme], ...Object.entries(sub.fields)] as [string, string][]) {
      const m = text.match(INJECTION)
      if (m) injection.add(`${source}: "${m[0]}"`)
    }

    const deck = deckText(sub.deck_path)
    const dm = deck.text.match(INJECTION)
    if (dm) injection.add(`deck: "${dm[0]}"`)

    const demoChecks = await Promise.all(demoUrls(sub, readme).map(async url => ({ url, status: await checkUrl(url) })))

    sources.sort((a, b) => centrality(b.path) - centrality(a.path) || b.size - a.size)
    let sampleBudget = SAMPLE_BUDGET
    const samples: string[] = []
    for (const s of sources.slice(0, 30)) {
      if (sampleBudget < 1500) break
      const chunk = clip(s.text, Math.min(5000, sampleBudget))
      samples.push(`### ${s.path}\n${chunk}`)
      sampleBudget -= chunk.length
    }

    const facts: Facts = {
      repo: sub.repo,
      description: meta.description ?? "",
      default_branch: meta.default_branch,
      created_at: meta.created_at,
      stars: meta.stargazers_count,
      languages,
      commits,
      source_loc: sourceLoc,
      loc_by_language: locByLang,
      files: files.length,
      tests: { files: testFiles, cases: testCases },
      screenshots,
      deck: deck.status,
      demo_checks: demoChecks,
      injection_hits: [...injection].slice(0, 10),
    }

    const manifests = files
      .filter(f => /(^|\/)(package\.json|pyproject\.toml|requirements\.txt|Cargo\.toml|go\.mod|oh-package\.json5|module\.json5|build-profile\.json5|pubspec\.yaml|Anchor\.toml)$/.test(f.path))
      .slice(0, 6)
    const manifestText = (await Promise.all(manifests.map(async f => `### ${f.path}\n${clip((await readText(join(root, f.path), 100_000)) ?? "", 1500)}`))).join("\n\n")

    const pack = [
      `# Evidence pack for ${sub.repo}`,
      "## Measured facts (collected by a script, reliable)",
      "```json",
      JSON.stringify(facts, null, 1),
      "```",
      "## Submission form (written by the team)",
      untrusted("form", [
        `Project title: ${sub.title}`,
        `Team: ${sub.team}`,
        `Self-declared result: ${sub.result}`,
        `What problem are you solving with the idea?\n${sub.fields.problem}`,
        `What is your solution?\n${sub.fields.solution}`,
        `What's done so far and goal of your project\n${sub.fields.progress}`,
        `Instructions on how to open project\n${sub.fields.instructions}`,
        `Additional field for presentation / files\n${sub.fields.additional}`,
      ].join("\n\n")),
      "## Presentation (text of the uploaded PDF, first 10 pages)",
      deck.text ? untrusted("deck", clip(deck.text, 12_000)) : `(${deck.status})`,
      "## README",
      readme ? untrusted("readme", clip(readme, 9000)) : "(no README)",
      "## File tree (vendored and build folders skipped)",
      tree(files),
      "## Other docs (path: first heading)",
      docs.join("\n") || "(none)",
      aiDocs ? `## AI workflow and disclosure docs\n${untrusted("ai-docs", aiDocs)}` : "",
      "## Manifests",
      manifestText ? untrusted("manifests", manifestText) : "(none found)",
      "## Source samples (most central files first, truncated)",
      untrusted("source", samples.join("\n\n")),
    ]
      .filter(Boolean)
      .join("\n\n")

    return { pack: clip(pack, PACK_BUDGET), facts }
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

export function builtDuringEvent(c: Facts["commits"]) {
  if (!c.count) return "unclear: no commits found"
  const range = `${c.count} commits by ${c.authors} author${c.authors === 1 ? "" : "s"}, ${c.first?.slice(0, 16).replace("T", " ")} to ${c.last?.slice(0, 16).replace("T", " ")} UTC`
  if (c.before_event > 0) return `partly: ${c.before_event} commit${c.before_event === 1 ? "" : "s"} before the event; ${range}`
  if (c.count <= 2) return `unclear: ${range}, so the history is squashed`
  return `yes: ${range}`
}

export function liveDemo(checks: Facts["demo_checks"]) {
  if (!checks.length) return "none found in the form or README"
  return checks.map(c => `${c.url} (${c.status})`).join("; ")
}
