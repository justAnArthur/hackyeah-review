import { useEffect, useMemo, useState } from "react"
import { Footer, Layout, PageHeader, Panel, Stats, TaskNav } from "@/components/layout"
import { ProjectList } from "@/components/project-card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { TabItem, Tabs, TabsList } from "@/components/ui/tabs"
import { type Project, type ReviewEntry, type Sort, type Task, buildTasks, communityProject, sortCommunity, sortProjects } from "@/lib/projects"

type Filter = "all" | "placed" | "code"

export type CouncilPanel = { members: string[]; judge: string; version: number }

const PREFS_KEY = "hy26-view"

function shown(p: Project, filter: Filter) {
  if (filter === "placed") return !!p.place
  if (filter === "code") return !!p.repos?.length
  return true
}

const Section = (props: { t: Task; filter: Filter; sort: Sort; community: ReviewEntry[]; open: string[]; setOpen: (ids: string[], open: string[]) => void }) => {
  const { t } = props
  const projects = sortProjects(t.projects.filter(p => shown(p, props.filter)), props.sort)
  const community = sortCommunity(props.community).map(e => communityProject(t.id, e))
  return (
    <section id={t.id} className="grid scroll-mt-6 gap-3">
      <div className="grid gap-1.5 px-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h2 className="text-base font-medium tracking-[-0.005em]">{t.name}</h2>
          <span className="text-xs text-muted-foreground">{t.kind}</span>
          {t.ours && <Badge color="green" size="compact">Our task</Badge>}
        </div>
        {t.weights && (
          <div className="flex flex-wrap gap-1">
            {Object.entries(t.weights).map(([k, v]) => (
              <span key={k} className="rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground ring-1 ring-border/60 ring-inset">
                {k} <span className="text-foreground tabular-nums">{v}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {projects.length ? (
        <ProjectList projects={projects} open={props.open} setOpen={props.setOpen} />
      ) : (
        <p className="px-1 text-xs text-muted-foreground">No finalists match this filter.</p>
      )}

      {community.length > 0 && (
        <div className="mt-1 grid gap-2">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-1 text-xs text-muted-foreground">
            <span className="text-[14px] font-medium text-foreground">Community submissions</span>
            Sent by teams through Review my project; the result shown is the team&apos;s own claim
          </div>
          <ProjectList projects={community} open={props.open} setOpen={props.setOpen} />
        </div>
      )}
    </section>
  )
}

const ScoringPanel = ({ panel }: { panel: CouncilPanel }) => (
  <Panel>
    <h2 className="text-base font-medium">How projects are scored</h2>
    <div className="grid grid-cols-3 gap-5 max-md:grid-cols-1">
      <div className="grid content-start gap-1">
        <div className="font-medium">The council</div>
        <p className="text-muted-foreground">
          Three AI models (<span className="font-mono text-xs">{panel.members.join(", ")}</span>) read an evidence pack built from the
          project&apos;s public repo and deck: measured facts such as code size, tests and commit history, its decks and docs, the demo
          page and descriptions of its screenshots. Each scores every official criterion of the task; the median counts, and{" "}
          <span className="font-mono text-xs">{panel.judge}</span> writes the review.
        </p>
      </div>
      <div className="grid content-start gap-1">
        <div className="font-medium">The score</div>
        <p className="text-muted-foreground">
          Every criterion is scored from 0 to 10, and the task&apos;s official weights, listed under each task, turn them into a score out
          of 100. On that scale 5 is a solid hackathon prototype, 7 is clearly strong and 9 or more is exceptional. Finalists are
          scored without their result; for an upload, the council sees the result the team declared.
        </p>
      </div>
      <div className="grid content-start gap-1">
        <div className="font-medium">Not the jury</div>
        <p className="text-muted-foreground">
          Mentors reviewed every submission first, then the jury picked finalists to present live, and an award needed at least half the
          points. The council only reads what is public, so its score can differ from the jury&apos;s verdict.
        </p>
      </div>
    </div>
    <p className="text-xs text-muted-foreground">
      Every finalist with public code is queued automatically, and any team can send its own project through{" "}
      <a href="/submit" className="underline decoration-border underline-offset-2 hover:text-foreground">Review my project</a>. Reviews
      run one at a time, in upload order, and take five to ten minutes each.
    </p>
  </Panel>
)

export const HomePage = ({ weights, panel }: { weights: Record<string, Record<string, number>>; panel: CouncilPanel }) => {
  const [filter, setFilter] = useState<Filter>("all")
  const [sort, setSort] = useState<Sort>("result")
  const [finalists, setFinalists] = useState<Record<string, ReviewEntry>>({})
  const [community, setCommunity] = useState<Record<string, ReviewEntry[]>>({})
  const [loaded, setLoaded] = useState(false)
  const [open, setOpenState] = useState<string[]>([])
  const tasks = useMemo(() => buildTasks(weights, finalists), [weights, finalists])

  const setOpen = (ids: string[], next: string[]) => setOpenState(prev => [...prev.filter(v => !ids.includes(v)), ...next])

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}")
      if (["placed", "code"].includes(saved.filter)) setFilter(saved.filter)
      if (saved.sort === "score") setSort("score")
    } catch {}
    load()
  }, [])

  async function load() {
    const get = (url: string) => fetch(url).then(r => (r.ok ? r.json() : {})).catch(() => ({}))
    const [f, c] = await Promise.all([get("/api/finalists"), get("/api/community")])
    setFinalists(f)
    setCommunity(c)
    setLoaded(true)
  }

  // refresh while a finalist or an upload is still being reviewed
  const busy = [...Object.values(finalists), ...Object.values(community).flat()].some(e => !e.review)
  useEffect(() => {
    if (!busy) return
    const timer = setInterval(load, 10_000)
    return () => clearInterval(timer)
  }, [busy])

  function save(next: { filter?: Filter; sort?: Sort }) {
    if (next.filter) setFilter(next.filter)
    if (next.sort) setSort(next.sort)
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ filter, sort, ...next }))
    } catch {}
  }

  // links like /#sport--owner-repo (and old /scorecard#… links, which redirect here) open that project
  useEffect(() => {
    function fromHash() {
      const id = decodeURIComponent(location.hash.slice(1))
      if (!id.includes("--")) return
      setOpenState(prev => (prev.includes(id) ? prev : [...prev, id]))
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }))
    }
    fromHash()
    addEventListener("hashchange", fromHash)
    return () => removeEventListener("hashchange", fromHash)
  }, [loaded])

  const all = tasks.flatMap(t => t.projects.filter(p => !p.ours))
  // finalists and community uploads together: scored, or still waiting / being reviewed
  const entries = [...Object.values(finalists), ...Object.values(community).flat()]
  const scored = entries.filter(e => e.review).length
  const inQueue = entries.length - scored

  return (
    <Layout current="/">
      <header className="grid gap-5">
        <PageHeader eyebrow="TAURON Arena Kraków · 3–4 October 2026" title="HackYeah 2026 Results">
          Every finalist from the organisers&apos; announcement, ordered by result, with the public GitHub repo found for each team, plus
          the projects teams sent in themselves. Each project with public code is scored by an AI council against its task&apos;s
          official criteria and weights, out of 100; open a project to read its review.
        </PageHeader>
        <Stats
          items={[
            [tasks.length, "Tasks"],
            [all.length, "Finalists"],
            [loaded ? scored : "–", "Projects scored"],
            [loaded ? inQueue : "–", "In the review queue now"],
          ]}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={filter} onValueChange={v => save({ filter: v as Filter })}>
            <TabsList>
              <TabItem value="all" label="All finalists" />
              <TabItem value="placed" label="Placed only" />
              <TabItem value="code" label="With public code" />
            </TabsList>
          </Tabs>
          <div className="w-52">
            <Select value={sort} onValueChange={v => save({ sort: v as Sort })}>
              <SelectTrigger variant="borderless" />
              <SelectContent>
                <SelectItem index={0} value="result">
                  Winners, then finalists
                </SelectItem>
                <SelectItem index={1} value="score">
                  By score
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <TaskNav tasks={tasks} ours="sport" />
      </header>

      <ScoringPanel panel={panel} />

      <main className="grid gap-10">
        {tasks.map(t => (
          <Section key={t.id} t={t} filter={filter} sort={sort} community={community[t.id] ?? []} open={open} setOpen={setOpen} />
        ))}
      </main>

      <Footer>
        <p>
          Results and finalists come from the organisers&apos; announcements on 4 October 2026. Repos were matched the same evening by
          searching 672 public HackYeah 2026 repos (every file, plus 622 PDF, PPTX and DOCX pitch decks), GitHub accounts named after
          each team, and GitHub code search. A repo is &quot;found&quot; when the team name appears in it, its deck or its GitHub account,
          and a &quot;likely match&quot; when the project fits the task and the repo or product name points to the team.
        </p>
        <p>
          Weights come from each task&apos;s published rules and details documents; for Cracow without barriers, whose two documents give
          different weights, the details document is used. SiteQuest (SiteQuestTeam) was left out of HubMI: its own context file says it
          was built for the Smart City task. Repos deleted or made private since the event can&apos;t be reviewed.
        </p>
      </Footer>
    </Layout>
  )
}
