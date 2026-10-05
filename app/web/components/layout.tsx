import type { ReactNode } from "react"
import { Star } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { GH, ICON, REPO, REPO_IMAGE, RESULT } from "@/lib/site"
import { cn } from "@/lib/utils"

// every page shares this column, so the results, form and review line up
export const Layout = ({ current, children }: { current: string; children: ReactNode }) => (
  <div className="mx-auto grid w-full max-w-[760px] min-w-0 gap-10 px-4 pt-14 pb-18 text-[13px] leading-normal max-sm:pt-8">
    <Sitebar current={current} />
    {children}
    <RepoCard />
  </div>
)

const RepoCard = () => (
  <div className="grid grid-cols-[14rem_1fr] items-center gap-4 rounded-xl bg-surface-2 p-3 shadow-surface-2 max-sm:grid-cols-1">
    <a href={GH + REPO} tabIndex={-1} aria-hidden>
      <img
        src={REPO_IMAGE}
        alt=""
        width={1200}
        height={600}
        loading="lazy"
        className="aspect-[2/1] w-full rounded-lg bg-white object-cover ring-1 ring-border/60"
      />
    </a>
    <div className="grid content-start justify-items-start gap-2 px-1 pb-1">
      <div className="grid gap-1">
        <div className="font-medium">The site is open source</div>
        <p className="text-muted-foreground">
          The council, the evidence pack, the prompts and the queue are all on GitHub. If a review helped you, a star helps other
          teams find it.
        </p>
      </div>
      <Button variant="secondary" size="compact" leadingIcon={Star} nativeButton={false} render={<a href={GH + REPO} />}>
        Star on GitHub
      </Button>
    </div>
  </div>
)

const Sitebar = ({ current }: { current: string }) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <a href="/" className="flex items-center gap-2 font-medium">
      <img src={ICON} alt="" className="size-5 rounded-md" />
      HackYeah 2026 Review
    </a>
    <div className="flex flex-wrap items-center gap-2">
      {current !== "/" && (
        <Button variant="ghost" nativeButton={false} render={<a href="/" />}>
          Results
        </Button>
      )}
      <Button variant={current === "/submit" ? "secondary" : "primary"} nativeButton={false} render={<a href="/submit" />}>
        Review my project
      </Button>
    </div>
  </div>
)

export const PageHeader = (props: { eyebrow: ReactNode; title: string; children?: ReactNode }) => (
  <div className="grid gap-1.5">
    <div className="text-xs text-muted-foreground">{props.eyebrow}</div>
    <h1 className="text-[22px] leading-tight font-medium tracking-[-0.01em] text-balance">{props.title}</h1>
    {props.children && <p className="max-w-[62ch] text-muted-foreground">{props.children}</p>}
  </div>
)

export const Stats = ({ items }: { items: [ReactNode, string][] }) => (
  <div className="grid grid-cols-4 gap-2 max-sm:grid-cols-2">
    {items.map(([value, label]) => (
      <div key={label} className="grid content-start gap-0.5 rounded-xl bg-surface-3 px-3.5 py-3 shadow-surface-2">
        <b className="text-[22px] leading-tight font-medium tracking-[-0.01em] tabular-nums">{value}</b>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    ))}
  </div>
)

export const TaskNav = ({ tasks, ours }: { tasks: { id: string; name: string }[]; ours?: string }) => (
  <nav aria-label="Tasks" className="-mx-1 flex gap-0.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none]">
    {tasks.map(t => (
      <Button key={t.id} variant="ghost" size="compact" nativeButton={false} render={<a href={`#${t.id}`} />} className="shrink-0">
        {t.name}
        {t.id === ours && <span className="size-1.5 rounded-full bg-green-600 dark:bg-green-300" />}
      </Button>
    ))}
  </nav>
)

export const Bar = ({ value, max, cut, ours }: { value: number; max: number; cut?: boolean; ours?: boolean }) => (
  <div className="relative h-1.5 rounded-full bg-foreground/[.07]">
    <i
      className={cn("absolute inset-y-0 left-0 rounded-full", ours ? "bg-green-600 dark:bg-green-300" : "bg-foreground/80")}
      style={{ width: `${(value / max) * 100}%` }}
    />
    {cut && <span className="absolute -inset-y-[3px] left-1/2 w-px bg-muted-foreground/60" />}
  </div>
)

export const ResultBadge = ({ result }: { result: string | number }) => {
  const r = RESULT[result] ?? RESULT.fin
  return (
    <Badge color={r.color} variant={r.dot ? "dot" : "solid"} size="compact">
      {r.label}
    </Badge>
  )
}

export const Panel = ({ children }: { children: ReactNode }) => (
  <div className="grid min-w-0 gap-4 rounded-xl bg-surface-2 p-4 shadow-surface-2">{children}</div>
)

export const Footer = ({ children }: { children: ReactNode }) => (
  <footer className="grid max-w-[68ch] gap-2 px-1 text-xs text-muted-foreground">{children}</footer>
)

export const List = ({ title, items, red }: { title: string; items: string[]; red?: boolean }) =>
  items.length ? (
    <div>
      <h4 className={cn("mb-1 text-xs font-medium", red && "text-destructive")}>{title}</h4>
      <ul className="grid list-disc gap-1 pl-3.5 text-xs text-muted-foreground">
        {items.map(x => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  ) : null

export const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid min-w-0 gap-px rounded-lg bg-surface-3 px-2.5 py-2 shadow-surface-2">
    <span className="text-[11px] text-muted-foreground">{label}</span>
    <b className="font-medium tabular-nums [overflow-wrap:anywhere]">{children}</b>
  </div>
)
