import { type FormEvent, useEffect, useRef, useState } from "react"
import { FileText } from "lucide-react"
import { Layout, PageHeader, Panel } from "@/components/layout"
import { Banner, BannerTitle } from "@/components/ui/banner"
import { Button } from "@/components/ui/button"
import { CheckboxGroup, CheckboxItem } from "@/components/ui/checkbox-group"
import { InputField, InputGroup, useInputGroup } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { useRegisterFluidHoverItem } from "@/hooks/use-fluid-hover"
import { useShape } from "@/lib/shape-context"
import type { TaskOption } from "@/lib/types"
import { cn } from "@/lib/utils"

const RESULTS = ["Not a finalist", "Finalist", "Winner", "1st place", "2nd place", "3rd place"]
const DRAFT_KEY = "hy26-submit-draft"
const MAX_DECK = 15 * 1024 * 1024

const LIMITS = {
  title: 120,
  team: 80,
  problem: 5000,
  solution: 5000,
  progress: 5000,
  repo: 300,
  instructions: 3000,
  additional: 2000,
} as const

type Draft = Record<keyof typeof LIMITS | "task" | "result", string>

const EMPTY: Draft = {
  title: "",
  team: "",
  task: "",
  result: "Not a finalist",
  problem: "",
  solution: "",
  progress: "",
  repo: "",
  instructions: "",
  additional: "",
}

// a textarea that joins the InputGroup's fluid hover and mirrors InputField's states
const AreaField = (props: { index: number; id: keyof typeof LIMITS; label: string; hint?: string; rows?: number; value: string; onChange: (v: string) => void }) => {
  const ref = useRef<HTMLDivElement>(null)
  const { registerItem, activeIndex } = useInputGroup()
  const [focused, setFocused] = useState(false)
  const shape = useShape()
  useRegisterFluidHoverItem(registerItem, props.index, ref)

  const max = LIMITS[props.id]
  const state = focused ? "bg-card ring-border" : activeIndex === props.index ? "bg-muted/50 ring-border" : "bg-transparent ring-border/50"
  return (
    <div ref={ref} className="flex flex-col gap-1">
      <label htmlFor={props.id} className="pl-2.5 text-[13px] text-muted-foreground">
        {props.label}
      </label>
      <textarea
        id={props.id}
        rows={props.rows ?? 4}
        value={props.value}
        onChange={e => props.onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={cn("min-h-[76px] w-full resize-y px-2.5 py-2 text-[13px] leading-normal ring-1 outline-none transition-all duration-80", shape.input, state)}
      />
      <div className="flex justify-between gap-3 px-2.5 text-[11px] text-muted-foreground/70">
        <span>{props.hint}</span>
        <span className={cn("tabular-nums", props.value.length > max && "text-destructive")}>
          {props.value.length} / {max}
        </span>
      </div>
    </div>
  )
}

export const SubmitPage = ({ tasks }: { tasks: TaskOption[] }) => {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [deck, setDeck] = useState<File | null>(null)
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState("")
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      setDraft({ ...EMPTY, ...JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}") })
    } catch {}
  }, [])

  function set(key: keyof Draft) {
    return (value: string) =>
      setDraft(prev => {
        const next = { ...prev, [key]: value }
        try {
          localStorage.setItem(DRAFT_KEY, JSON.stringify(next))
        } catch {}
        return next
      })
  }

  function pickDeck(file: File | undefined) {
    setError("")
    if (!file) return setDeck(null)
    if (file.size > MAX_DECK) return setError("The presentation must be a PDF of at most 15 MB.")
    setDeck(file)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError("")
    if (!draft.task) return setError("Choose the task you entered.")
    if (!consent) return setError("Confirm that you're on the team and agree to publication.")

    const body = new FormData()
    for (const [k, v] of Object.entries(draft)) body.set(k, v)
    body.set("consent", "on")
    if (deck) body.set("deck", deck)

    setSending(true)
    try {
      const res = await fetch("/api/submissions", { method: "POST", body })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? `The server answered ${res.status}.`)
      try {
        localStorage.removeItem(DRAFT_KEY)
      } catch {}
      location.href = json.url
    } catch (err) {
      setError((err as Error).message)
      setSending(false)
    }
  }

  return (
    <Layout current="/submit">
      <form className="grid min-w-0 gap-5" onSubmit={submit}>
        <PageHeader eyebrow="HackYeah 2026 · Council review" title="Review my project">
          Fill in what you gave HackTribe. Four AI models score your project against your task's official criteria, a fifth writes the
          review, and it appears on the scorecard when it's done. It's free and runs on free models, so about 10 projects are
          reviewed a day; the rest wait in the queue.
        </PageHeader>

        <Panel>
          <div className="text-xs font-medium text-muted-foreground">Project</div>
          <InputGroup className="w-full">
            <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
              <InputField index={0} label="Project title" placeholder="As on HackTribe" required maxLength={LIMITS.title} value={draft.title} onChange={set("title")} />
              <InputField index={1} label="Team name" placeholder="As on HackTribe" required maxLength={LIMITS.team} value={draft.team} onChange={set("team")} />
            </div>
          </InputGroup>
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <div className="grid gap-1">
              <span className="pl-2.5 text-[13px] text-muted-foreground">Task</span>
              <Select value={draft.task} onValueChange={set("task")}>
                <SelectTrigger placeholder="Choose the task you entered" />
                <SelectContent>
                  {tasks.map((t, i) => (
                    <SelectItem key={t.id} index={i} value={t.id}>
                      {`${t.name} · ${t.kind}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <span className="pl-2.5 text-[13px] text-muted-foreground">Result</span>
              <Select value={draft.result} onValueChange={set("result")}>
                <SelectTrigger placeholder="How did it place?" />
                <SelectContent>
                  {RESULTS.map((r, i) => (
                    <SelectItem key={r} index={i} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="pl-2.5 text-[11px] text-muted-foreground/70">Shown as self-declared.</span>
            </div>
          </div>
        </Panel>

        <Panel>
          <div className="text-xs font-medium text-muted-foreground">From your HackTribe entry</div>
          <InputGroup className="w-full">
            <AreaField index={0} id="problem" label="What problem are you solving with the idea?" value={draft.problem} onChange={set("problem")} />
            <AreaField index={1} id="solution" label="What is your solution?" value={draft.solution} onChange={set("solution")} />
            <AreaField index={2} id="progress" label="What's done so far and goal of your project" value={draft.progress} onChange={set("progress")} />
            <InputField
              index={3}
              label="Code Repository"
              placeholder="https://github.com/team/project"
              type="url"
              required
              maxLength={LIMITS.repo}
              value={draft.repo}
              onChange={set("repo")}
            />
            <AreaField index={4} id="instructions" label="Instructions on how to open project" hint="Include your live demo link if you have one." rows={3} value={draft.instructions} onChange={set("instructions")} />
            <AreaField index={5} id="additional" label="Additional field for presentation / files" hint="Links to a video, Figma or anything else." rows={2} value={draft.additional} onChange={set("additional")} />
          </InputGroup>
          <div className="grid gap-1">
            <span className="pl-2.5 text-[13px] text-muted-foreground">Presentation</span>
            <div className="flex flex-wrap items-center gap-3 pl-1">
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={e => pickDeck(e.target.files?.[0])} />
              <Button type="button" variant="secondary" leadingIcon={FileText} onClick={() => fileRef.current?.click()}>
                {deck ? "Change PDF" : "Choose PDF"}
              </Button>
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                {deck ? `${deck.name} · ${(deck.size / 1024 / 1024).toFixed(1)} MB` : "PDF, at most 15 MB. The reviewers read the text of its first 10 pages."}
              </span>
            </div>
          </div>
        </Panel>

        <Panel>
          <CheckboxGroup checkedIndices={consent ? new Set([0]) : new Set()} className="w-full">
            <CheckboxItem
              index={0}
              checked={consent}
              onToggle={() => setConsent(c => !c)}
              label="I'm on this team and agree to publish the review"
            />
          </CheckboxGroup>
          <p className="-mt-2 pl-2.5 text-xs text-muted-foreground">
            The review appears on this site with your project name, team name and repo link. The form, the repo and the deck go to free
            AI models through OpenRouter, whose providers may log inputs.
          </p>
          {error && (
            <Banner status="error" contrast="high">
              <BannerTitle>{error}</BannerTitle>
            </Banner>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={sending}>
              Send for review
            </Button>
            <span className="text-xs text-muted-foreground">You get a link to follow the review live.</span>
          </div>
        </Panel>
      </form>
    </Layout>
  )
}
