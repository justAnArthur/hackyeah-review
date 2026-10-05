# HackYeah 2026 Review

HackYeah 2026 finalists and winners with the public repo found for each team, every project with public code scored by an AI council against its task's official criteria and weights, and a form where any team can send its own project to the same council.

Live: https://hackyeah-review.justadomainname.dev

## Pages

- `/` — every finalist by task, ordered by result or by score. Each project card shows its council score, or its place in the queue with a live indicator, and opens to its repo links and council review (scores per criterion, facts, strengths and weaknesses); community submissions sit under their task. `/scorecard` redirects here
- `/submit` — "Review my project" form with the same fields as the HackTribe entry
- `/r/<id>` — live progress and the council's review for one submission

## Council review

A submission goes through a queue in one Bun process (`app/server/`):

1. **Evidence** (`app/server/evidence.ts`, `app/server/extract.ts`): the server collects the facts. It reads GitHub metadata and commit history, downloads the repo tarball, and counts source lines and tests. It extracts the text of the uploaded deck and of PDF, PowerPoint and Word decks committed to the repo (image-only PDFs are rendered and described), includes the README and docs in full, reads the static text of the demo pages, and samples the manifests and the most central source files. A vision model describes up to five screenshots as text. The result is one evidence pack of up to about 75k tokens. Team-written text is marked untrusted, and attempts to steer the score become red flags.
2. **Council** (`app/server/council.ts`, `review/council.toml`): three fixed members score the pack against the task's rubric (`review/rubrics/<task>.toml`), the official weights, the task's reviewing guide (`review/guides/<task>.md`). Since v9 there are no calibration anchors: members score from the rubric, the guide and the scale alone. The score per criterion is the median; the spread shows disagreement. A judge writes the consolidated text and rates each member's agreement; it never sets the numbers. Prompts: `review/prompts/council-member.md`, `review/prompts/council-judge.md`.
3. **Queue** (`app/server/queue.ts`): one job at a time. Every project faces the identical panel, so the panel never shrinks: a rate-limited member is waited for (60 s, doubling to 30 min), a garbled reply or an upstream provider error is retried with the job (finished members are kept), and only a permanent failure such as a bad key ends a review. Every finished step is stored in SQLite, so a restart resumes. Changing a model or a prompt means bumping `version` in `review/council.toml`.

Where the models run (`app/server/models.ts`):

- `claude:<model>` runs the Claude Code CLI headless (`--safe-mode --restricted`, empty working directory) against z.ai's Anthropic-compatible endpoint, on the GLM Coding Plan (`ZAI_API_KEY`, or `CLAUDE_API_KEY` to override). When the plan's usage window is used up, the review waits and retries every 30 minutes until it resets.
- `zai:<model>` calls z.ai's general API (`ZAI_API_KEY`); the flash models there are free.
- Anything else is an OpenRouter id (`OPENROUTER_API_KEY`), capped by `DAILY_LIMIT` requests a day (1000 on an account with credits).

Reviews are published right away under "Community submissions", marked self-submitted. To hide one:

```bash
curl -X POST https://hackyeah-review.justadomainname.dev/api/admin/reviews/<id>/hide -H "authorization: Bearer $ADMIN_TOKEN"
```

### Run locally

```bash
cp .env.example .env             # add OPENROUTER_API_KEY and ZAI_API_KEY, optionally GITHUB_TOKEN and ADMIN_TOKEN
bun install
bun run dev                      # builds the site and serves it with the API on :3000
bun test                         # unit tests
```

Without keys, use the mock: run `bun app/test/mock-openrouter.ts`, then start the server with `OPENROUTER_BASE_URL=http://localhost:4790 ZAI_BASE_URL=http://localhost:4790 OPENROUTER_API_KEY=mock ZAI_API_KEY=mock` (`claude:` members still need the real CLI and key).

### Checking the council against the earlier blind reviews (research only)

```bash
bun scripts/council-check.ts --all --shard 1/3    # three terminals: --shard 2/3, --shard 3/3
bun scripts/council-check.ts sport:uteg-labs/just-mate defence:Mikformatycy/SafeWall
bun scripts/council-report.ts                     # .cache/council-check/compare.html
```

These compare the council with the Claude Opus blind reviews in `app/web/data/scores/`, which the site no longer shows. The council gets the project description but not the jury result. Each council version keeps its own database (`.cache/council-check-v<version>.db`), so a rerun resumes and queues failed reviews again, and the report never mixes versions.

### Deploy (Dokploy)

The `Dockerfile` builds the site and runs `bun app/server/index.ts` on port 3000, with SQLite and uploaded decks in `/data`. In Dokploy, create an application from this repo (Dockerfile build type, auto-deploy on push) and mount a volume at `/data`. Set the variables from `.env.example`, and attach `hackyeah-review.justadomainname.dev` on port 3000 with HTTPS.

## Structure

- `app/web/pages/` — the three pages (results, form, review) as React components, and `app/web/components/project-card.tsx` for the project cards; `app/web/main.tsx` hydrates them in the browser
- `app/web/components/ui/` — [Fluid Functionalism](https://www.fluidfunctionalism.com) components, Base UI flavor, added with the shadcn CLI (`components.json`). They are copied into the repo, so small fixes live here
- `app/web/components/layout.tsx` — the shared column (760px wide on every page), site bar and small building blocks
- `app/web/data/results.ts` — finalists, results and repo matches; `app/web/lib/projects.ts` joins them with the reviews
- `app/web/data/scores/<task>.json` — review scores per task
- `app/web/data/teams.json` — team name and jury result for each reviewed repo, plus placed teams with no public repo
- `app/web/app.css` — Tailwind v4 entry with the theme tokens
- `review/rubrics/<task>.toml` — brief, official criteria and weights, and task-specific checks for each task
- `review/prompts/` — the council member and judge prompts, and the earlier Opus reviewer prompt (`reviewer.md`, used by `scripts/review.ts`)
- `review/guides/<task>.md` — a reviewing guide per task, embedded in that task's member prompt
- `review/council.toml` — the fixed council panel and its version
- `scripts/review.ts` — builds review prompts, runs reviews and merges the results
- `scripts/council-check.ts`, `scripts/council-report.ts` — run the council on projects with a blind review and build the comparison page
- `scripts/build.ts` — pre-renders every page to HTML (so search engines see the content), bundles the client and the Tailwind CSS, and writes `public/` (git-ignored, plus `robots.txt` and `sitemap.xml`)

To add another Fluid component: `bunx shadcn@latest add https://www.fluidfunctionalism.com/r/base/<name>.json` (or `/r/<name>.json` for ones without a Base UI flavor), then move any file it writes to `src/components/` into `app/web/components/`.

## Reviewing projects

Each review is blind (the reviewer isn't told how a team placed) and read-only, scored 0 to 10 per criterion with the task's official weights. The script recomputes every total, so arithmetic slips don't reach the site.

```bash
bun scripts/review.ts tasks                              # list tasks and how many projects are reviewed
bun scripts/review.ts prompt krakow owner/repo           # clone and write a ready prompt to .cache/prompts/
bun scripts/review.ts run krakow owner/repo --team "owner/repo=Team Name" --result "owner/repo=fin"
bun scripts/review.ts add krakow .cache/reviews/file.md  # add a review you ran yourself
```

`run` reviews with Claude Code (`claude -p`) and adds the scores. Results: `best` (single winner), `1`, `2`, `3` (podium), `fin` (finalist), `ours` (our own entry).

In Claude Code, `/review krakow owner/repo --team "owner/repo=Team Name"` does the same with a subagent.

- **One project later:** the prompt includes the task's existing scores as anonymous anchors, so the new score stays on the same scale.
- **Whole task again:** pass all its repos in one call with `--fresh`; one reviewer then compares them side by side.
- **Wrong task:** if the reviewer finds the repo was built for another task, `add` lists it as excluded instead of scoring it.
- **New task or event:** add `review/rubrics/<id>.toml` (name, kind, order, deadline, brief, checks and `[weights]` adding up to 100), then review repos with that id. Add the teams to `TASKS` in `app/web/data/results.ts` to show them on the results page.

## Build and deploy

Pushes to `main` deploy to production on Dokploy through a GitHub webhook: the Dockerfile builds the site and starts the server.

```bash
bun run build    # build locally into public/
```
