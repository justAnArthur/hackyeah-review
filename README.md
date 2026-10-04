# HackYeah 2026 Review

HackYeah 2026 finalists and winners, the public repo found for each team, blind repo reviews scored against each task's official weights, and a form where any team can get its own project reviewed by an AI council.

Live: https://hackyeah-review.justadomainname.dev

## Pages

- `/` — results by task, ordered by placing, with repo links
- `/scorecard` — review scores per criterion, next to the jury's result, plus community submissions
- `/submit` — "Review my project" form with the same fields as the HackTribe entry
- `/r/<id>` — live progress and the council's review for one submission

## Council review

A submission goes through a queue in one Bun process (`server/`):

1. **Evidence** (`server/evidence.ts`): without any model, the server collects the facts. It reads GitHub metadata and commit history, downloads the repo tarball, counts source lines and tests, and samples the README, docs, manifests and the most central source files. It also reads the deck text (`pdftotext`) and the form answers, and checks the demo link. The result is one evidence pack of about 20k tokens. Team-written text is marked untrusted, and attempts to steer the score become red flags.
2. **Council** (`server/council.ts`, `council.toml`): four fixed free models on OpenRouter score the pack against the task's rubric (`rubrics/<task>.toml`, `prompts/council-member.md`). The final score per criterion is the median, and the spread shows disagreement. A judge model (`prompts/council-judge.md`) writes the consolidated text and rates each member's agreement; it never sets the numbers.
3. **Queue** (`server/queue.ts`): it runs one job at a time, at 15 requests a minute and 50 free requests a day (`DAILY_LIMIT`). When the quota runs out, jobs wait and continue after midnight UTC. Rate limits back off exponentially. A member that stays rate-limited after `MEMBER_MAX_TRIES` tries (default 6) is skipped for that review, which still needs 3 of 4 members. Every finished step is stored in SQLite, so a restart resumes instead of starting over. The models are never swapped, so every project faces the same panel; changing one means bumping `version` in `council.toml`.

Reviews are published right away under "Community submissions", marked self-submitted. To hide one:

```bash
curl -X POST https://hackyeah-review.justadomainname.dev/api/admin/reviews/<id>/hide -H "authorization: Bearer $ADMIN_TOKEN"
```

### Run locally

```bash
cp .env.example .env             # add OPENROUTER_API_KEY, optionally GITHUB_TOKEN and ADMIN_TOKEN
bun install
bun run dev                      # builds the site and serves it with the API on :3000
bun test                         # unit tests
```

Without a key, use the mock: run `bun test/mock-openrouter.ts`, then start the server with `OPENROUTER_BASE_URL=http://localhost:4790 OPENROUTER_API_KEY=mock`.

### Deploy (Dokploy)

The `Dockerfile` builds the site and runs `bun server/index.ts` on port 3000, with SQLite and uploaded decks in `/data`. In Dokploy, create an application from this repo (Dockerfile build type, auto-deploy on push) and mount a volume at `/data`. Set the variables from `.env.example`, and attach `hackyeah-review.justadomainname.dev` on port 3000 with HTTPS.

## Structure

- `src/results.html`, `src/scorecard.html` — page sources
- `src/scores/<task>.json` — review scores per task
- `src/teams.json` — team name and jury result for each reviewed repo, plus placed teams with no public repo
- `rubrics/<task>.toml` — brief, official criteria and weights, and task-specific checks for each task
- `prompts/reviewer.md` — the reviewer prompt template
- `scripts/review.ts` — builds review prompts, runs reviews and merges the results
- `build.ts` — builds the scorecard data from rubrics, scores and teams, wraps the page sources and writes `public/` (git-ignored, plus `robots.txt` and `sitemap.xml`)

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
- **New task or event:** add `rubrics/<id>.toml` (name, kind, order, deadline, brief, checks and `[weights]` adding up to 100), then review repos with that id. Add the teams to `TASKS` in `src/results.html` to show them on the results page.

## Build and deploy

Pushes to `main` deploy to production on Vercel, which runs `bun ./build.ts` and serves `public/`. Pull requests get preview deployments.

```bash
bun run build    # build locally into public/
bun run deploy   # deploy from the working tree without pushing
```
