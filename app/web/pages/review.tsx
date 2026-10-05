import { useEffect, useState } from "react"
import { Link2 } from "lucide-react"
import { Bar, Fact, Layout, List, PageHeader, Panel, ResultBadge } from "@/components/layout"
import { Badge } from "@/components/ui/badge"
import { Banner, BannerDescription, BannerTitle } from "@/components/ui/banner"
import { Button } from "@/components/ui/button"
import { ThinkingStep, ThinkingStepDetails, ThinkingSteps, ThinkingStepsContent, ThinkingStepsHeader } from "@/components/ui/thinking-steps"
import { Tooltip } from "@/components/ui/tooltip"
import { fmt, reviewId } from "@/lib/site"
import type { CouncilReview, TaskOption } from "@/lib/types"

type Event = { seq: number; at: number; message: string }

type Status = {
  submission: { id: string; title: string; team: string; task: string; result: string; repo: string; superseded: boolean; source: "form" | "curated" }
  job: { status: string; step: string; position: number; next_run_at: number; error: string | null }
  events: Event[]
  review: (CouncilReview & { scores: (CouncilReview["scores"][number] & { members: Record<string, number> })[] }) | null
}

type StepState = "complete" | "active" | "pending"

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
const ENDED = ["done", "failed", "cancelled"]

function steps(s: Status, size: number) {
  const order = ["queued", "evidence", "council", "done"]
  const at = order.indexOf(s.job.step === "failed" ? "council" : s.job.step)
  const members = s.events.filter(e => /^Member [A-H] (scored|gave|is unavailable)/.test(e.message))
  const judging = s.events.some(e => e.message.startsWith("The judge"))
  const state = (i: number): StepState => (at > i || s.job.status === "done" ? "complete" : at === i ? "active" : "pending")
  return {
    members,
    list: [
      { icon: "clock", label: s.job.position > 1 ? `In the queue, #${s.job.position}` : "In the queue", state: state(0) },
      { icon: "search", label: "Collecting evidence from the repo and deck", state: state(1) },
      { icon: "users", label: `The council scores the project · ${Math.min(members.length, size)} of ${size}`, state: judging || s.job.status === "done" ? "complete" : state(2) },
      { icon: "brain", label: "The judge writes the review", state: s.job.status === "done" ? "complete" : judging ? "active" : "pending" },
    ] as const,
  }
}

const Progress = ({ s, size }: { s: Status; size: number }) => {
  const { list, members } = steps(s, size)
  const visible = list.filter(x => x.state !== "pending")
  return (
    <Panel>
      <ThinkingSteps className="w-full">
        <ThinkingStepsHeader>{s.job.status === "failed" ? "Review stopped" : "Reviewing"}</ThinkingStepsHeader>
        <ThinkingStepsContent>
          {list.map((x, i) => (
            <ThinkingStep key={x.icon} icon={x.icon} label={x.label} status={x.state} isLast={i === visible.length - 1}>
              {x.icon === "users" && members.length > 0 && <ThinkingStepDetails summary="Council so far" details={members.map(m => m.message)} />}
            </ThinkingStep>
          ))}
        </ThinkingStepsContent>
      </ThinkingSteps>

      {s.job.status === "waiting_quota" && (
        <Banner status="warning">
          <BannerTitle>Today's free-model quota is used up</BannerTitle>
          <BannerDescription>The review continues automatically at {time(s.job.next_run_at)}. You can close this page and come back.</BannerDescription>
        </Banner>
      )}
      {s.job.status === "failed" && (
        <Banner status="error">
          <BannerTitle>The review stopped</BannerTitle>
          <BannerDescription>{s.job.error}</BannerDescription>
        </Banner>
      )}
      {s.job.status === "cancelled" && (
        <Banner status="info">
          <BannerTitle>This submission was replaced by a newer one for the same repo and task</BannerTitle>
        </Banner>
      )}

      <ul className="grid gap-1 text-xs text-muted-foreground">
        {s.events.slice(-8).map(e => (
          <li key={e.seq}>
            <time className="mr-2 text-muted-foreground/70 tabular-nums">{time(e.at)}</time>
            {e.message}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

const Track = ({ score }: { score: NonNullable<Status["review"]>["scores"][number] }) => (
  <div className="relative h-[18px]">
    <span className="absolute inset-x-0 top-2 h-0.5 rounded-full bg-foreground/[.07]" />
    {Object.entries(score.members).map(([k, v]) => (
      <Tooltip key={k} content={`Member ${k}: ${v}`}>
        <span className="absolute top-1 -ml-[5px] size-2.5 rounded-full bg-surface-3 ring-2 ring-muted-foreground/50 ring-inset" style={{ left: `${v * 10}%` }} />
      </Tooltip>
    ))}
    <span className="absolute top-0.5 -ml-[1.5px] h-3.5 w-[3px] rounded-full bg-foreground" style={{ left: `${score.score * 10}%` }} />
  </div>
)

const Result = ({ r, curated }: { r: NonNullable<Status["review"]>; curated: boolean }) => (
  <>
    <Panel>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="grid gap-1">
          <h2 className="text-base font-medium">Council score</h2>
          <span className="text-xs text-muted-foreground">
            Median of {r.council.members.filter(m => m.ok).length} models, weighted by the task's official criteria
          </span>
        </div>
        <div className="text-[40px] leading-none font-medium tracking-[-0.02em] tabular-nums">
          {fmt(r.weighted_total)}
          <small className="text-[14px] font-normal tracking-normal text-muted-foreground"> / 100</small>
        </div>
      </div>
      <Bar value={r.weighted_total} max={100} cut />
      <p>{r.verdict}</p>
    </Panel>

    <Panel>
      <div className="text-xs font-medium text-muted-foreground">Criteria · line = median, dots = each member</div>
      <div className="grid gap-3.5">
        {r.scores.map(s => (
          <div key={s.criterion} className="grid gap-1">
            <div className="grid grid-cols-[minmax(0,1fr)_170px_36px] items-center gap-3 max-sm:grid-cols-[minmax(0,1fr)_90px_32px]">
              <div className="font-medium">
                {s.criterion}
                <span className="ml-1 text-xs font-normal text-muted-foreground/70">{s.weight}%</span>
              </div>
              <Track score={s} />
              <div className="text-right font-medium tabular-nums">{fmt(s.score)}</div>
            </div>
            <p className="max-w-[66ch] text-muted-foreground">{s.why}</p>
            {s.spread >= 2 && <span className="text-[11px] text-muted-foreground/70">Members disagree here: scores range by {fmt(s.spread)} points.</span>}
          </div>
        ))}
      </div>
    </Panel>

    <div className="grid grid-cols-4 gap-2 max-sm:grid-cols-2">
      <Fact label="Source lines">{r.source_loc.toLocaleString("en")}</Fact>
      <Fact label="Tests">{r.tests.cases ? `${r.tests.cases} cases` : r.has_tests ? `${r.tests.files} files` : "None"}</Fact>
      <Fact label="Claims built">{fmt(r.build_reality)} / 10</Fact>
      <Fact label="Task fit">{/^no\b/i.test(r.task_fit) ? "Doubtful" : "Yes"}</Fact>
    </div>

    <Panel>
      <div className="grid grid-cols-3 gap-3.5 max-sm:grid-cols-1">
        <List title="Strengths" items={r.strengths} />
        <List title="Weaknesses" items={r.weaknesses} />
        <List title="Red flags" items={r.red_flags} red />
      </div>
      <div className="grid gap-1 text-xs text-muted-foreground">
        <div>
          <b className="font-medium text-foreground">Built during the event:</b> {r.built_during_event}
        </div>
        <div>
          <b className="font-medium text-foreground">Live demo:</b> {r.live_demo}
        </div>
      </div>
    </Panel>

    <Panel>
      <div className="text-xs font-medium text-muted-foreground">Council v{r.council.version}</div>
      <div className="grid gap-1.5">
        {[...r.council.members, { letter: "J", model: r.council.judge, ok: r.council.judge_ok, total: null, agreement: null, error: null }].map(m => (
          <div key={m.letter} className="grid grid-cols-[22px_minmax(0,1fr)_54px_96px] items-center gap-2.5 text-xs max-sm:grid-cols-[22px_minmax(0,1fr)_44px]">
            <b className="font-semibold">{m.letter}</b>
            <span className="grid min-w-0">
              <code className="font-mono text-[11.5px] text-muted-foreground [overflow-wrap:anywhere]">{m.model}</code>
              {"trimmed" in m && m.trimmed && <span className="text-[11px] text-muted-foreground/70">read the evidence without quoted code: its provider refused the full text</span>}
            </span>
            <span className="text-right tabular-nums">{m.total == null ? "–" : fmt(m.total)}</span>
            <span className="text-right text-muted-foreground tabular-nums max-sm:hidden">
              {m.letter === "J" ? (m.ok ? "judge" : "judge failed") : m.agreement == null ? (m.ok ? "" : "no answer") : `${Math.round(m.agreement * 100)}% agree`}
            </span>
          </div>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        {curated
          ? "A HackYeah 2026 finalist, queued automatically for a council review; the council wasn't told how it placed."
          : "Self-submitted and unverified: the result shown is the team's own claim."}{" "}
        The council read an evidence pack built from the repo, its decks and docs; it didn't run the code or see the pitch.
      </span>
    </Panel>
  </>
)

export const ReviewPage = ({ tasks, councilSize }: { tasks: TaskOption[]; councilSize: number }) => {
  const [s, setS] = useState<Status | null>(null)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const id = location.pathname.split("/").filter(Boolean)[1] ?? ""
    let events: Event[] = []
    const es = new EventSource(`/api/reviews/${id}/events`)
    es.onmessage = msg => {
      const next = JSON.parse(msg.data) as Status
      events = [...events, ...next.events.filter(e => !events.some(x => x.seq === e.seq))]
      setS({ ...next, events })
      if (ENDED.includes(next.job.status)) es.close()
    }
    es.addEventListener("gone", () => {
      setError("This review doesn't exist or was removed.")
      es.close()
    })
    return () => es.close()
  }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {}
  }

  if (error || !s) {
    return (
      <Layout current="/r">
        {error ? (
          <Banner status="error">
            <BannerTitle>{error}</BannerTitle>
          </Banner>
        ) : (
          <p className="text-muted-foreground">Loading…</p>
        )}
      </Layout>
    )
  }

  const task = tasks.find(t => t.id === s.submission.task)?.name ?? s.submission.task
  const curated = s.submission.source === "curated"
  return (
    <Layout current="/r">
      <div className="grid min-w-0 gap-5">
        <div className="grid gap-3">
          <PageHeader
            eyebrow={
              <span className="flex flex-wrap items-center gap-1.5">
                {task}
                {curated ? (
                  <Badge color="gray" variant="dot" size="compact">
                    HackYeah 2026 finalist
                  </Badge>
                ) : (
                  <>
                    <ResultBadge result="self" />
                    <Badge color="gray" variant="dot" size="compact">
                      {s.submission.result} (self-declared)
                    </Badge>
                  </>
                )}
              </span>
            }
            title={s.submission.title}
          >
            {s.submission.team} ·{" "}
            <a className="font-mono text-xs hover:text-foreground" href={`https://github.com/${s.submission.repo}`} target="_blank" rel="noopener">
              {s.submission.repo}
            </a>
          </PageHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" size="compact" leadingIcon={Link2} onClick={copy}>
              {copied ? "Link copied" : "Copy link"}
            </Button>
            {s.review && (
              <a className="text-xs text-muted-foreground hover:text-foreground" href={`/#${curated ? reviewId(s.submission.task, s.submission.repo) : s.submission.task}`}>
                See it with the other results →
              </a>
            )}
          </div>
        </div>
        {s.review ? <Result r={s.review} curated={curated} /> : <Progress s={s} size={councilSize} />}
      </div>
    </Layout>
  )
}
