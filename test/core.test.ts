import { describe, expect, test } from "bun:test"
import { extractJson, loadRubric, normalizeScores, weightedTotal } from "../scripts/lib"
import { median, parseMember } from "../server/council"
import { openDb } from "../server/db"
import { builtDuringEvent, parseRepo } from "../server/evidence"
import { QuotaExhausted, nextUtcMidnight, takeQuota } from "../server/openrouter"
import { backoff, enqueue, nextJob } from "../server/queue"
import { isPrivateIp, isPublicHttps } from "../server/ssrf"

describe("extractJson", () => {
  test("reads the last fenced block", () => {
    expect(extractJson('notes\n```json\n{"a": 1}\n```\nmore\n```json\n{"a": 2}\n```')).toEqual({ a: 2 })
  })

  test("repairs trailing commas and surrounding prose", () => {
    expect(extractJson('Here you go: {"a": [1, 2,], "b": {"c": 3,},} thanks')).toEqual({ a: [1, 2], b: { c: 3 } })
  })

  test("decodes html entities before parsing", () => {
    expect(extractJson('{"criterion": "Idea &amp; Innovation"}')).toEqual({ criterion: "Idea & Innovation" })
  })

  test("throws when there is no object", () => {
    expect(() => extractJson("no json here")).toThrow()
  })
})

describe("normalizeScores", async () => {
  const rubric = await loadRubric("krakow")
  const raw = Object.keys(rubric.weights).map(c => ({ criterion: c.toUpperCase(), score: 8, why: "x" }))

  test("matches criteria case-insensitively and applies rubric weights", () => {
    const scores = normalizeScores(rubric, raw, "t")
    expect(scores.map(s => s.weight)).toEqual(Object.values(rubric.weights))
    expect(weightedTotal(scores)).toBe(80)
  })

  test("rejects a missing criterion", () => {
    expect(() => normalizeScores(rubric, raw.slice(1), "t")).toThrow(/missing criterion/)
  })

  test("rejects out-of-range scores", () => {
    expect(() => normalizeScores(rubric, [{ ...raw[0], score: 11 }, ...raw.slice(1)], "t")).toThrow(/0–10/)
  })
})

describe("council", async () => {
  const rubric = await loadRubric("sport")

  test("median handles even and odd counts", () => {
    expect(median([7, 3, 9])).toBe(7)
    expect(median([4, 8, 6, 10])).toBe(7)
  })

  test("parseMember reads a fenced reply", () => {
    const scores = Object.keys(rubric.weights).map(c => ({ criterion: c, score: 6, why: "because" }))
    const m = parseMember(rubric, "```json\n" + JSON.stringify({ task_fit: "yes", scores, build_reality: 12, strengths: ["a", 3] }) + "\n```", "A")
    expect(m.build_reality).toBe(10)
    expect(m.strengths).toEqual(["a"])
    expect(weightedTotal(m.scores)).toBe(60)
  })
})

describe("quota and queue", () => {
  test("stops at the daily limit and resumes after UTC midnight", () => {
    const db = openDb(":memory:")
    const now = Date.UTC(2026, 9, 5, 14, 0)
    for (let i = 0; i < 3; i++) takeQuota(db, 3, now)
    try {
      takeQuota(db, 3, now)
      throw new Error("expected QuotaExhausted")
    } catch (e) {
      expect(e).toBeInstanceOf(QuotaExhausted)
      expect((e as QuotaExhausted).resumeAt).toBe(nextUtcMidnight(now))
    }
    expect(() => takeQuota(db, 3, nextUtcMidnight(now))).not.toThrow()
  })

  test("backoff grows and caps at 30 minutes", () => {
    expect(backoff(0)).toBe(30_000)
    expect(backoff(1)).toBe(60_000)
    expect(backoff(20)).toBe(30 * 60_000)
  })

  test("picks queued jobs in order and skips future ones", () => {
    const db = openDb(":memory:")
    enqueue(db, "a")
    enqueue(db, "b")
    db.query("update jobs set next_run_at = ? where id = 'a'").run(Date.now() + 60_000)
    expect(nextJob(db)?.id).toBe("b")
  })
})

describe("evidence helpers", () => {
  test("parseRepo accepts common GitHub URL shapes", () => {
    expect(parseRepo("https://github.com/owner/name")).toBe("owner/name")
    expect(parseRepo("github.com/owner/name.git")).toBe("owner/name")
    expect(parseRepo("https://github.com/owner/name/tree/main/src")).toBe("owner/name")
    expect(parseRepo("https://gitlab.com/owner/name")).toBeNull()
  })

  test("builtDuringEvent flags pre-event work and squashed history", () => {
    const base = { authors: 2, first: "2026-10-03T10:00:00Z", last: "2026-10-04T08:00:00Z", during_event: 1, after_deadline: 0 }
    expect(builtDuringEvent({ ...base, count: 40, before_event: 3 })).toMatch(/^partly/)
    expect(builtDuringEvent({ ...base, count: 1, before_event: 0 })).toMatch(/^unclear/)
    expect(builtDuringEvent({ ...base, count: 40, before_event: 0 })).toMatch(/^yes/)
  })
})

describe("ssrf guard", () => {
  test("flags private and loopback addresses", () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "172.20.1.1", "192.168.1.5", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateIp(ip)).toBe(true)
    }
    for (const ip of ["8.8.8.8", "140.82.121.6", "2606:4700::1"]) expect(isPrivateIp(ip)).toBe(false)
  })

  test("only public https URLs pass", async () => {
    expect(await isPublicHttps("http://example.com")).toBe(false)
    expect(await isPublicHttps("https://127.0.0.1/admin")).toBe(false)
    expect(await isPublicHttps("https://user:pw@example.com")).toBe(false)
  })
})
