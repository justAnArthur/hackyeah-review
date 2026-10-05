import { join } from "node:path"
import { ROOT, type Rubric, type Score, decode, extractJson, loadRubric, normalizeScores, weightedTotal } from "../scripts/lib"
import { type Db, type Submission, logEvent } from "./db"
import { type Facts, builtDuringEvent, liveDemo } from "./evidence"
import { FatalError, type Message, RateLimited, chat } from "./models"

export type Council = {
  version: number
  temperature: number
  max_tokens: number
  min_members: number
  members: string[]
  judge: string
  vision?: string
}

type MemberReview = {
  task_fit: string
  scores: Score[]
  build_reality: number
  strengths: string[]
  weaknesses: string[]
  red_flags: string[]
  verdict: string
}

type MemberRow = { member: string; model: string; ok: number; result: string | null; error: string | null }

export type CouncilScore = Score & { spread: number; members: Record<string, number> }

export type CouncilReview = {
  id: string
  repo: string
  project: string
  team: string
  task: string
  result: string
  task_fit: string
  scores: CouncilScore[]
  weighted_total: number
  build_reality: number
  source_loc: number
  has_tests: boolean
  tests: Facts["tests"]
  live_demo: string
  built_during_event: string
  strengths: string[]
  weaknesses: string[]
  red_flags: string[]
  verdict: string
  council: {
    version: number
    judge: string
    judge_ok: boolean
    members: { letter: string; model: string; ok: boolean; total: number | null; agreement: number | null; error: string | null }[]
  }
  created_at: number
}

class InvalidReply extends Error {}

class Unavailable extends Error {}

const MEMBER_MAX_TRIES = Number(process.env.MEMBER_MAX_TRIES ?? 6)

// free models are often rate-limited upstream for long stretches. the panel stays fixed,
// so after enough tries a member is skipped for this review instead of blocking the queue
async function withRateLimit<T>(db: Db, id: string, member: string, call: () => Promise<T>) {
  try {
    return await call()
  } catch (e) {
    if (!(e instanceof RateLimited)) throw e
    db.query("insert into member_tries (id, member, tries) values (?, ?, 1) on conflict (id, member) do update set tries = tries + 1")
      .run(id, member)
    const tries = db.query<{ tries: number }, [string, string]>("select tries from member_tries where id = ? and member = ?").get(id, member)!.tries
    if (tries >= MEMBER_MAX_TRIES) throw new Unavailable(`rate-limited by the provider ${tries} times`)
    throw new RateLimited(Math.min(Math.max(e.retryAfterMs, 60_000 * 2 ** (tries - 1)), 30 * 60_000))
  }
}

const LETTERS = "ABCDEFGH"

export async function loadCouncil(): Promise<Council> {
  const c = (await import(join(ROOT, "council.toml"))).default as Council
  if (!c.members?.length || !c.judge) throw new Error("council.toml needs members and a judge")
  return c
}

function fill(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`unknown placeholder {{${k}}}`)
    return vars[k]
  })
}

function strings(v: unknown, max = 6) {
  return Array.isArray(v) ? v.filter(x => typeof x === "string" && x.trim()).map(x => decode(x).trim()).slice(0, max) : []
}

function clamp10(v: unknown) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : 0
}

export function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  const m = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
  return Math.round(m * 100) / 100
}

export function parseMember(rubric: Rubric, text: string, label: string): MemberReview {
  const j = extractJson(text)
  return {
    task_fit: decode(String(j.task_fit ?? "yes")),
    scores: normalizeScores(rubric, j.scores, label),
    build_reality: clamp10(j.build_reality),
    strengths: strings(j.strengths),
    weaknesses: strings(j.weaknesses),
    red_flags: strings(j.red_flags),
    verdict: decode(String(j.verdict ?? "")),
  }
}

async function memberSystemPrompt(rubric: Rubric) {
  const template = await Bun.file(join(ROOT, "prompts/council-member.md")).text()
  return fill(template, {
    DEADLINE: rubric.deadline,
    TASK_NAME: rubric.name,
    TASK_KIND: rubric.kind,
    BRIEF: rubric.brief.trim(),
    WEIGHTS: Object.entries(rubric.weights).map(([k, v]) => `- ${k}: ${v}`).join("\n"),
    WEIGHTS_NOTE: rubric.weights_note ? `\n${rubric.weights_note}\n` : "",
    CHECKS: rubric.checks.map(c => `- ${c}`).join("\n") || "- Nothing task-specific.",
  })
}

// one repair round: the same model sees its own reply and the parse error
async function askJson<T>(db: Db, council: Council, model: string, messages: Message[], parse: (text: string) => T) {
  const opts = { temperature: council.temperature, max_tokens: council.max_tokens }
  const first = await chat(db, model, messages, opts)
  try {
    return parse(first)
  } catch (e) {
    const retry: Message[] = [
      ...messages,
      { role: "assistant", content: first.slice(0, 20_000) },
      { role: "user", content: `That reply could not be used: ${(e as Error).message}. Reply again with only the JSON object, using the exact criterion names.` },
    ]
    const second = await chat(db, model, retry, opts)
    try {
      return parse(second)
    } catch (e2) {
      throw new InvalidReply((e2 as Error).message)
    }
  }
}

function memberRows(db: Db, id: string) {
  return db.query<MemberRow, [string]>("select member, model, ok, result, error from member_results where id = ?").all(id)
}

function saveMember(db: Db, id: string, member: string, model: string, ok: boolean, result: unknown, error: string | null) {
  db.query("insert or replace into member_results (id, member, model, ok, result, error) values (?, ?, ?, ?, ?, ?)")
    .run(id, member, model, ok ? 1 : 0, result ? JSON.stringify(result) : null, error)
}

function judgeFallback(rubric: Rubric, valid: { letter: string; review: MemberReview }[], scores: CouncilScore[]) {
  const total = weightedTotal(scores)
  const closest = [...valid].sort(
    (a, b) => Math.abs(weightedTotal(a.review.scores) - total) - Math.abs(weightedTotal(b.review.scores) - total),
  )[0].review
  const why = Object.fromEntries(
    Object.keys(rubric.weights).map(name => {
      const s = scores.find(x => x.criterion === name)!
      const best = [...valid].sort(
        (a, b) =>
          Math.abs(a.review.scores.find(x => x.criterion === name)!.score - s.score) -
          Math.abs(b.review.scores.find(x => x.criterion === name)!.score - s.score),
      )[0]
      return [name, best.review.scores.find(x => x.criterion === name)!.why]
    }),
  )
  return { why, strengths: closest.strengths, weaknesses: closest.weaknesses, red_flags: closest.red_flags, verdict: closest.verdict, task_fit: closest.task_fit }
}

function numericAgreement(review: MemberReview, scores: CouncilScore[]) {
  const diffs = scores.map(s => Math.abs(review.scores.find(x => x.criterion === s.criterion)!.score - s.score))
  return Math.round((1 - diffs.reduce((a, b) => a + b, 0) / diffs.length / 10) * 100) / 100
}

export async function runCouncil(db: Db, sub: Submission, facts: Facts, pack: string): Promise<CouncilReview> {
  const [council, rubric] = await Promise.all([loadCouncil(), loadRubric(sub.task)])
  const system = await memberSystemPrompt(rubric)
  const done = new Set(memberRows(db, sub.id).map(r => r.member))

  for (const [i, model] of council.members.entries()) {
    const letter = LETTERS[i]
    if (done.has(letter)) continue
    logEvent(db, sub.id, `Member ${letter} is reviewing`)
    try {
      const review = await withRateLimit(db, sub.id, letter, () =>
        askJson(db, council, model, [{ role: "system", content: system }, { role: "user", content: pack }], text =>
          parseMember(rubric, text, `member ${letter}`),
        ),
      )
      saveMember(db, sub.id, letter, model, true, review, null)
      logEvent(db, sub.id, `Member ${letter} scored ${weightedTotal(review.scores)}`)
    } catch (e) {
      if (!(e instanceof InvalidReply || e instanceof FatalError || e instanceof Unavailable)) throw e
      saveMember(db, sub.id, letter, model, false, null, (e as Error).message)
      logEvent(db, sub.id, e instanceof Unavailable ? `Member ${letter} is unavailable (${e.message}), continuing without it` : `Member ${letter} gave no usable review`)
    }
  }

  const rows = memberRows(db, sub.id).filter(r => r.member !== "judge")
  const valid = rows.filter(r => r.ok).map(r => ({ letter: r.member, review: JSON.parse(r.result!) as MemberReview }))
  if (valid.length < council.min_members) {
    throw new FatalError(`only ${valid.length} of ${council.members.length} council members returned a usable review`)
  }

  const scores: CouncilScore[] = Object.entries(rubric.weights).map(([criterion, weight]) => {
    const members = Object.fromEntries(valid.map(v => [v.letter, v.review.scores.find(s => s.criterion === criterion)!.score]))
    const values = Object.values(members)
    return { criterion, weight, score: median(values), why: "", spread: Math.max(...values) - Math.min(...values), members }
  })

  let judged: ReturnType<typeof judgeFallback> & { agreement?: Record<string, number> }
  let judgeOk = false
  const stored = memberRows(db, sub.id).find(r => r.member === "judge")
  if (stored?.ok) {
    judged = JSON.parse(stored.result!)
    judgeOk = true
  } else if (stored) {
    judged = judgeFallback(rubric, valid, scores)
  } else {
    logEvent(db, sub.id, "The judge is writing the council review")
    const template = await Bun.file(join(ROOT, "prompts/council-judge.md")).text()
    const { languages, loc_by_language, ...shortFacts } = facts
    const prompt = fill(template, {
      MEMBER_COUNT: String(valid.length),
      TASK_NAME: rubric.name,
      MEDIANS: scores.map(s => `- ${s.criterion} (weight ${s.weight}): ${s.score} (members: ${Object.entries(s.members).map(([k, v]) => `${k} ${v}`).join(", ")})`).join("\n"),
      FACTS: JSON.stringify(shortFacts, null, 1),
      MEMBERS: valid.map(v => `### Member ${v.letter}\n${JSON.stringify(v.review)}`).join("\n\n"),
      AGREEMENT_KEYS: valid.map(v => `"${v.letter}": 0`).join(", "),
    })
    try {
      judged = await withRateLimit(db, sub.id, "judge", () => askJson(db, council, council.judge, [{ role: "user", content: prompt }], text => {
        const j = extractJson(text)
        const byName = new Map<string, string>((Array.isArray(j.criteria) ? j.criteria : []).map((c: any) => [decode(String(c.criterion)).toLowerCase().trim(), decode(String(c.why ?? ""))]))
        const why = Object.fromEntries(Object.keys(rubric.weights).map(n => [n, byName.get(n.toLowerCase()) ?? ""]))
        if (Object.values(why).filter(Boolean).length < Object.keys(why).length - 1) throw new Error("criteria explanations are missing")
        return {
          why,
          strengths: strings(j.strengths, 4),
          weaknesses: strings(j.weaknesses, 4),
          red_flags: strings(j.red_flags, 6),
          verdict: decode(String(j.verdict ?? "")),
          task_fit: decode(String(j.task_fit ?? "yes")),
          agreement: Object.fromEntries(Object.entries(j.agreement ?? {}).map(([k, v]) => [k, Math.round(clamp10(Number(v) * 10)) / 10])),
        }
      }))
      saveMember(db, sub.id, "judge", council.judge, true, judged, null)
      judgeOk = true
    } catch (e) {
      if (!(e instanceof InvalidReply || e instanceof FatalError || e instanceof Unavailable)) throw e
      saveMember(db, sub.id, "judge", council.judge, false, null, (e as Error).message)
      logEvent(db, sub.id, "The judge gave no usable review, so the closest member's text is used")
      judged = judgeFallback(rubric, valid, scores)
    }
  }

  for (const s of scores) {
    s.why = judged.why[s.criterion] || judgeFallback(rubric, valid, scores).why[s.criterion]
  }

  const redFlags = [...judged.red_flags]
  for (const hit of facts.injection_hits) redFlags.push(`Text that tries to steer the reviewers: ${hit}`)
  if (/^no\b/i.test(judged.task_fit)) redFlags.unshift(`May not be built for this task: ${judged.task_fit.replace(/^no:?\s*/i, "")}`)

  const review: CouncilReview = {
    id: sub.id,
    repo: sub.repo,
    project: sub.title,
    team: sub.team,
    task: sub.task,
    result: sub.result,
    task_fit: judged.task_fit,
    scores,
    weighted_total: weightedTotal(scores),
    build_reality: median(valid.map(v => v.review.build_reality)),
    source_loc: facts.source_loc,
    has_tests: facts.tests.files > 0 || facts.tests.cases > 0,
    tests: facts.tests,
    live_demo: liveDemo(facts.demo_checks),
    built_during_event: builtDuringEvent(facts.commits),
    strengths: judged.strengths,
    weaknesses: judged.weaknesses,
    red_flags: redFlags,
    verdict: judged.verdict,
    council: {
      version: council.version,
      judge: council.judge,
      judge_ok: judgeOk,
      members: council.members.map((model, i) => {
        const letter = LETTERS[i]
        const v = valid.find(x => x.letter === letter)
        const row = rows.find(r => r.member === letter)
        return {
          letter,
          model,
          ok: Boolean(v),
          total: v ? weightedTotal(v.review.scores) : null,
          agreement: v ? (judged.agreement?.[letter] ?? numericAgreement(v.review, scores)) : null,
          error: row?.error ?? null,
        }
      }),
    },
    created_at: Date.now(),
  }

  db.query("insert or replace into reviews (id, review, council_version, created_at) values (?, ?, ?, ?)")
    .run(sub.id, JSON.stringify(review), council.version, review.created_at)
  logEvent(db, sub.id, `Done: ${review.weighted_total} / 100`)
  return review
}
