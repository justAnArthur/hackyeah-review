import { render } from "preact"
import { useEffect, useState } from "preact/hooks"

type Score = { criterion: string; weight: number; score: number; why: string; spread: number; members: Record<string, number> }

type Review = {
  repo: string
  project: string
  team: string
  task: string
  result: string
  task_fit: string
  scores: Score[]
  weighted_total: number
  build_reality: number
  source_loc: number
  has_tests: boolean
  tests: { files: number; cases: number }
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
}

type Status = {
  submission: { id: string; title: string; team: string; task: string; result: string; repo: string; superseded: boolean }
  job: { status: string; step: string; position: number; next_run_at: number; error: string | null }
  events: { seq: number; at: number; message: string }[]
  review: Review | null
}

type Task = { id: string; name: string }

const id = location.pathname.split("/").filter(Boolean)[1] ?? ""
const fmt = (n: number) => (Math.round(n * 10) / 10).toFixed(1)
const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

function Bar({ value, max, cut }: { value: number; max: number; cut?: boolean }) {
  return (
    <div class="bar">
      <i style={`width:${(value / max) * 100}%`} />
      {cut && <span class="cut" />}
    </div>
  )
}

function Track({ score }: { score: Score }) {
  return (
    <div class="track" title={Object.entries(score.members).map(([k, v]) => `${k}: ${v}`).join(", ")}>
      <span class="line" />
      {Object.entries(score.members).map(([k, v]) => (
        <span class="dot" style={`left:${v * 10}%`} aria-label={`member ${k}: ${v}`} />
      ))}
      <span class="med" style={`left:${score.score * 10}%`} />
    </div>
  )
}

function stepsFor(s: Status) {
  const memberLines = s.events.filter(e => /^Member [A-H] (scored|gave)/.test(e.message)).length
  const done = s.job.status === "done"
  const failed = s.job.status === "failed"
  const at = (step: string) => {
    const order = ["queued", "evidence", "council", "done"]
    return order.indexOf(s.job.step === "failed" ? "council" : s.job.step) - order.indexOf(step)
  }
  return [
    { t: "In the queue", state: at("queued") > 0 || done ? "done" : "now", r: s.job.position > 1 ? `#${s.job.position}` : "" },
    { t: "Collecting evidence from the repo and deck", state: done || at("evidence") > 0 ? "done" : at("evidence") === 0 ? "now" : "" },
    { t: "Four council members score the project", state: done || memberLines >= 4 ? "done" : s.job.step === "council" ? "now" : "", r: s.job.step === "council" || done ? `${memberLines} of 4` : "" },
    { t: "The judge writes the review", state: done ? "done" : s.events.some(e => e.message.startsWith("The judge")) ? "now" : "" },
  ].map(x => ({ ...x, state: failed && x.state === "now" ? "fail" : x.state }))
}

function Progress({ s }: { s: Status }) {
  const waiting = s.job.status === "waiting_quota"
  return (
    <div class="card">
      <div class="steps">
        {stepsFor(s).map(x => (
          <div class={`step ${x.state}`}>
            <span class="ic" />
            <span class="t">{x.t}</span>
            <span class="r">{x.r}</span>
          </div>
        ))}
      </div>
      {waiting && (
        <div class="alert warn">
          Today's free-model quota is used up. The review continues automatically at {time(s.job.next_run_at)}; you can close this page and come back.
        </div>
      )}
      {s.job.status === "failed" && <div class="alert error">The review stopped: {s.job.error}</div>}
      {s.job.status === "cancelled" && <div class="alert info">This submission was replaced by a newer one for the same repo and task.</div>}
      <ul class="log">
        {s.events.slice(-8).map(e => (
          <li>
            <time>{time(e.at)}</time>
            {e.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Result({ r }: { r: Review }) {
  const list = (title: string, items: string[], cls = "") =>
    items.length ? (
      <div class={cls}>
        <h3>{title}</h3>
        <ul>{items.map(x => <li>{x}</li>)}</ul>
      </div>
    ) : null

  return (
    <>
      <div class="card">
        <div class="score-top">
          <div style="display:grid;gap:4px">
            <h2>Council score</h2>
            <span class="small muted">Median of {r.council.members.filter(m => m.ok).length} models, weighted by the task's official criteria</span>
          </div>
          <div class="big">{fmt(r.weighted_total)}<small> / 100</small></div>
        </div>
        <Bar value={r.weighted_total} max={100} cut />
        <p style="margin:0">{r.verdict}</p>
      </div>

      <div class="card">
        <div class="section-title">Criteria · line = median, dots = each member</div>
        <div class="crit">
          {r.scores.map(s => (
            <div class="c">
              <div class="c-top">
                <div class="c-name">{s.criterion}<span>{s.weight}%</span></div>
                <Track score={s} />
                <div class="c-score">{fmt(s.score)}</div>
              </div>
              <p class="c-why">{s.why}</p>
              {s.spread >= 2 && <span class="c-spread">Members disagree here: scores range by {fmt(s.spread)} points.</span>}
            </div>
          ))}
        </div>
      </div>

      <div class="facts">
        <div class="fact"><span>Source lines</span><b>{r.source_loc.toLocaleString("en")}</b></div>
        <div class="fact"><span>Tests</span><b>{r.tests.cases ? `${r.tests.cases} cases` : r.has_tests ? `${r.tests.files} files` : "None"}</b></div>
        <div class="fact"><span>Claims built</span><b>{fmt(r.build_reality)} / 10</b></div>
        <div class="fact"><span>Task fit</span><b>{/^no\b/i.test(r.task_fit) ? "Doubtful" : "Yes"}</b></div>
      </div>

      <div class="card">
        <div class="lists">
          {list("Strengths", r.strengths)}
          {list("Weaknesses", r.weaknesses)}
          {list("Red flags", r.red_flags, "red")}
        </div>
        <div class="meta">
          <div><b>Built during the event:</b> {r.built_during_event}</div>
          <div><b>Live demo:</b> {r.live_demo}</div>
        </div>
      </div>

      <div class="card">
        <div class="section-title">Council v{r.council.version}</div>
        <div class="members">
          {r.council.members.map(m => (
            <div class="member">
              <b>{m.letter}</b>
              <code>{m.model}</code>
              <span class="num">{m.total == null ? "–" : fmt(m.total)}</span>
              <span class="num agree">{m.agreement == null ? (m.ok ? "" : "no answer") : `${Math.round(m.agreement * 100)}% agree`}</span>
            </div>
          ))}
          <div class="member">
            <b>J</b>
            <code>{r.council.judge}</code>
            <span class="num" />
            <span class="num agree">{r.council.judge_ok ? "judge" : "judge failed"}</span>
          </div>
        </div>
        <span class="small muted">
          Self-submitted and unverified. The council read an evidence pack built from the form, the repo and the deck; it didn't
          run the code or see the pitch. It's a different reviewer from the curated scores on the scorecard.
        </span>
      </div>
    </>
  )
}

function App() {
  const [s, setS] = useState<Status | null>(null)
  const [error, setError] = useState("")
  const [tasks, setTasks] = useState<Task[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch("/api/tasks").then(r => r.json()).then(setTasks).catch(() => {})
    let events: { seq: number; at: number; message: string }[] = []
    const es = new EventSource(`/api/reviews/${id}/events`)
    es.onmessage = msg => {
      const next = JSON.parse(msg.data) as Status
      events = [...events, ...next.events.filter(e => !events.some(x => x.seq === e.seq))]
      setS({ ...next, events })
      if (["done", "failed", "cancelled"].includes(next.job.status)) es.close()
    }
    es.addEventListener("gone", () => {
      setError("This review doesn't exist or was removed.")
      es.close()
    })
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) return
    }
    return () => es.close()
  }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {}
  }

  if (error) return <div class="alert error">{error}</div>
  if (!s) return <p class="muted">Loading…</p>

  const task = tasks.find(t => t.id === s.submission.task)?.name ?? s.submission.task
  return (
    <div class="stack">
      <div class="head">
        <div class="eyebrow">{task} · <span class="badge self">Self-submitted</span> <span class="badge neutral">{s.submission.result} (self-declared)</span></div>
        <h1>{s.submission.title}</h1>
        <p class="lede">
          {s.submission.team} · <a class="mono" href={`https://github.com/${s.submission.repo}`} target="_blank" rel="noopener">{s.submission.repo}</a>
        </p>
        <div class="actions">
          <button class="btn ghost" type="button" onClick={copy}>{copied ? "Link copied" : "Copy link"}</button>
          {s.review && <a class="small muted" href={`/scorecard#${s.submission.task}`}>See it on the scorecard →</a>}
        </div>
      </div>
      {s.review ? <Result r={s.review} /> : <Progress s={s} />}
    </div>
  )
}

render(<App />, document.getElementById("app")!)
