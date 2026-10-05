import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Db } from "./db"

const DAILY_LIMIT = Number(process.env.DAILY_LIMIT ?? 50)
const TIMEOUT_MS = Number(process.env.MODEL_TIMEOUT_MS ?? 360_000)

// a model id is an OpenRouter id, "zai:<model>" for z.ai's general API, or "claude:<model>"
// for the local Claude Code CLI with the z.ai key as its Anthropic login (the coding plan's
// terms only allow coding tools, so glm-5.3 models come through the CLI, not raw API calls).
// only OpenRouter's free tier has a daily cap
const PROVIDERS = {
  openrouter: {
    base: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    key: process.env.OPENROUTER_API_KEY ?? "",
    keyName: "OPENROUTER_API_KEY",
    rpm: Number(process.env.REQUESTS_PER_MINUTE ?? 15),
    daily: true,
  },
  zai: {
    base: process.env.ZAI_BASE_URL ?? "https://api.z.ai/api/paas/v4",
    key: process.env.ZAI_API_KEY ?? "",
    keyName: "ZAI_API_KEY",
    rpm: Number(process.env.ZAI_REQUESTS_PER_MINUTE ?? 20),
    daily: false,
  },
  claude: {
    base: process.env.CLAUDE_BASE_URL ?? "https://api.z.ai/api/anthropic",
    // separate key so zai: can point at a mock while the CLI still authenticates
    key: process.env.CLAUDE_API_KEY ?? process.env.ZAI_API_KEY ?? "",
    keyName: "CLAUDE_API_KEY (or ZAI_API_KEY)",
    rpm: Number(process.env.CLAUDE_REQUESTS_PER_MINUTE ?? 20),
    daily: false,
  },
}

type ProviderName = keyof typeof PROVIDERS

export class QuotaExhausted extends Error {
  constructor(readonly resumeAt: number) {
    super("daily free-model quota used up")
  }
}

export class RateLimited extends Error {
  constructor(readonly retryAfterMs: number) {
    super("model is rate-limited")
  }
}

export class TransientError extends Error {}

export class FatalError extends Error {}

export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }

export type Message = { role: "system" | "user" | "assistant"; content: string | ContentPart[] }

export function route(model: string): { provider: ProviderName; model: string } {
  if (model.startsWith("claude:")) return { provider: "claude", model: model.slice(7) }
  return model.startsWith("zai:") ? { provider: "zai", model: model.slice(4) } : { provider: "openrouter", model }
}

function utcDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10)
}

export function nextUtcMidnight(now = Date.now()) {
  const d = new Date(now)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) + 60_000
}

export function quotaUsed(db: Db, now = Date.now()) {
  return db.query<{ used: number }, [string]>("select used from quota where day = ?").get(utcDay(now))?.used ?? 0
}

export function takeQuota(db: Db, limit = DAILY_LIMIT, now = Date.now()) {
  const day = utcDay(now)
  const used = quotaUsed(db, now)
  if (used >= limit) throw new QuotaExhausted(nextUtcMidnight(now))
  db.query("insert into quota (day, used) values (?, 1) on conflict (day) do update set used = used + 1").run(day)
}

const lastCall: Record<string, number> = {}

async function throttle(provider: ProviderName) {
  const gap = 60_000 / PROVIDERS[provider].rpm
  const wait = (lastCall[provider] ?? 0) + gap - Date.now()
  if (wait > 0) await Bun.sleep(wait)
  lastCall[provider] = Date.now()
}

function textOf(content: Message["content"]) {
  return typeof content === "string" ? content : content.filter(p => p.type === "text").map(p => p.text).join("\n")
}

// the CLI takes one prompt, so a repair round's messages become a transcript, and temperature /
// max_tokens have no CLI equivalents. safe mode skips CLAUDE.md and skills, restricted mode drops
// Bash and web tools, and the empty temp cwd leaves file tools nothing to reach: the repo this
// runs from holds the blind reviews the council is compared against, so members must stay blind
async function claudeChat(base: string, key: string, model: string, messages: Message[]) {
  const cwd = await mkdtemp(join(tmpdir(), "council-"))
  const system = messages.filter(m => m.role === "system").map(m => textOf(m.content)).join("\n\n")
  const transcript = messages
    .filter(m => m.role !== "system")
    .map(m => (m.role === "assistant" ? `Your earlier reply:\n\n${textOf(m.content)}` : textOf(m.content)))
    .join("\n\n---\n\n")
  const args = ["claude", "-p", "--safe-mode", "--restricted", "--model", model, "--output-format", "text"]
  if (system) args.push("--system-prompt", system)
  try {
    const proc = Bun.spawn(args, {
      cwd,
      env: {
        ...process.env,
        ANTHROPIC_BASE_URL: base,
        ANTHROPIC_AUTH_TOKEN: key,
        CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT: "1",
      },
      stdin: new Blob([transcript]),
      stdout: "pipe",
      stderr: "pipe",
    })
    const timer = setTimeout(() => proc.kill(), TIMEOUT_MS)
    const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
    const code = await proc.exited
    clearTimeout(timer)
    if (code !== 0) {
      const why = err.trim().slice(0, 300)
      if (/429|rate.?limit|quota/i.test(err)) throw new RateLimited(60_000)
      if (/\b(401|403)\b|invalid api key|authenticat|unauthorized/i.test(err)) throw new FatalError(`${model} (claude CLI): ${why}`)
      throw new TransientError(`${model} (claude CLI) exited ${code}: ${why}`)
    }
    if (!out.trim()) throw new TransientError(`${model} (claude CLI): empty reply`)
    return out
  } catch (e) {
    if (e instanceof RateLimited || e instanceof TransientError || e instanceof FatalError) throw e
    throw new FatalError(`claude CLI is not available: ${(e as Error).message}`)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}

export async function chat(db: Db, id: string, messages: Message[], opts: { temperature: number; max_tokens: number }) {
  const { provider, model } = route(id)
  const p = PROVIDERS[provider]
  if (!p.key) throw new FatalError(`${p.keyName} is not set`)
  if (p.daily) takeQuota(db)
  await throttle(provider)
  if (provider === "claude") return claudeChat(p.base, p.key, model, messages)

  let res: Response
  try {
    res = await fetch(`${p.base}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${p.key}`,
        "content-type": "application/json",
        "http-referer": "https://hackyeah-review.justadomainname.dev",
        "x-title": "HackYeah 2026 Review",
      },
      body: JSON.stringify({ model, messages, ...opts }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    throw new TransientError(`request failed: ${(e as Error).message}`)
  }

  if (res.status === 429) {
    const after = Number(res.headers.get("retry-after"))
    throw new RateLimited(Number.isFinite(after) && after > 0 ? after * 1000 : 60_000)
  }
  if (res.status >= 500 || res.status === 408) throw new TransientError(`${id}: HTTP ${res.status}`)
  if (!res.ok) throw new FatalError(`${id}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`)

  const body = (await res.json()) as any
  if (body.error) {
    const code = Number(body.error.code)
    if (code === 429) throw new RateLimited(60_000)
    throw new TransientError(`${id}: ${body.error.message ?? "provider error"}`)
  }
  const content = body.choices?.[0]?.message?.content
  if (typeof content !== "string" || !content.trim()) throw new TransientError(`${id}: empty reply`)
  return content
}
