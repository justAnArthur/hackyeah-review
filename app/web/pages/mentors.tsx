import { useState } from "react"
import { Search } from "lucide-react"
import { Footer, Layout, PageHeader, Stats } from "@/components/layout"
import { Badge, type BadgeColor } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { InputField, InputGroup } from "@/components/ui/input-group"
import { TabItem, Tabs, TabsList } from "@/components/ui/tabs"
import { MENTORS, type Mentor, type MentorMatch } from "@/data/mentors"

type Filter = "all" | MentorMatch

const MATCH: Record<MentorMatch, { label: string; color: BadgeColor }> = {
  ok: { label: "Confirmed", color: "green" },
  prob: { label: "Name match", color: "amber" },
  none: { label: "No profile found", color: "gray" },
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map(w => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

// initials sit under the photo, so a Discord avatar that has since been
// changed or expired falls back to initials on its own
const Avatar = ({ m }: { m: Mentor }) => (
  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-medium text-muted-foreground shadow-surface-2">
    <span className="absolute">{initials(m.name)}</span>
    {m.img && (
      <img
        src={m.img}
        alt=""
        loading="lazy"
        className="relative size-10 rounded-full object-cover"
        onError={e => {
          e.currentTarget.style.display = "none"
        }}
      />
    )}
  </div>
)

const Row = ({ m }: { m: Mentor }) => {
  const match = MATCH[m.match]
  return (
    <div className="flex items-center gap-3 py-3 pr-1 pl-1 max-sm:items-start">
      <Avatar m={m} />
      <div className="grid min-w-0 flex-1 gap-px">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-medium">{m.name}</span>
          <span className="font-mono text-[11px] text-muted-foreground">@{m.handle}</span>
        </div>
        <span className="text-xs text-muted-foreground">{m.role}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2 max-sm:mt-1.5">
        <Badge color={match.color} variant="dot" size="compact">
          {match.label}
        </Badge>
        {m.li ? (
          <Button
            variant="secondary"
            size="compact"
            nativeButton={false}
            render={<a href={m.li} target="_blank" rel="noopener noreferrer" />}
          >
            LinkedIn
          </Button>
        ) : (
          <span className="px-2 text-xs text-muted-foreground">—</span>
        )}
      </div>
    </div>
  )
}

export const MentorsPage = () => {
  const [filter, setFilter] = useState<Filter>("all")
  const [q, setQ] = useState("")

  const query = q.trim().toLowerCase()
  const shown = MENTORS.filter(m => {
    if (filter !== "all" && m.match !== filter) return false
    if (!query) return true
    return `${m.name} @${m.handle} ${m.role}`.toLowerCase().includes(query)
  })

  const found = MENTORS.filter(m => m.li).length
  const ok = MENTORS.filter(m => m.match === "ok").length

  return (
    <Layout current="/mentors">
      <header className="grid gap-5">
        <PageHeader eyebrow="Official Discord · HY-mentor role" title="HackYeah 2026 mentors">
          Everyone who carried the HY-mentor role on the event Discord, with the LinkedIn profile found
          for each and how sure the match is. Names, roles and companies were cross-checked against the
          organisers&apos; mentor list; this page is unlisted and not indexed.
        </PageHeader>
        <Stats
          items={[
            [MENTORS.length, "Mentors"],
            [found, "LinkedIn profiles"],
            [ok, "Confirmed"],
            [MENTORS.length - found, "No public profile"],
          ]}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={filter} onValueChange={v => setFilter(v as Filter)}>
            <TabsList>
              <TabItem value="all" label="All" />
              <TabItem value="ok" label="Confirmed" />
              <TabItem value="prob" label="Name match" />
              <TabItem value="none" label="Not found" />
            </TabsList>
          </Tabs>
          <InputGroup className="w-full sm:w-72" size="compact">
            <InputField
              index={0}
              label="Search mentors"
              labelHidden
              placeholder="Search name, handle, role…"
              icon={Search}
              value={q}
              onChange={setQ}
            />
          </InputGroup>
        </div>
      </header>

      <main className="grid gap-2 rounded-xl bg-surface-2 px-3 py-1 shadow-surface-2">
        {shown.length ? (
          shown.map(m => (
            <div key={m.handle} className="border-t border-border/60 first:border-t-0">
              <Row m={m} />
            </div>
          ))
        ) : (
          <p className="px-1 py-3 text-xs text-muted-foreground">No mentor matches this filter.</p>
        )}
      </main>

      <Footer>
        <p>
          Mentors and photos come from the official HackYeah 2026 Discord member list (5 October 2026);
          a photo disappears when someone changes their Discord avatar. Roles and companies were verified
          against hackyeah.pl/mentors and each person&apos;s public LinkedIn.
        </p>
        <p>
          Confirmed means the profile ties to HackYeah or to the company the organisers list; a name match
          is the only public profile with that name, without a direct tie. LinkedIn hides many profiles
          from logged-out search, so the two without a link may still have one behind a login.
        </p>
      </Footer>
    </Layout>
  )
}
