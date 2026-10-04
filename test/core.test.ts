import { describe, expect, test } from "bun:test"
import { extractJson, loadRubric, normalizeScores, weightedTotal } from "../scripts/lib"

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
