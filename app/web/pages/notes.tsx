import { Footer, Layout, PageHeader, Panel, Stats } from "@/components/layout"

// every number on this page is history: the event ended 4 October 2026 and the reviews finished on 11 October
const GAP_ROWS = [
  ["v2", "4 free models, small pack", "3", "5.2", "2 / 3"],
  ["v5", "glm judge, calibration anchors", "12 / 25", "5.5", "4 / 12"],
  ["v8", "audited guides, retries", "15 / 25", "6.2", "8 / 15"],
] as const

export const NotesPage = () => (
  <Layout current="/notes">
    <PageHeader eyebrow="Post-mortem · October 2026" title="Notes from the review council">
      Our team entered JustMate in the Sport &amp; Healthcare task, didn&apos;t reach the final, and got no evaluation comments — like
      most teams. So we built a council that scores every finalist the same way, from what is public, and let any team send its own
      project for free. This page is what nine versions of panel design measured, what broke along the way, and where the council
      disagreed with the jury.
    </PageHeader>

    <Stats
      items={[
        [62, "Reviews written"],
        [41, "Community submissions"],
        [9, "Council versions"],
        [25, "Finalists with public code"],
      ]}
    />

    <Panel>
      <h2 className="text-base font-medium">The idea</h2>
      <p>
        Three fixed models read an evidence pack built from the repo: measured facts such as code size, tests and commit history, the
        team&apos;s deck, committed decks and docs, the demo page text and descriptions of its screenshots — at most about 75k tokens.
        Each model scores every official criterion of the task from 0 to 10; the median counts, the task&apos;s official weights turn it
        into a score out of 100, and a fourth model writes the review. The council never runs the code, never sees the pitch, and for
        finalists is never told how the project placed.
      </p>
      <p className="text-muted-foreground">
        The full design — the prompts, the per-task rubrics and reviewing guides built from the official rules, the queue that gives
        every project the identical panel — is in the repo.
      </p>
    </Panel>

    <Panel>
      <h2 className="text-base font-medium">What the measurements said</h2>
      <p>
        Before the council, every project with public code had a blind review by one strong model. The council was measured against
        those blind reviews — mean absolute gap per project, and how often the top-ranked project was the same:
      </p>
      <div className="grid grid-cols-[repeat(5,minmax(0,1fr))] gap-2 text-xs max-sm:grid-cols-[repeat(5,minmax(0,1fr))]">
        {["Version", "Panel", "Compared", "Mean abs gap", "Within ±5"].map(h => (
          <span key={h} className="text-muted-foreground">
            {h}
          </span>
        ))}
        {GAP_ROWS.map(r =>
          r.map((cell, i) => (
            <span key={`${r[0]}-${i}`} className={i === 0 ? "font-medium" : "tabular-nums"}>
              {cell}
            </span>
          )),
        )}
      </div>
      <p>
        In every task with several reviewed projects, the council&apos;s top project was also the blind review&apos;s top project. It was
        <b> never the jury&apos;s winner</b>: in the five tasks whose winner was reviewed, the winners scored 57.5–69 (average 63.7,
        solidly strong) while the council&apos;s top project scored 66–83. The other five winners were never reviewed — four had no
        public repo found by the search, and one was deleted or made private after the event.
      </p>
      <p className="text-muted-foreground">
        That gap is the finding, not a defect: the jury also had mentors&apos; notes, the paper round and the live pitch; the council
        read only what was public. A high council score means strong public work, not that the jury was wrong.
      </p>
    </Panel>

    <Panel>
      <h2 className="text-base font-medium">What broke</h2>
      <ul className="grid list-disc gap-1.5 pl-4">
        <li>
          One member&apos;s upstream provider answers HTTP 400 to any request containing a jailbreak phrase — and evidence packs
          deliberately contain them, because teams test prompt injection. Jailbreak strings are now masked everywhere, a refused
          request is resent up to four times, and only then does the member read a pack without quoted code.
        </li>
        <li>
          Free-model quotas and busy spells shaped the queue: rate-limited members are waited for with a growing backoff, a used-up
          plan window is retried every 30 minutes, and the panel never shrinks — every project faces the identical three members.
        </li>
        <li>
          The prompt-injection scan first flagged any mention of a system prompt, putting false &quot;tries to steer the reviewers&quot;
          flags on five projects; it now flags score-steering anywhere, and jailbreak attempts only in text the team itself wrote.
        </li>
        <li>
          Deploys overlap for about a minute with two workers on one SQLite database; jobs are claimed atomically and a job with no
          progress for 20 minutes goes back to the queue.
        </li>
      </ul>
    </Panel>

    <Panel>
      <h2 className="text-base font-medium">How it ended</h2>
      <p>
        The form was open for the event week, 4–11 October 2026: 62 reviews in total — 21 finalists and 41 projects teams sent in
        themselves. When the queue drained, the form closed and the site became this static archive; the repo keeps the council, the
        evidence builder, the prompts and every review.
      </p>
      <p className="text-muted-foreground">
        If your project was reviewed, the number was written by the panel above, the same one every other project faced. Thanks to
        every team that sent its work in.
      </p>
    </Panel>

    <Footer>
      <p>
        Measurements compared the council with blind reviews made before it; until v8 the calibration anchors showed members those
        earlier scores, so agreement is not fully independent of them. The 21 finalist reviews span council v8 and v9.
      </p>
      <p>
        Winners, finalists and weights come from the organisers&apos; announcements; repo matching searched 672 public HackYeah 2026
        repos and the teams&apos; pitch decks.
      </p>
    </Footer>
  </Layout>
)
