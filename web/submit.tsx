import { render } from "preact"
import { useEffect, useState } from "preact/hooks"

type Task = { id: string; name: string; kind: string }

const RESULTS = ["Not a finalist", "Finalist", "Winner", "1st place", "2nd place", "3rd place"]
const DRAFT_KEY = "hy26-submit-draft"

const TEXT_FIELDS = {
  title: 120,
  team: 80,
  problem: 5000,
  solution: 5000,
  progress: 5000,
  repo: 300,
  instructions: 3000,
  additional: 2000,
} as const

type Draft = Record<keyof typeof TEXT_FIELDS | "task" | "result", string>

const empty: Draft = { title: "", team: "", task: "", result: "Not a finalist", problem: "", solution: "", progress: "", repo: "", instructions: "", additional: "" }

function loadDraft(): Draft {
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}") }
  } catch {
    return empty
  }
}

function Counter({ value, max }: { value: string; max: number }) {
  return <span class={`count${value.length > max ? " over" : ""}`}>{value.length} / {max}</span>
}

function Area(props: { id: keyof typeof TEXT_FIELDS; label: string; hint?: string; draft: Draft; set: (k: keyof Draft, v: string) => void; rows?: number; required?: boolean }) {
  const { id, label, hint, draft, set, rows = 4, required } = props
  return (
    <div class="field">
      <label for={id}>{label}</label>
      {hint && <span class="hint">{hint}</span>}
      <textarea id={id} name={id} rows={rows} required={required} value={draft[id]} onInput={e => set(id, e.currentTarget.value)} />
      <Counter value={draft[id]} max={TEXT_FIELDS[id]} />
    </div>
  )
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [draft, setDraft] = useState<Draft>(loadDraft)
  const [error, setError] = useState("")
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetch("/api/tasks")
      .then(r => r.json())
      .then(setTasks)
      .catch(() => setError("Couldn't load the task list. Reload the page to try again."))
  }, [])

  const set = (k: keyof Draft, v: string) => {
    const next = { ...draft, [k]: v }
    setDraft(next)
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next))
    } catch {}
  }

  async function onSubmit(e: Event) {
    e.preventDefault()
    setError("")
    setSending(true)
    try {
      const res = await fetch("/api/submissions", { method: "POST", body: new FormData(e.currentTarget as HTMLFormElement) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `The server answered ${res.status}.`)
      try {
        localStorage.removeItem(DRAFT_KEY)
      } catch {}
      location.href = body.url
    } catch (err) {
      setError((err as Error).message)
      setSending(false)
    }
  }

  return (
    <form class="stack" onSubmit={onSubmit}>
      <div class="head">
        <div class="eyebrow">HackYeah 2026 · Council review</div>
        <h1>Review my project</h1>
        <p class="lede">
          Fill in what you gave HackTribe. Four AI models score your project against your task's official criteria, a fifth writes
          the review, and it appears on the scorecard when it's done. It's free and runs on free models, so about 10 projects are
          reviewed a day; the rest wait in the queue.
        </p>
      </div>

      <div class="card">
        <div class="section-title">Project</div>
        <div class="grid2">
          <div class="field">
            <label for="title">Project title</label>
            <input id="title" name="title" type="text" required maxLength={TEXT_FIELDS.title} value={draft.title} onInput={e => set("title", e.currentTarget.value)} />
          </div>
          <div class="field">
            <label for="team">Team name</label>
            <input id="team" name="team" type="text" required maxLength={TEXT_FIELDS.team} value={draft.team} onInput={e => set("team", e.currentTarget.value)} />
          </div>
          <div class="field">
            <label for="task">Task</label>
            <select id="task" name="task" required value={draft.task} onChange={e => set("task", e.currentTarget.value)}>
              <option value="" disabled>Choose the task you entered</option>
              {tasks.map(t => (
                <option value={t.id}>{t.name} · {t.kind}</option>
              ))}
            </select>
          </div>
          <div class="field">
            <label for="result">Result</label>
            <select id="result" name="result" value={draft.result} onChange={e => set("result", e.currentTarget.value)}>
              {RESULTS.map(r => (
                <option value={r}>{r}</option>
              ))}
            </select>
            <span class="hint">Shown as self-declared.</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="section-title">From your HackTribe entry</div>
        <Area id="problem" label="What problem are you solving with the idea?" draft={draft} set={set} required />
        <Area id="solution" label="What is your solution?" draft={draft} set={set} required />
        <Area id="progress" label="What's done so far and goal of your project" draft={draft} set={set} required />
        <div class="field">
          <label for="repo">Code Repository</label>
          <span class="hint">A public GitHub repo, for example https://github.com/team/project</span>
          <input id="repo" name="repo" type="url" required placeholder="https://github.com/…" value={draft.repo} onInput={e => set("repo", e.currentTarget.value)} />
        </div>
        <Area id="instructions" label="Instructions on how to open project" hint="Include your live demo link if you have one." draft={draft} set={set} rows={3} />
        <div class="field">
          <span class="label">Presentation</span>
          <span class="hint">PDF, at most 15 MB. The reviewers read its text, first 10 pages.</span>
          <div class="file">
            <input id="deck" name="deck" type="file" accept="application/pdf,.pdf" />
          </div>
        </div>
        <Area id="additional" label="Additional field for presentation / files" hint="Links to a video, Figma or anything else." draft={draft} set={set} rows={2} />
      </div>

      <div class="card">
        <label class="check">
          <input type="checkbox" name="consent" required />
          <span>
            I'm on this team, and I agree that the review is published on this site with our project name, team name and repo
            link. I understand the form, the repo and the deck are sent to free AI models through OpenRouter, whose providers may
            log inputs.
          </span>
        </label>
        {error && <div class="alert error" role="alert">{error}</div>}
        <div class="actions">
          <button class="btn" type="submit" disabled={sending}>{sending ? "Sending…" : "Send for review"}</button>
          <span class="small muted">You get a link to follow the review live.</span>
        </div>
      </div>
    </form>
  )
}

render(<App />, document.getElementById("app")!)
