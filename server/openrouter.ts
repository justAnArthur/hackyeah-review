import type { Db } from "./db"

const BASE = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1"
const KEY = process.env.OPENROUTER_API_KEY ?? ""
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT ?? 50)
const RPM = Number(process.env.REQUESTS_PER_MINUTE ?? 15)
const TIMEOUT_MS = Number(process.env.MODEL_TIMEOUT_MS ?? 240_000)

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

export type Message = { role: "system" | "user" | "assistant"; content: string }

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

let lastCall = 0

async function throttle() {
  const gap = 60_000 / RPM
  const wait = lastCall + gap - Date.now()
  if (wait > 0) await Bun.sleep(wait)
  lastCall = Date.now()
}

export async function chat(db: Db, model: string, messages: Message[], opts: { temperature: number; max_tokens: number }) {
  if (!KEY) throw new FatalError("OPENROUTER_API_KEY is not set")
  takeQuota(db)
  await throttle()

  let res: Response
  try {
    res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${KEY}`,
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
  if (res.status >= 500 || res.status === 408) throw new TransientError(`${model}: HTTP ${res.status}`)
  if (!res.ok) throw new FatalError(`${model}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`)

  const body = (await res.json()) as any
  if (body.error) {
    const code = Number(body.error.code)
    if (code === 429) throw new RateLimited(60_000)
    throw new TransientError(`${model}: ${body.error.message ?? "provider error"}`)
  }
  const content = body.choices?.[0]?.message?.content
  if (typeof content !== "string" || !content.trim()) throw new TransientError(`${model}: empty reply`)
  return content
}
