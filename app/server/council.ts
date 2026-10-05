import { join } from "node:path"
import { ROOT, type Rubric, type Score, decode, extractJson, loadRubric, normalizeScores, weightedTotal } from "../../scripts/lib"
import { type Db, type Submission, logEvent } from "./db"
import { type Facts, builtDuringEvent, liveDemo, withoutSources } from "./evidence"
import { FatalError, type Message, ProviderRefused, RateLimited, TransientError, chat } from "./models"

export type Council = {
  version: number
  temperature: number
  max_tokens: number
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
  // read the pack without quoted code, after its provider refused the full text
  trimmed?: boolean
}

type MemberRow = { member: string; model: string; ok: number; result: string | null; error: string | null; version: number }

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
    members: { letter: string; model: string; ok: boolean; total: number | null; agreement: number | null; error: string | null; trimmed?: boolean }[]
  }
  created_at: number
}

class InvalidReply extends Error {}

// the panel never shrinks, so a garbled reply is retried with the job (finished members are kept);
// only a permanent failure, such as a bad key or a model that is gone, ends the review
function unusable(who: string, e: unknown) {
  const message = `${who} gave no usable review: ${(e as Error).message}`
  return e instanceof InvalidReply ? new TransientError(message) : new FatalError(message)
}

// every project must face the identical panel: a rate-limited member is waited for, never
// skipped. the tries counter only escalates the backoff (60 s doubling, capped at 30 min)
async function withRateLimit<T>(db: Db, id: string, member: string, call: () => Promise<T>) {
  try {
    return await call()
  } catch (e) {
    if (!(e instanceof RateLimited)) throw e
    db.query("insert into member_tries (id, member, tries) values (?, ?, 1) on conflict (id, member) do update set tries = tries + 1")
      .run(id, member)
    const tries = db.query<{ tries: number }, [string, string]>("select tries from member_tries where id = ? and member = ?").get(id, member)!.tries
    throw new RateLimited(Math.min(Math.max(e.retryAfterMs, 60_000 * 2 ** (tries - 1)), 30 * 60_000))
  }
}

const LETTERS = "ABCDEFGH"

export async function loadCouncil(): Promise<Council> {
  const c = (await import(join(ROOT, "review/council.toml"))).default as Council
  if (!c.members?.length || !c.judge) throw new Error("review/council.toml needs members and a judge")
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

export async function memberSystemPrompt(rubric: Rubric, task: string) {
  const template = await Bun.file(join(ROOT, "review/prompts/council-member.md")).text()
  return fill(template, {
    DEADLINE: rubric.deadline,
    TASK_NAME: rubric.name,
    TASK_KIND: rubric.kind,
    BRIEF: rubric.brief.trim(),
    WEIGHTS: Object.entries(rubric.weights).map(([k, v]) => `- ${k}: ${v}`).join("\n"),
    WEIGHTS_NOTE: rubric.weights_note ? `\n${rubric.weights_note}\n` : "",
    CHECKS: rubric.checks.map(c => `- ${c}`).join("\n") || "- Nothing task-specific.",
    GUIDE: await Bun.file(join(ROOT, "review/guides", `${task}.md`)).text().catch(() => ""),
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
  return db.query<MemberRow, [string]>("select member, model, ok, result, error, version from member_results where id = ?").all(id)
}

function saveMember(db: Db, id: string, member: string, model: string, version: number, ok: boolean, result: unknown, error: string | null) {
  db.query("insert or replace into member_results (id, member, model, ok, result, error, version) values (?, ?, ?, ?, ?, ?, ?)")
    .run(id, member, model, ok ? 1 : 0, result ? JSON.stringify(result) : null, error, version)
}

function numericAgreement(review: MemberReview, scores: CouncilScore[]) {
  const diffs = scores.map(s => Math.abs(review.scores.find(x => x.criterion === s.criterion)!.score - s.score))
  return Math.round((1 - diffs.reduce((a, b) => a + b, 0) / diffs.length / 10) * 100) / 100
}

export async function runCouncil(db: Db, sub: Submission, facts: Facts, pack: string): Promise<CouncilReview> {
  const [council, rubric] = await Promise.all([loadCouncil(), loadRubric(sub.task)])
  const system = await memberSystemPrompt(rubric, sub.task)
  // a member counts as done only with an ok row from this council version and the model now in its
  // seat, so a failed member is retried and a review never mixes in another version's prompts or models
  const seats = new Map([...council.members.map((model, i) => [LETTERS[i], model] as const), ["judge", council.judge] as const])
  for (const r of memberRows(db, sub.id).filter(r => r.version !== council.version || seats.get(r.member) !== r.model)) {
    db.query("delete from member_results where id = ? and member = ?").run(sub.id, r.member)
  }
  const done = new Set(memberRows(db, sub.id).filter(r => r.ok).map(r => r.member))

  for (const [i, model] of council.members.entries()) {
    const letter = LETTERS[i]
    if (done.has(letter)) continue
    logEvent(db, sub.id, `Member ${letter} is reviewing`)
    const ask = (evidence: string) =>
      withRateLimit(db, sub.id, letter, () =>
        askJson(db, council, model, [{ role: "system", content: system }, { role: "user", content: evidence }], text =>
          parseMember(rubric, text, `member ${letter}`),
        ),
      )
    try {
      let review: MemberReview
      try {
        review = await ask(pack)
      } catch (e) {
        // same model, same prompt, minus the quoted code: the rest of the evidence still reaches it
        const shorter = e instanceof ProviderRefused ? withoutSources(pack) : null
        if (!shorter) throw e
        logEvent(db, sub.id, `Member ${letter}'s provider refused the full evidence, so it reads it without the quoted code`)
        review = { ...(await ask(shorter)), trimmed: true }
      }
      saveMember(db, sub.id, letter, model, council.version, true, review, null)
      logEvent(db, sub.id, `Member ${letter} scored ${weightedTotal(review.scores)}`)
    } catch (e) {
      if (!(e instanceof InvalidReply || e instanceof FatalError)) throw e
      saveMember(db, sub.id, letter, model, council.version, false, null, (e as Error).message)
      throw unusable(`member ${letter} (${model})`, e)
    }
  }

  const rows = memberRows(db, sub.id).filter(r => r.member !== "judge")
  const valid = rows.filter(r => r.ok).map(r => ({ letter: r.member, review: JSON.parse(r.result!) as MemberReview }))
  if (valid.length < council.members.length) {
    throw new FatalError(`only ${valid.length} of ${council.members.length} council members returned a usable review; refusing to score with a smaller panel`)
  }

  const scores: CouncilScore[] = Object.entries(rubric.weights).map(([criterion, weight]) => {
    const members = Object.fromEntries(valid.map(v => [v.letter, v.review.scores.find(s => s.criterion === criterion)!.score]))
    const values = Object.values(members)
    return { criterion, weight, score: median(values), why: "", spread: Math.max(...values) - Math.min(...values), members }
  })

  let judged: { why: Record<string, string>; strengths: string[]; weaknesses: string[]; red_flags: string[]; verdict: string; task_fit: string; agreement?: Record<string, number> }
  let judgeOk = false
  const stored = memberRows(db, sub.id).find(r => r.member === "judge")
  if (stored?.ok) {
    judged = JSON.parse(stored.result!)
    judgeOk = true
  } else {
    logEvent(db, sub.id, "The judge is writing the council review")
    const template = await Bun.file(join(ROOT, "review/prompts/council-judge.md")).text()
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
      saveMember(db, sub.id, "judge", council.judge, council.version, true, judged, null)
      judgeOk = true
    } catch (e) {
      if (!(e instanceof InvalidReply || e instanceof FatalError)) throw e
      saveMember(db, sub.id, "judge", council.judge, council.version, false, null, (e as Error).message)
      throw unusable(`the judge (${council.judge})`, e)
    }
  }

  for (const s of scores) {
    s.why = judged.why[s.criterion] || ""
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
          ...(v?.review.trimmed ? { trimmed: true } : {}),
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
