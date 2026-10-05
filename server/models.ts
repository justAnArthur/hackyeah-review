import type { Db } from "./db"

const DAILY_LIMIT = Number(process.env.DAILY_LIMIT ?? 50)
const TIMEOUT_MS = Number(process.env.MODEL_TIMEOUT_MS ?? 360_000)

// a model id is an OpenRouter id, or "zai:<model>" for z.ai's general API (not the Coding Plan endpoint,
// whose terms only allow its own list of coding tools). only OpenRouter's free tier has a daily cap
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

export async function chat(db: Db, id: string, messages: Message[], opts: { temperature: number; max_tokens: number }) {
  const { provider, model } = route(id)
  const p = PROVIDERS[provider]
  if (!p.key) throw new FatalError(`${p.keyName} is not set`)
  if (p.daily) takeQuota(db)
  await throttle(provider)

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
