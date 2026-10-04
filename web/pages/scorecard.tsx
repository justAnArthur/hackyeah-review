import { useEffect, useState } from "react"
import { Bar, Fact, Footer, Layout, List, PageHeader, Panel, ResultBadge, Stats, TaskNav } from "@/components/layout"
import { AccordionContent, AccordionGroup, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { RESULT, fmt, reviewId } from "@/lib/site"
import type { CouncilReview, ScorecardProject, ScorecardTask } from "@/lib/types"

type Item = ScorecardProject & { link?: string; tests_label?: string }

const isWinner = (r: string | number) => r === "best" || r === 1
const placeName = (r: string | number) => (r === "best" ? "winner" : "1st place")

function councilItem(r: CouncilReview): Item {
  return {
    ...r,
    result: "self" as Item["result"],
    result_note: `Self-declared result: ${r.result}. Reviewed by council v${r.council.version}.`,
    link: `/r/${r.id}`,
    tests_label: r.tests.cases ? `${r.tests.cases} cases` : r.has_tests ? `${r.tests.files} files` : "None",
  }
}

const Details = ({ p, rank, of }: { p: Item; rank: number; of: number }) => (
  <div className="grid gap-3.5 pt-1 pb-3 pl-[46px] max-sm:pl-2.5">
    <p className="max-w-[62ch]">{p.verdict}</p>
    {p.result_note && <p className="text-xs text-muted-foreground">{p.result_note}</p>}
    <div className="grid gap-2.5">
      {p.scores.map(c => (
        <div key={c.criterion} className="grid gap-0.5">
          <div className="grid grid-cols-[minmax(0,1fr)_120px_32px] items-center gap-2.5 max-sm:grid-cols-[minmax(0,1fr)_80px_28px]">
            <div className="text-xs font-medium">
              {c.criterion}
              <span className="ml-1 font-normal text-muted-foreground/70">{c.weight}%</span>
            </div>
            <Bar value={c.score} max={10} />
            <div className="text-right text-xs font-medium tabular-nums">{fmt(c.score)}</div>
          </div>
          <p className="max-w-[66ch] text-xs text-muted-foreground">{c.why}</p>
        </div>
      ))}
    </div>
    <div className="grid grid-cols-4 gap-1.5 max-sm:grid-cols-2">
      <Fact label="Source lines">{p.source_loc ? `≈ ${Number(p.source_loc).toLocaleString("en")}` : "–"}</Fact>
      <Fact label="Tests">{p.tests_label ?? (p.has_tests ? "Yes" : "None")}</Fact>
      <Fact label="Claims built">{fmt(p.build_reality)} / 10</Fact>
      <Fact label="Reviewer rank">
        {rank} of {of}
      </Fact>
    </div>
    <div className="grid gap-1 text-xs text-muted-foreground">
      <div>
        <b className="font-medium text-foreground">Built during the event:</b> {p.built_during_event}
      </div>
      <div>
        <b className="font-medium text-foreground">Live demo:</b> {p.live_demo}
      </div>
    </div>
    <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
      <List title="Strengths" items={p.strengths} />
      <List title="Weaknesses" items={p.weaknesses} />
      <List title="Red flags" items={p.red_flags} red />
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {p.link && (
        <a href={p.link} className="text-muted-foreground hover:text-foreground">
          Open the full council review →
        </a>
      )}
      <a href={`https://github.com/${p.repo}`} target="_blank" rel="noopener" className="text-muted-foreground hover:text-foreground">
        Open repo on GitHub ↗
      </a>
    </div>
  </div>
)

const ProjectList = (props: { items: Item[]; task: string; open: string[]; setOpen: (ids: string[], open: string[]) => void }) => {
  const ids = props.items.map(p => reviewId(props.task, p.repo))
  return (
    <AccordionGroup type="multiple" className="w-full" value={props.open.filter(v => ids.includes(v))} onValueChange={(v: string[]) => props.setOpen(ids, v)}>
      {props.items.map((p, i) => (
        <AccordionItem key={p.repo} id={ids[i]} value={ids[i]} index={i} className={p.result === "ours" ? "bg-green-50/70 dark:bg-green-300/[.07]" : ""}>
          <AccordionTrigger>
            <span className="grid w-full grid-cols-[22px_minmax(0,1fr)_170px] items-center gap-x-3.5 py-1.5 max-sm:grid-cols-[22px_minmax(0,1fr)]">
              <span className="text-xs text-muted-foreground/70 tabular-nums">#{i + 1}</span>
              <span className="grid min-w-0 gap-px">
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-[14px]">{p.project}</span>
                  <ResultBadge result={p.result} />
                  <span className="text-xs text-muted-foreground">{p.team}</span>
                </span>
                <span className="font-mono text-[11.5px] text-muted-foreground/70 [overflow-wrap:anywhere]">{p.repo}</span>
              </span>
              <span className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-2.5 max-sm:col-start-2">
                <Bar value={p.weighted_total} max={100} cut ours={p.result === "ours"} />
                <span className="text-right text-[14px] font-medium tabular-nums">{fmt(p.weighted_total)}</span>
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <Details p={p} rank={i + 1} of={props.items.length} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </AccordionGroup>
  )
}

function agreement(t: ScorecardTask) {
  const top = t.projects[0]
  const won = t.projects.find(p => isWinner(p.result))
  if (!won) {
    const w = t.unscored.find(u => isWinner(u.result))
    return w ? <>No public repo found for the jury's {placeName(w.result)}, <b className="font-medium text-foreground">{w.team}</b>.</> : null
  }
  if (won === top) return <><b className="font-medium text-foreground">Agreement.</b> The reviewer's top score went to the jury's {placeName(won.result)}.</>
  return (
    <>
      <b className="font-medium text-foreground">Disagreement.</b> The jury's {placeName(won.result)}, {won.project}, scored {fmt(won.weighted_total)}; the
      reviewer's top pick, {top.project}, scored {fmt(top.weighted_total)}.
    </>
  )
}

const Section = (props: { t: ScorecardTask; community: CouncilReview[]; open: string[]; setOpen: (ids: string[], open: string[]) => void }) => {
  const { t } = props
  const community = props.community.map(councilItem).sort((a, b) => b.weighted_total - a.weighted_total)
  return (
    <section id={t.id} className="grid scroll-mt-6 gap-2.5">
      <div className="grid gap-1.5 px-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h2 className="text-base font-medium tracking-[-0.005em]">{t.name}</h2>
          <span className="text-xs text-muted-foreground">{t.kind}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {Object.entries(t.weights).map(([k, v]) => (
            <span key={k} className="rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground ring-1 ring-border ring-inset">
              {k} <b className="font-medium text-foreground tabular-nums">{v}</b>
            </span>
          ))}
        </div>
      </div>
      <Panel className="gap-0 p-1.5">
        <ProjectList items={t.projects} task={t.id} open={props.open} setOpen={props.setOpen} />
        {t.unscored.length > 0 && (
          <div className="mt-1.5 grid border-t border-border/60 pt-1">
            {t.unscored.map(u => (
              <div key={u.team} className="flex flex-wrap items-baseline gap-2 py-2 pl-[46px] text-xs text-muted-foreground max-sm:pl-2.5">
                <b className="text-[13px] font-normal text-foreground">{u.team}</b>
                <ResultBadge result={u.result} />
                No public repo found
              </div>
            ))}
          </div>
        )}
      </Panel>
      <div className="px-1 text-xs text-muted-foreground">{agreement(t)}</div>
      {community.length > 0 && (
        <div className="mt-1 grid gap-2">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-1 text-xs text-muted-foreground">
            <b className="text-[14px] font-medium text-foreground">Community submissions</b>
            Self-submitted and unverified, scored by the AI council, a different reviewer from the scores above
          </div>
          <Panel className="gap-0 p-1.5">
            <ProjectList items={community} task={`${t.id}--c`} open={props.open} setOpen={props.setOpen} />
          </Panel>
        </div>
      )}
    </section>
  )
}

export const ScorecardPage = ({ data }: { data: ScorecardTask[] }) => {
  const ours = data.flatMap(t => t.projects).find(p => p.result === "ours")
  const [open, setOpenState] = useState<string[]>(() => data.flatMap(t => t.projects.filter(p => p.result === "ours").map(p => reviewId(t.id, p.repo))))
  const [community, setCommunity] = useState<Record<string, CouncilReview[]>>({})

  const setOpen = (ids: string[], next: string[]) => setOpenState(prev => [...prev.filter(v => !ids.includes(v)), ...next])

  useEffect(() => {
    fetch("/api/community")
      .then(r => (r.ok ? r.json() : {}))
      .then(setCommunity)
      .catch(() => {})
  }, [])

  // deep links like /scorecard#sport--owner-repo open that review and scroll to it
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
  }, [community])

  const all = data.flatMap(t => t.projects)
  const reviewable = data.filter(t => t.projects.some(p => isWinner(p.result)))
  const agreed = reviewable.filter(t => isWinner(t.projects[0].result)).length
  const sport = data.find(t => t.id === "sport")
  const sportWinner = sport?.projects.find(p => p.result === "best")
  const weakest = ours && [...ours.scores].sort((a, b) => a.score - b.score)[0]

  return (
    <Layout current="/scorecard">
      <header className="grid gap-5">
        <PageHeader eyebrow="HackYeah 2026 · Blind repo review" title="HackYeah 2026 Scorecard">
          Every finalist with public code, reviewed against its task's official weights without knowing the result, shown next to
          what the jury decided. Scores are out of 100; the tick on each bar marks the 50% a project needs to win.
        </PageHeader>
        <Stats
          items={[
            [all.length, "Projects reviewed"],
            [`${agreed} / ${reviewable.length}`, "Tasks where the reviewer's top pick won"],
            [ours ? fmt(ours.weighted_total) : "–", "JustMate"],
            [sportWinner ? fmt(sportWinner.weighted_total) : "–", "Sport & Healthcare winner"],
          ]}
        />
        <TaskNav tasks={data} ours="sport" />
      </header>

      {ours && sport && sportWinner && weakest && (
        <Panel className="shadow-[var(--shadow-2),inset_0_0_0_1px_color-mix(in_srgb,var(--color-green-600)_30%,transparent)]">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <div>
              <h2 className="text-base font-medium">JustMate in Sport &amp; Healthcare</h2>
              <div className="text-muted-foreground">
                Ranked {sport.projects.indexOf(ours) + 1} of {sport.projects.length} by the reviewer,{" "}
                {fmt(ours.weighted_total - sportWinner.weighted_total)} points above the jury's winner.
              </div>
            </div>
            <div className="text-[34px] leading-none font-medium tracking-[-0.02em] tabular-nums">
              {fmt(ours.weighted_total)}
              <small className="text-[14px] font-normal tracking-normal text-muted-foreground"> / 100</small>
            </div>
          </div>
          <div className="grid gap-1.5">
            {sport.projects.map(p => (
              <div key={p.repo} className="grid grid-cols-[150px_minmax(0,1fr)_44px] items-center gap-2.5 max-sm:grid-cols-[110px_minmax(0,1fr)_40px]">
                <span className={p === ours ? "truncate text-xs font-medium" : "truncate text-xs text-muted-foreground"}>
                  {p.project} · {RESULT[p.result].label}
                </span>
                <Bar value={p.weighted_total} max={100} cut ours={p === ours} />
                <span className="text-right font-medium tabular-nums">{fmt(p.weighted_total)}</span>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground">
            Weakest criterion:{" "}
            <b className="font-medium text-foreground">
              {weakest.criterion}, {fmt(weakest.score)} / 10.
            </b>{" "}
            {weakest.why}
          </p>
        </Panel>
      )}

      <Panel>
        <h2 className="text-base font-medium">Reviewer vs jury</h2>
        <ul className="grid gap-2.5">
          {[
            ["The reviewer's top pick won in 1 of 5 tasks", " where the winner's code could be reviewed. Only Finance Without Intermediaries agrees: ProofBond, the one entry that leaves no admin or upgrade key behind."],
            ["Winners leaned on spectacle.", " A drone command centre over satellite imagery (Smart City), a 3D operating room (Sport & Healthcare) and product renders with a demo video (Defence) all scored lower on the repo than at least one other finalist. The jury watched five-minute pitches; the reviewer read code."],
            ["Category fit cost the most points.", " GROUND ZERO scored 5.5 on relation to Smart City, ViviOR 4.5 on Sport & Healthcare and JustMate 5.0. The jury seems to have forgiven a loose fit when the demo was striking."],
            ["Missing materials hurt in the repo, not on stage.", " Jakobiany won Cracow without barriers with the deepest engineering but no deck, video or business model in the repo, which is why the reviewer placed it third."],
          ].map(([lead, rest]) => (
            <li key={lead} className="grid grid-cols-[18px_minmax(0,1fr)] gap-2 before:mt-[7px] before:ml-1.5 before:size-1.5 before:rounded-full before:bg-muted-foreground/60 before:content-['']">
              <span>
                <b className="font-medium">{lead}</b>
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

      <main className="grid gap-9">
        {data.map(t => (
          <Section key={t.id} t={t} community={community[t.id] ?? []} open={open} setOpen={setOpen} />
        ))}
      </main>

      <Footer>
        <p>
          Weights come from each task's published rules and details documents. Where a partner task's two documents disagreed, the
          details document was used. Each task was reviewed by a separate reviewer on 4 October 2026, scoring each criterion from 0
          to 10 and weighting the total to 100.
        </p>
        <p>
          SiteQuest (SiteQuestTeam) was dropped from HubMI: its own context file says it was built for the Smart City task, so it is
          not the HubMI finalist's entry.
        </p>
      </Footer>
    </Layout>
  )
}
