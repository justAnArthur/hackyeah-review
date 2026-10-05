import { describe, expect, test } from "bun:test"
import { extractJson, loadRubric, normalizeScores, weightedTotal } from "../../scripts/lib"
import { median, parseMember } from "../server/council"
import { getJob, openDb, queuePosition } from "../server/db"
import { builtDuringEvent, parseRepo } from "../server/evidence"
import { FatalError, QuotaExhausted, RateLimited, TransientError, cliFailure, nextUtcMidnight, route, takeQuota } from "../server/models"
import { htmlText, officeXmlText } from "../server/extract"
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

  test("maps a unique shortened criterion name", () => {
    const short = raw.map(r => ({ ...r, criterion: r.criterion === "Design (visual/UI)" ? "Design" : r.criterion }))
    expect(normalizeScores(rubric, short, "t").map(s => s.criterion)).toEqual(Object.keys(rubric.weights))
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

  test("runs reviews in upload order and skips ones waiting for a retry", () => {
    const db = openDb(":memory:")
    const upload = (id: string, at: number) =>
      db.query("insert into submissions (id, created_at, task, team, title, result, repo, fields, ip_hash) values (?, ?, 'sport', 't', 't', '', 'o/r', '{}', '')").run(id, at)
    upload("early", 1_000)
    upload("late", 2_000)
    enqueue(db, "late")
    enqueue(db, "early")
    expect(nextJob(db)?.id).toBe("early")
    expect(queuePosition(db, getJob(db, "late")!)).toBe(2)
    db.query("update jobs set next_run_at = ? where id = 'early'").run(Date.now() + 60_000)
    expect(nextJob(db)?.id).toBe("late")
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

describe("text extraction", () => {
  test("htmlText keeps the title, description and visible text, and drops scripts", () => {
    const page = htmlText(
      `<html><head><title>Will to Wheel &amp; more</title><meta name="description" content="Accessibility passport"><script>var x = "<p>hidden</p>"</script></head>` +
        `<body><nav><a href="/">Home</a></nav><h1>Check a place</h1><p>Before you leave&nbsp;home.</p><style>p{}</style></body></html>`,
    )
    expect(page.title).toBe("Will to Wheel & more")
    expect(page.description).toBe("Accessibility passport")
    expect(page.text).toBe("Home\nCheck a place\nBefore you leave home.")
  })

  test("officeXmlText reads pptx and docx text runs, one paragraph per line", () => {
    const slide = `<p:sld><a:p><a:r><a:t>Swoją Drogą</a:t></a:r></a:p><a:p><a:r><a:t>Routes &amp; places</a:t></a:r><a:r><a:t> without stairs</a:t></a:r></a:p></p:sld>`
    expect(officeXmlText(slide)).toBe("Swoją Drogą\nRoutes & places without stairs")
    expect(officeXmlText(`<w:body><w:p><w:r><w:t xml:space="preserve">Problem: </w:t></w:r><w:r><w:t>loneliness</w:t></w:r></w:p></w:body>`)).toBe("Problem: loneliness")
  })

  test("models route by prefix", () => {
    expect(route("claude:glm-5.3-flash")).toEqual({ provider: "claude", model: "glm-5.3-flash" })
    expect(route("zai:glm-4.7-flash")).toEqual({ provider: "zai", model: "glm-4.7-flash" })
    expect(route("qwen/qwen3.8-27b:free")).toEqual({ provider: "openrouter", model: "qwen/qwen3.8-27b:free" })
  })
})

describe("claude CLI failures", () => {
  test("a used-up coding plan window waits half an hour, a busy spell a minute", () => {
    const window = cliFailure("glm-5.3", 1, 'API Error: 429 {"error":{"code":"1308","message":"Usage limit reached for 5 hour. Your limit will reset at 2026-10-05 22:13:46"}}')
    expect(window).toBeInstanceOf(RateLimited)
    expect((window as RateLimited).retryAfterMs).toBe(30 * 60_000)
    const busy = cliFailure("glm-5.3", 1, "API Error: 429 Too Many Requests")
    expect((busy as RateLimited).retryAfterMs).toBe(60_000)
  })

  test("a bad key fails for good, anything else is retried", () => {
    expect(cliFailure("glm-5.3", 1, "API Error: 401 invalid api key")).toBeInstanceOf(FatalError)
    expect(cliFailure("glm-5.3", 1, "socket hang up")).toBeInstanceOf(TransientError)
  })
})
