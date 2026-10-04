import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TabItem, Tabs, TabsList } from "@/components/ui/tabs"
import { ICON, PAGES, RESULT } from "@/lib/site"
import { cn } from "@/lib/utils"

// every page shares this column, so the home page, scorecard, form and review line up
export const Layout = ({ current, children }: { current: string; children: ReactNode }) => (
  <div className="mx-auto grid w-full max-w-[760px] min-w-0 gap-10 px-4 pt-14 pb-18 text-[13px] leading-normal max-sm:pt-8">
    <Sitebar current={current} />
    {children}
  </div>
)

const Sitebar = ({ current }: { current: string }) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <a href="/" className="flex items-center gap-2 font-medium">
      <img src={ICON} alt="" className="size-5 rounded-md" />
      HackYeah 2026 Review
    </a>
    <div className="flex flex-wrap items-center gap-2">
      <Tabs value={current}>
        <TabsList>
          {PAGES.map(p => (
            <TabItem key={p.href} value={p.href} label={p.label} nativeButton={false} render={<a href={p.href} />} />
          ))}
        </TabsList>
      </Tabs>
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

export const ResultBadge = ({ result, children }: { result: string | number; children?: ReactNode }) => {
  const r = RESULT[result] ?? RESULT.fin
  return (
    <Badge color={r.color} variant={r.dot ? "dot" : "solid"} size="compact">
      {children ?? r.label}
    </Badge>
  )
}

export const Panel = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cn("grid min-w-0 gap-4 rounded-xl bg-surface-2 p-4 shadow-surface-2", className)}>{children}</div>
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
