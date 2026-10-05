import { CircleDashed, LoaderCircle } from "lucide-react"
import { Bar, Fact, List } from "@/components/layout"
import { AccordionContent, AccordionGroup, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ThinkingIndicator } from "@/components/ui/thinking-indicator"
import { fontWeights } from "@/lib/font-weight"
import type { Pending, Project, Task } from "@/lib/projects"
import { reviewRank } from "@/lib/projects"
import { GH, RESULT, fmt } from "@/lib/site"
import { cn } from "@/lib/utils"

const NORMAL = { fontVariationSettings: fontWeights.normal }

function pendingWords(p: Pending) {
  if (p.status === "running") return ["Reviewing", "Reading the repo", "Scoring", "Writing the verdict"]
  if (p.status === "waiting_quota") return ["Waiting for quota"]
  return [p.position > 1 ? `In queue · #${p.position}` : "Up next"]
}

// an upload still being reviewed: the ai indicator stands where the score will be
const PendingScore = ({ pending }: { pending: Pending }) => (
  <span className="shrink-0 self-center">
    <ThinkingIndicator size="compact" words={pendingWords(pending)} className="px-0 py-0 text-[13px]" />
  </span>
)

// 32px tile like Fluid's CardMedia: the repo owner's avatar, or a dashed circle when there's no public code
const Media = ({ p }: { p: Project }) => {
  const owner = (p.review?.repo ?? p.repos?.[0])?.split("/")[0]
  if (!owner) {
    return (
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <CircleDashed size={16} strokeWidth={1.5} />
      </span>
    )
  }
  return (
    <img
      src={`https://github.com/${owner}.png?size=64`}
      alt=""
      loading="lazy"
      className="size-8 shrink-0 rounded-lg bg-muted object-cover outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
    />
  )
}

const PlaceBadge = ({ p }: { p: Project }) => {
  if (p.self) return <Badge color="blue" size="compact">Self-submitted</Badge>
  if (p.ours) return <Badge color="green" size="compact">Our entry</Badge>
  if (!p.place) {
    return (
      <Badge color="gray" variant="dot" size="compact">
        Finalist
      </Badge>
    )
  }
  const r = RESULT[p.place]
  return (
    <Badge color={r.color} size="compact">
      {r.label}
    </Badge>
  )
}

function subtitle(p: Project) {
  const parts = [p.title === p.team ? null : p.team]
  if (p.status === "likely") parts.push("Likely match")
  if (p.status === "none" || p.status === "removed") parts.push("No public repo found")
  if (p.ours && !p.place) parts.push("Did not reach the final")
  return parts.filter(Boolean).join(" · ") || (p.review?.repo ?? p.repos?.[0] ?? "")
}

const Row = ({ p, open }: { p: Project; open: boolean }) => (
  <span className="flex w-full min-w-0 items-start gap-3 py-0.5">
    <Media p={p} />
    <span className="grid min-w-0 flex-1 gap-0.5">
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="truncate text-[14px] text-foreground">{p.title}</span>
        <PlaceBadge p={p} />
      </span>
      <span className="truncate text-[13px] text-muted-foreground" style={NORMAL}>
        {subtitle(p)}
      </span>
      {p.desc && (
        <span className={cn("mt-1 max-w-[62ch] text-[13px] leading-normal text-foreground/80", !open && "line-clamp-2")} style={NORMAL}>
          {p.desc}
        </span>
      )}
    </span>
    {p.review && (
      <span className="grid w-[72px] shrink-0 justify-items-end gap-1.5 max-sm:w-12">
        <span className="text-[14px] text-foreground tabular-nums" style={{ fontVariationSettings: fontWeights.medium }}>
          {fmt(p.review.weighted_total)}
        </span>
        <span className="w-full">
          <Bar value={p.review.weighted_total} max={100} ours={p.ours} />
        </span>
        {p.council && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums" style={NORMAL} title="Council score">
            {p.council.total === null ? (
              <>
                <LoaderCircle size={10} strokeWidth={2} className="animate-spin motion-reduce:animate-none" aria-hidden />
                council
              </>
            ) : (
              `council ${fmt(p.council.total)}`
            )}
          </span>
        )}
      </span>
    )}
    {!p.review && p.pending && <PendingScore pending={p.pending} />}
  </span>
)

const LinkButton = ({ href, children, external }: { href: string; children: string; external?: boolean }) => (
  <Button
    variant="secondary"
    size="compact"
    nativeButton={false}
    render={<a href={href} {...(external ? { target: "_blank", rel: "noopener" } : {})} />}
    className="max-w-full"
  >
    <span className="truncate">{children}</span>
    {external ? " ↗" : " →"}
  </Button>
)

const Details = ({ p, task }: { p: Project; task: Task }) => {
  const r = p.review
  const rank = r && !p.self ? reviewRank(task, p) : null
  const links = [
    ...(p.repos ?? []).map(repo => ({ href: GH + repo, label: repo, external: true })),
    ...(p.demo ? [{ href: p.demo, label: "Live demo", external: true }] : []),
    ...(r?.link ? [{ href: r.link, label: "Full council review", external: false }] : []),
    ...(p.council ? [{ href: `/r/${p.council.id}`, label: p.council.total === null ? "Council review in progress" : `Council review · ${fmt(p.council.total)}`, external: false }] : []),
    ...(p.pending && p.reviewUrl ? [{ href: p.reviewUrl, label: "Follow the review live", external: false }] : []),
  ]
  return (
    <div className="grid gap-4 pt-1 pb-2 pl-11 text-foreground max-sm:pl-0" style={NORMAL}>
      {p.note && <p className="max-w-[62ch] text-xs text-muted-foreground">{p.note}</p>}

      {links.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {links.map(l => (
            <LinkButton key={l.href} href={l.href} external={l.external}>
              {l.label}
            </LinkButton>
          ))}
        </div>
      )}
      {p.other?.map(o => (
        <div key={o.repo} className="text-xs text-muted-foreground">
          Their {o.task} entry, not this one:{" "}
          <a href={GH + o.repo} target="_blank" rel="noopener" className="font-mono hover:text-foreground">
            {o.repo} ↗
          </a>
        </div>
      ))}

      {r && (
        <div className="grid gap-4 rounded-xl bg-surface-2 p-4 text-foreground shadow-surface-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="text-xs text-muted-foreground">{p.self ? "Council review" : "Blind review by Claude Opus"} · against the task's official weights</div>
            <div className="text-[22px] leading-none tabular-nums" style={{ fontVariationSettings: fontWeights.medium }}>
              {fmt(r.weighted_total)}
              <small className="text-xs text-muted-foreground"> / 100</small>
            </div>
          </div>
          <p className="max-w-[62ch]">{r.verdict}</p>
          {r.result_note && <p className="text-xs text-muted-foreground">{r.result_note}</p>}
          <div className="grid gap-2.5">
            {r.scores.map(c => (
              <div key={c.criterion} className="grid gap-0.5">
                <div className="grid grid-cols-[minmax(0,1fr)_120px_32px] items-center gap-2.5 max-sm:grid-cols-[minmax(0,1fr)_72px_28px]">
                  <div className="text-xs">
                    {c.criterion}
                    <span className="ml-1 text-muted-foreground/70">{c.weight}%</span>
                  </div>
                  <Bar value={c.score} max={10} />
                  <div className="text-right text-xs tabular-nums">{fmt(c.score)}</div>
                </div>
                <p className="max-w-[66ch] text-xs text-muted-foreground">{c.why}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1.5 max-sm:grid-cols-2">
            <Fact label="Source lines">{r.source_loc ? `≈ ${Number(r.source_loc).toLocaleString("en")}` : "–"}</Fact>
            <Fact label="Tests">{r.tests_label ?? (r.has_tests ? "Yes" : "None")}</Fact>
            <Fact label="Claims built">{fmt(r.build_reality)} / 10</Fact>
            <Fact label="Reviewer rank">{rank ? `${rank.rank} of ${rank.of}` : "–"}</Fact>
          </div>
          <div className="grid gap-1 text-xs text-muted-foreground">
            <div>
              <span className="text-foreground">Built during the event:</span> {r.built_during_event}
            </div>
            <div>
              <span className="text-foreground">Live demo:</span> {r.live_demo}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
            <List title="Strengths" items={r.strengths} />
            <List title="Weaknesses" items={r.weaknesses} />
            <List title="Red flags" items={r.red_flags} red />
          </div>
        </div>
      )}
    </div>
  )
}

const expandable = (p: Project) => !!(p.note || p.repos?.length || p.review)

export const ProjectList = (props: { task: Task; projects: Project[]; open: string[]; setOpen: (ids: string[], open: string[]) => void }) => {
  const ids = props.projects.map(p => p.id)
  return (
    <div className="rounded-xl border border-border/60 p-1">
      <AccordionGroup
        type="multiple"
        className="w-full"
        value={props.open.filter(v => ids.includes(v))}
        onValueChange={(v: string[]) => props.setOpen(ids, v)}
      >
        {props.projects.map((p, i) => (
          <AccordionItem
            key={p.id}
            id={p.id}
            value={p.id}
            index={i}
            disabled={!expandable(p)}
            className={cn("scroll-mt-6", p.ours && "bg-green-50/70 dark:bg-green-300/[.07]")}
          >
            <AccordionTrigger className={expandable(p) ? undefined : "cursor-default [&>span:last-child]:invisible"}>
              <Row p={p} open={props.open.includes(p.id)} />
            </AccordionTrigger>
            <AccordionContent>
              <Details p={p} task={props.task} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </AccordionGroup>
    </div>
  )
}
