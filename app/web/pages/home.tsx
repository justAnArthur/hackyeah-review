import { useEffect, useMemo, useState } from "react"
import { Bar, Footer, Layout, PageHeader, Panel, Stats, TaskNav } from "@/components/layout"
import { ProjectList } from "@/components/project-card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { TabItem, Tabs, TabsList } from "@/components/ui/tabs"
import { type CommunityEntry, type CouncilScore, type Project, type Sort, type Task, communityProject, mergeTasks, sortCommunity, sortProjects } from "@/lib/projects"
import { RESULT, fmt } from "@/lib/site"
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
  if (won === top) return <><span className="text-foreground">Agreement.</span> The reviewer's top score went to the jury's {placeName(won.result)}.</>
  return (
    <>
      <span className="text-foreground">Disagreement.</span> The jury's {placeName(won.result)}, {won.project}, scored {fmt(won.weighted_total)}; the
      reviewer's top pick, {top.project}, scored {fmt(top.weighted_total)}.
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
            Self-submitted and unverified, scored by the AI council, a different reviewer from the blind reviews above
          </div>
          <ProjectList task={t} projects={community} open={props.open} setOpen={props.setOpen} />
        </div>
      )}
    </section>
  )
}

const OursPanel = ({ tasks }: { tasks: Task[] }) => {
  const sport = tasks.find(t => t.id === "sport")
  const reviewed = sport?.projects.filter(p => p.review).sort((a, b) => b.review!.weighted_total - a.review!.weighted_total) ?? []
  const ours = reviewed.find(p => p.ours)
  const winner = reviewed.find(p => p.place === "best")
  if (!ours?.review || !winner?.review) return null
  const weakest = [...ours.review.scores].sort((a, b) => a.score - b.score)[0]
  return (
    <Panel className="shadow-[var(--shadow-2),inset_0_0_0_1px_color-mix(in_srgb,var(--color-green-600)_30%,transparent)]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="text-base font-medium">JustMate in Sport &amp; Healthcare</h2>
          <div className="text-muted-foreground">
            Ranked {reviewed.indexOf(ours) + 1} of {reviewed.length} by the reviewer, {fmt(ours.review.weighted_total - winner.review.weighted_total)} points
            above the jury's winner, and not a finalist.
          </div>
        </div>
        <div className="text-[34px] leading-none font-medium tracking-[-0.02em] tabular-nums">
          {fmt(ours.review.weighted_total)}
          <small className="text-[14px] font-normal tracking-normal text-muted-foreground"> / 100</small>
        </div>
      </div>
      <div className="grid gap-1.5">
        {reviewed.map(p => (
          <a
            key={p.id}
            href={`#${p.id}`}
            className="grid grid-cols-[150px_minmax(0,1fr)_44px] items-center gap-2.5 rounded-md max-sm:grid-cols-[110px_minmax(0,1fr)_40px]"
          >
            <span className={p.ours ? "truncate text-xs font-medium" : "truncate text-xs text-muted-foreground"}>
              {p.title} · {p.ours ? "Our entry" : RESULT[p.place ?? "fin"].label}
            </span>
            <Bar value={p.review!.weighted_total} max={100} cut ours={p.ours} />
            <span className="text-right font-medium tabular-nums">{fmt(p.review!.weighted_total)}</span>
          </a>
        ))}
      </div>
      <p className="text-muted-foreground">
        Weakest criterion:{" "}
        <span className="font-medium text-foreground">
          {weakest.criterion}, {fmt(weakest.score)} / 10.
        </span>{" "}
        {weakest.why}
      </p>
    </Panel>
  )
}

const FINDINGS = [
  ["The reviewer's top pick won in 1 of 5 tasks", " where the winner's code could be reviewed. Only Finance Without Intermediaries agrees: ProofBond, the one entry that leaves no admin or upgrade key behind."],
  ["Winners leaned on spectacle.", " A drone command centre over satellite imagery (Smart City), a 3D operating room (Sport & Healthcare) and product renders with a demo video (Defence) all scored lower on the repo than at least one other finalist. The jury watched five-minute pitches; the reviewer read code."],
  ["Category fit cost the most points.", " GROUND ZERO scored 5.5 on relation to Smart City, ViviOR 4.5 on Sport & Healthcare and JustMate 5.0. The jury seems to have forgiven a loose fit when the demo was striking."],
  ["Missing materials hurt in the repo, not on stage.", " Jakobiany won Cracow without barriers with the deepest engineering but no deck, video or business model in the repo, which is why the reviewer placed it third."],
]

export const HomePage = ({ data }: { data: ScorecardTask[] }) => {
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

  return (
    <Layout current="/">
      <header className="grid gap-5">
        <PageHeader eyebrow="TAURON Arena Kraków · 3–4 October 2026" title="HackYeah 2026 Results">
          Every finalist from the organisers' announcement, ordered by result, with the public GitHub repo found for each team. Teams
          with public code were reviewed blind against their task's official weights; open a project to read its review. Scores are
          out of 100.
        </PageHeader>
        <Stats
          items={[
            [tasks.length, "Tasks"],
            [`${placed.filter(p => p.repos?.length).length} / ${placed.length}`, "Placed teams with public code"],
            [tasks.flatMap(t => t.projects).filter(p => p.review).length, "Projects reviewed blind"],
            [`${agreed} / ${reviewable.length}`, "Tasks where the reviewer's top pick won"],
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
          <div className="w-44">
            <Select value={sort} onValueChange={v => save({ sort: v as Sort })}>
              <SelectTrigger variant="borderless" />
              <SelectContent>
                <SelectItem index={0} value="result">
                  Winners, then finalists
                </SelectItem>
                <SelectItem index={1} value="score">
                  By review score
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <TaskNav tasks={tasks} ours="sport" />
      </header>

      <OursPanel tasks={tasks} />

      <Panel>
        <h2 className="text-base font-medium">Reviewer vs jury</h2>
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
          pitch; the reviewers read code, decks, screenshots and commit history but did not run anything. The Sport &amp; Healthcare
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
          Weights come from each task's published rules and details documents; where a partner task's two documents disagreed, the
          details document was used. Each task was reviewed by a separate reviewer on 4 October 2026, scoring each criterion from 0 to
          10 without knowing the result. SiteQuest (SiteQuestTeam) was left out of HubMI: its own context file says it was built for
          the Smart City task.
        </p>
      </Footer>
    </Layout>
  )
}
