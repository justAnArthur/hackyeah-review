# HackYeah 2026 Review

Static site with the HackYeah 2026 finalists and winners, the public repo found for each team, and blind repo reviews scored against each task's official weights.

Live: https://hackyeah-review.justadomainname.dev

## Pages

- `/` — results by task, ordered by placing, with repo links
- `/scorecard` — review scores per criterion, next to the jury's result

## Structure

- `src/results.html`, `src/scorecard.html` — page sources
- `src/scorecard-data.json` — merged review data used by the scorecard
- `src/scores/` — raw review scores per task
- `build.ts` — wraps the sources into full pages and writes `public/` (git-ignored, plus `robots.txt` and `sitemap.xml`)

## Build and deploy

Pushes to `main` deploy to production on Vercel, which runs `bun ./build.ts` and serves `public/`. Pull requests get preview deployments.

```bash
bun run build    # build locally into public/
bun run deploy   # deploy from the working tree without pushing
```
