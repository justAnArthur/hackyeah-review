# HackYeah 2026 Review

Static site with the HackYeah 2026 finalists and winners, the public repo found for each team, and blind repo reviews scored against each task's official weights.

Live: https://hackyeah-review.justadomainname.dev

## Pages

- `/` — results by task, ordered by placing, with repo links
- `/scorecard` — review scores per criterion, next to the jury's result

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

Pushes to `main` deploy to production on Dokploy through a GitHub webhook: the Dockerfile builds the site and serves `public/` with a small Bun server.

```bash
bun run build    # build locally into public/
bun run dev      # build and serve on :3000
```
