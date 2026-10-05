import { useEffect, useMemo, useState } from "react"
import { Footer, Layout, PageHeader, Panel, Stats, TaskNav } from "@/components/layout"
import { ProjectList } from "@/components/project-card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { TabItem, Tabs, TabsList } from "@/components/ui/tabs"
import { type CommunityEntry, type CouncilScore, type Project, type Sort, type Task, communityProject, mergeTasks, sortCommunity, sortProjects } from "@/lib/projects"
import { fmt } from "@/lib/site"
import type { ScorecardTask } from "@/lib/types"

type Filter = "all" | "placed" | "code"

const PREFS_KEY = "hy26-view"
const isWinner = (r: string | number | undefined) => r === "best" || r === 1
const placeName = (r: string | number | undefined) => (r === "best" ? "winner" : "1st place")

function shown(p: Project, filter: Filter) {
  if (filter === "placed") return !!p.place
  if (filter === "code") return !!p.repos?.length
  return true
}

function agreement(t: Task) {
  const s = t.scored
  if (!s?.projects.length) return null
  const top = s.projects[0]
  const won = s.projects.find(p => isWinner(p.result))
  if (!won) {
    const w = s.unscored.find(u => isWinner(u.result))
    return w ? <>No public repo found for the jury's {placeName(w.result)}, <span className="text-foreground">{w.team}</span>.</> : null
  }
  if (won === top) return <><span className="text-foreground">Agreement.</span> The blind review's top score went to the jury's {placeName(won.result)}.</>
  return (
    <>
      <span className="text-foreground">Disagreement.</span> The jury's {placeName(won.result)}, {won.project}, scored {fmt(won.weighted_total)}; the
      blind review's top pick, {top.project}, scored {fmt(top.weighted_total)}.
    </>
  )
}

const Section = (props: { t: Task; filter: Filter; sort: Sort; community: CommunityEntry[]; council: Record<string, CouncilScore>; open: string[]; setOpen: (ids: string[], open: string[]) => void }) => {
  const { t } = props
  const projects = sortProjects(t.projects.filter(p => shown(p, props.filter)), props.sort).map(p => ({ ...p, council: p.review && props.council[`${t.id}|${p.review.repo}`] }))
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
        <ProjectList task={t} projects={projects} open={props.open} setOpen={props.setOpen} />
      ) : (
        <p className="px-1 text-xs text-muted-foreground">No finalists match this filter.</p>
      )}
      <div className="px-1 text-xs text-muted-foreground">{agreement(t)}</div>

      {community.length > 0 && (
        <div className="mt-1 grid gap-2">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-1 text-xs text-muted-foreground">
            <span className="text-[14px] font-medium text-foreground">Community submissions</span>
            Sent by teams through Review my project and scored by the same council; the result shown is the team's own claim
          </div>
          <ProjectList task={t} projects={community} open={props.open} setOpen={props.setOpen} />
        </div>
      )}
    </section>
  )
}

export type CouncilPanel = { members: string[]; judge: string; version: number }

const ScoringPanel = ({ panel, gap }: { panel: CouncilPanel; gap: { n: number; mean: number } }) => (
  <Panel>
    <h2 className="text-base font-medium">How projects are scored</h2>
    <div className="grid grid-cols-3 gap-5 max-md:grid-cols-1">
      <div className="grid content-start gap-1">
        <div className="font-medium">Blind review</div>
        <p className="text-muted-foreground">
          The large number on each card. On 4 October a Claude Opus agent read each finalist's public repo, its code, decks, docs,
          screenshots and commit history, without being told the result, and scored every official criterion of the task from 0 to 10.
          The task's weights turn that into a score out of 100.
        </p>
      </div>
      <div className="grid content-start gap-1">
        <div className="font-medium">Council score</div>
        <p className="text-muted-foreground">
          The small number under it. Three other models (<span className="font-mono text-xs">{panel.members.join(", ")}</span>) read an
          evidence pack built from the same public material and score the same criteria; the median of each criterion counts, and{" "}
          <span className="font-mono text-xs">{panel.judge}</span> writes the verdict. The same council reviews projects sent through{" "}
          <a href="/submit" className="underline decoration-border underline-offset-2 hover:text-foreground">Review my project</a>.
        </p>
      </div>
      <div className="grid content-start gap-1">
        <div className="font-medium">The jury</div>
        <p className="text-muted-foreground">
          Neither score is the jury's. Mentors first reviewed every submission, then the jury picked finalists to present live, and a
          project needed at least half the points to receive an award. The jury saw the pitch; both reviewers only read what's public.
        </p>
      </div>
    </div>
    <p className="text-xs text-muted-foreground">
      On the 0–10 scale, 5 is a solid hackathon prototype, 7 is clearly strong and 9 or more is exceptional. Each task's weights are
      listed under its name.
      {gap.n > 0 && ` On the ${gap.n} finalists scored both ways so far, the council lands ${fmt(gap.mean)} points from the blind review on average.`}
    </p>
  </Panel>
)

const FINDINGS = [
  ["The blind review's top pick won in 1 of 5 tasks", " where the winner's code could be reviewed. Only Finance Without Intermediaries agrees: ProofBond, the one entry that leaves no admin or upgrade key behind."],
  ["Winners leaned on spectacle.", " A drone command centre over satellite imagery (Smart City), a 3D operating room (Sport & Healthcare) and product renders with a demo video (Defence) all scored lower on the repo than at least one other finalist. The jury watched live pitches; the blind review read code."],
  ["Category fit cost the most points.", " GROUND ZERO scored 5.5 on relation to Smart City, ViviOR 4.5 on Sport & Healthcare and JustMate 5.0. The jury seems to have forgiven a loose fit when the demo was striking."],
  ["Missing materials hurt in the repo, not on stage.", " Jakobiany won Cracow without barriers with the deepest engineering but no deck, video or business model in the repo, which is why the blind review placed it third."],
]

export const HomePage = ({ data, panel }: { data: ScorecardTask[]; panel: CouncilPanel }) => {
  const tasks = useMemo(() => mergeTasks(data), [data])
  const [filter, setFilter] = useState<Filter>("all")
  const [sort, setSort] = useState<Sort>("result")
  const [community, setCommunity] = useState<Record<string, CommunityEntry[]>>({})
  const [council, setCouncil] = useState<Record<string, CouncilScore>>({})
  const [loaded, setLoaded] = useState(false)
  const [open, setOpenState] = useState<string[]>([])

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
    const [scores, entries] = await Promise.all([get("/api/council-scores"), get("/api/community")])
    setCouncil(scores)
    setCommunity(entries)
    setLoaded(true)
  }

  // refresh while an upload or a finalist is still being reviewed
  const busy = Object.values(council).some(c => c.total === null) || Object.values(community).flat().some(e => !e.review)
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

  const finalists = tasks.flatMap(t => t.projects.filter(p => !p.ours))
  const placed = finalists.filter(p => p.place)
  const reviewable = tasks.filter(t => t.scored?.projects.some(p => isWinner(p.result)))
  const agreed = reviewable.filter(t => isWinner(t.scored!.projects[0].result)).length
  const both = tasks.flatMap(t => t.projects.flatMap(p => {
    const c = p.review && council[`${t.id}|${p.review.repo}`]
    return c && c.total !== null ? [Math.abs(c.total - p.review!.weighted_total)] : []
  }))
  const gap = { n: both.length, mean: both.length ? both.reduce((a, b) => a + b, 0) / both.length : 0 }

  return (
    <Layout current="/">
      <header className="grid gap-5">
        <PageHeader eyebrow="TAURON Arena Kraków · 3–4 October 2026" title="HackYeah 2026 Results">
          Every finalist from the organisers' announcement, ordered by result, with the public GitHub repo found for each team. Teams
          with public code have two scores out of 100 against their task's official weights: a blind review and an AI council score.
          Open a project to read its review.
        </PageHeader>
        <Stats
          items={[
            [`${placed.filter(p => p.repos?.length).length} / ${placed.length}`, "Placed teams with public code"],
            [tasks.flatMap(t => t.projects).filter(p => p.review).length, "Projects reviewed blind"],
            [gap.n ? fmt(gap.mean) : "–", gap.n ? `Points between council and blind review, ${gap.n} finalists` : "Points between council and blind review"],
            [`${agreed} / ${reviewable.length}`, "Tasks where the blind review's top pick won"],
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
                  By blind review score
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <TaskNav tasks={tasks} ours="sport" />
      </header>

      <ScoringPanel panel={panel} gap={gap} />

      <Panel>
        <h2 className="text-base font-medium">Blind review vs jury</h2>
        <ul className="grid gap-2.5">
          {FINDINGS.map(([lead, rest]) => (
            <li key={lead} className="grid grid-cols-[18px_minmax(0,1fr)] gap-2 before:mt-[7px] before:ml-1.5 before:size-1.5 before:rounded-full before:bg-muted-foreground/60 before:content-['']">
              <span>
                <span className="font-medium">{lead}</span>
                {rest}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          These are AI reviews of the public repos, not the jury's scoring sheets. The jury also saw each HackTribe entry and the live
          pitch; the blind reviews read code, decks, screenshots and commit history but did not run anything. The Sport &amp; Healthcare
          review ran inside the JustMate workspace.
        </p>
      </Panel>

      <main className="grid gap-10">
        {tasks.map(t => (
          <Section key={t.id} t={t} filter={filter} sort={sort} community={community[t.id] ?? []} council={council} open={open} setOpen={setOpen} />
        ))}
      </main>

      <Footer>
        <p>
          Results and finalists come from the organisers' announcements on 4 October 2026. Repos were matched the same evening by
          searching 672 public HackYeah 2026 repos (every file, plus 622 PDF, PPTX and DOCX pitch decks), GitHub accounts named after
          each team, and GitHub code search. A repo is "found" when the team name appears in it, its deck or its GitHub account, and a
          "likely match" when the project fits the task and the repo or product name points to the team.
        </p>
        <p>
          Weights come from each task's published rules and details documents; for Cracow without barriers, whose two documents give
          different weights, the details document is used. Blind reviews ran on 4 October 2026, one reviewer per task. SiteQuest
          (SiteQuestTeam) was left out of HubMI: its own context file says it was built for the Smart City task.
        </p>
        <p>
          Council scores come from council v{panel.version}. It isn't told the jury's result or the project's own blind score, but to keep
          one scale it sees the blind scores of two or three other finalists in the same task. Repos deleted or made private since the
          event can't be reviewed again.
        </p>
      </Footer>
    </Layout>
  )
}
