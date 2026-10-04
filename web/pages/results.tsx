import { useEffect, useState } from "react"
import { Footer, Layout, PageHeader, Stats, TaskNav } from "@/components/layout"
import { Badge } from "@/components/ui/badge"
import { Card, CardButton, CardDescription, CardFooter, CardGroup, CardHeader, CardTitle } from "@/components/ui/card"
import { TabItem, Tabs, TabsList } from "@/components/ui/tabs"
import { type Entry, type Place, type ResultsTask, TASKS } from "@/data/results"
import { GH, RESULT, fmt, reviewId } from "@/lib/site"
import { cn } from "@/lib/utils"

type Filter = "all" | "placed" | "code"
type Scores = Record<string, number>

const FILTER_KEY = "hy26-filter"
const ORDER: Record<Place, number> = { best: 0, 1: 1, 2: 2, 3: 3 }

const STATUS = {
  found: <Badge color="blue" size="compact">Repo found</Badge>,
  likely: <Badge color="blue" variant="dot" size="compact">Likely match</Badge>,
  none: <Badge color="gray" variant="dot" size="compact">No public repo found</Badge>,
  removed: <Badge color="gray" variant="dot" size="compact">No public repo found</Badge>,
  ours: <Badge color="green" size="compact">Our entry</Badge>,
}

const MARKER: Record<string, string> = {
  best: "bg-amber-100 text-amber-700 dark:bg-amber-300/15 dark:text-amber-300",
  1: "bg-amber-100 text-amber-700 dark:bg-amber-300/15 dark:text-amber-300",
  2: "bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-neutral-300",
  3: "bg-orange-100 text-orange-700 dark:bg-orange-300/15 dark:text-orange-300",
}

function shown(e: Entry, filter: Filter) {
  if (filter === "placed") return !!e.place
  if (filter === "code") return !!e.repos?.length
  return true
}

const Marker = ({ e }: { e: Entry }) => (
  <span
    className={cn(
      "mt-3.5 grid size-[22px] shrink-0 place-items-center self-start rounded-full text-[11px] font-semibold tabular-nums",
      e.place ? MARKER[e.place] : "",
    )}
  >
    {e.place ? (e.place === "best" ? 1 : e.place) : (
      <span className={cn("size-1.5 rounded-full", e.ours ? "bg-green-600 dark:bg-green-300" : "ring-[1.5px] ring-muted-foreground/50 ring-inset")} />
    )}
  </span>
)

// sits above the card's stretched link so it stays clickable on its own
const ExtLink = (props: { href: string; mono?: boolean; faint?: boolean; children: string }) => (
  <a
    href={props.href}
    target="_blank"
    rel="noopener"
    className={cn(
      "relative z-30 rounded text-right text-xs leading-snug [overflow-wrap:anywhere] transition-colors duration-80 hover:text-foreground max-sm:text-left",
      props.mono && "font-mono",
      props.faint ? "text-muted-foreground/70" : "text-muted-foreground",
    )}
  >
    {props.children} <span className="opacity-60">↗</span>
  </a>
)

const Row = ({ e, task, scores }: { e: Entry; task: string; scores: Scores }) => {
  const reviewed = e.repos?.find(r => scores[`${task}|${r}`] != null)
  const href = reviewed ? `/scorecard#${reviewId(task, reviewed)}` : e.repos?.[0] ? GH + e.repos[0] : undefined
  return (
    <Card
      href={href}
      external={!reviewed && !!href}
      label={reviewed ? `${e.team}: open the review` : href ? `${e.team}: open the repo` : undefined}
      className={cn("items-start max-sm:flex-wrap", e.ours && "bg-green-50/70 dark:bg-green-300/[.07]")}
    >
      <Marker e={e} />
      <CardHeader className="max-sm:basis-[calc(100%-46px)]">
        <CardTitle>{e.team}</CardTitle>
        {(e.place || e.project) && (
          <div className="flex flex-wrap gap-x-2 text-xs">
            {e.place && <span className="font-medium">{RESULT[e.place].label}</span>}
            {e.project && <span className="text-muted-foreground">{e.project}</span>}
          </div>
        )}
        {e.desc && <CardDescription className="max-w-[60ch] text-[13px]">{e.desc}</CardDescription>}
        {e.note && <p className="max-w-[60ch] text-xs text-muted-foreground/70">{e.note}</p>}
      </CardHeader>
      <CardFooter className="max-w-[44%] flex-col items-end gap-1 self-start py-3 max-sm:ml-[34px] max-sm:max-w-none max-sm:items-start max-sm:pt-0">
        {STATUS[e.status]}
        {e.repos?.map(r => (
          <ExtLink key={r} href={GH + r} mono>
            {r}
          </ExtLink>
        ))}
        {e.other?.map(o => (
          <span key={o.repo} className="mt-1 grid justify-items-end gap-0.5 text-[11px] text-muted-foreground/70 max-sm:justify-items-start">
            Their {o.task} entry, not this one
            <ExtLink href={GH + o.repo} mono faint>
              {o.repo}
            </ExtLink>
          </span>
        ))}
        {e.demo && <ExtLink href={e.demo}>Live demo</ExtLink>}
        {reviewed && (
          <CardButton href={`/scorecard#${reviewId(task, reviewed)}`} variant="secondary">
            Review {fmt(scores[`${task}|${reviewed}`])}
          </CardButton>
        )}
      </CardFooter>
    </Card>
  )
}

const Criteria = () => {
  const parts: [string, number][] = [["Idea", 30], ["Category fit", 20], ["Usability", 20], ["Design", 20], ["Completeness", 10]]
  return (
    <div className="grid gap-2.5 rounded-xl bg-surface-2 p-3.5 shadow-surface-2">
      <div className="text-xs text-muted-foreground">How this task was judged</div>
      <div className="flex gap-[3px]" role="img" aria-label="Idea 30%, category fit 20%, usability 20%, design 20%, completeness 10%">
        {parts.map(([name, w], i) => (
          <div key={name} className="grid min-w-0 gap-1.5" style={{ flex: w }}>
            <i className={cn("h-1.5 rounded-full bg-foreground", i > 0 && i < 4 && "opacity-55", i === 4 && "opacity-30")} />
            <span className="truncate text-[11px] text-muted-foreground">
              <b className="font-medium text-foreground tabular-nums">{w}</b> {name}
            </span>
          </div>
        ))}
      </div>
      <p className="max-w-[64ch] text-xs text-muted-foreground">
        Round one is a paper review of a deck of up to 10 slides, a description and the repo, demo or video. A team needs at least
        half the points to pitch live. Source: another team's notes on the task brief.
      </p>
    </div>
  )
}

const Section = ({ t, filter, scores }: { t: ResultsTask; filter: Filter; scores: Scores }) => {
  const top = t.entries.filter(e => e.place && shown(e, filter)).sort((a, b) => ORDER[a.place!] - ORDER[b.place!])
  const rest = t.entries.filter(e => !e.place && shown(e, filter))
  return (
    <section id={t.id} className="grid scroll-mt-6 gap-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-1">
        <h2 className="text-base font-medium tracking-[-0.005em]">{t.name}</h2>
        <span className="text-xs text-muted-foreground">{t.kind}</span>
        {t.ours && <Badge color="green" size="compact">Our task</Badge>}
      </div>
      {top.length > 0 && (
        <CardGroup orientation="inline" border="outlined">
          {top.map(e => <Row key={e.team} e={e} task={t.id} scores={scores} />)}
        </CardGroup>
      )}
      {rest.length > 0 && (
        <>
          <div className="px-1 pt-1 text-xs text-muted-foreground/70">Other finalists</div>
          <CardGroup orientation="inline" border="outlined">
            {rest.map(e => <Row key={e.team} e={e} task={t.id} scores={scores} />)}
          </CardGroup>
        </>
      )}
      {!top.length && !rest.length && <p className="px-1 text-xs text-muted-foreground">No finalists match this filter.</p>}
      {t.ours && <Criteria />}
    </section>
  )
}

export const ResultsPage = ({ scores }: { scores: Scores }) => {
  const [filter, setFilter] = useState<Filter>("all")

  useEffect(() => {
    try {
      const saved = localStorage.getItem(FILTER_KEY)
      if (saved === "placed" || saved === "code") setFilter(saved)
    } catch {}
  }, [])

  function choose(value: string) {
    setFilter(value as Filter)
    try {
      localStorage.setItem(FILTER_KEY, value)
    } catch {}
  }

  const real = TASKS.flatMap(t => t.entries.filter(e => !e.ours))
  const placed = real.filter(e => e.place)

  return (
    <Layout current="/">
      <header className="grid gap-5">
        <PageHeader eyebrow="TAURON Arena Kraków · 3–4 October 2026" title="HackYeah 2026 Results">
          Every finalist from the organisers' announcement, ordered by result, with the public GitHub repo for each team where one
          exists. Teams with public code link to their blind review on the scorecard.
        </PageHeader>
        <Stats
          items={[
            [TASKS.length, "Tasks"],
            [real.length, "Finalist spots"],
            [placed.length, "Winners and podium places"],
            [`${placed.filter(e => e.repos?.length).length} / ${placed.length}`, "Placed teams with public code"],
          ]}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={filter} onValueChange={choose}>
            <TabsList>
              <TabItem value="all" label="All finalists" />
              <TabItem value="placed" label="Placed only" />
              <TabItem value="code" label="With public code" />
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap gap-1.5">
            {STATUS.found}
            {STATUS.likely}
            {STATUS.none}
          </div>
        </div>
        <TaskNav tasks={TASKS} ours="sport" />
      </header>

      <main className="grid gap-9">
        {TASKS.map(t => <Section key={t.id} t={t} filter={filter} scores={scores} />)}
      </main>

      <Footer>
        <p>
          Results and finalists come from the organisers' announcements on 4 October 2026. Repos were matched the same evening by
          searching 672 public HackYeah 2026 repos (every file, plus 622 PDF, PPTX and DOCX pitch decks), GitHub accounts named after
          each team, and GitHub code search.
        </p>
        <p>
          Repo found: the team name appears in the repo, its deck or its GitHub account. Likely match: the project fits the task and
          the repo or product name points to the team. No public repo found: the search turned up nothing for the team.
        </p>
      </Footer>
    </Layout>
  )
}
