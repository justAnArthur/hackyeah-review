---
description: Review HackYeah projects against a task rubric and add the scores to the site
argument-hint: <task> <owner/repo>... [--fresh] [--team "owner/repo=Team"] [--result "owner/repo=fin"] [--context "owner/repo=text"]
---

Review hackathon projects for this site. Arguments: $ARGUMENTS

1. The first argument is the task id. Run `bun scripts/review.ts tasks` to list the known ones. If `rubrics/<task>.toml` doesn't exist, ask for the task brief and its official criteria with weights, then write the rubric in the same format as the existing files (weights must add up to 100) before going on.
2. Run `bun scripts/review.ts prompt <task> <repos...>`, passing through any `--fresh` and `--context` flags. It clones the repos into `.cache/clones/` and prints the path of the finished prompt. Read that file.
3. Spawn one `general-purpose` subagent with the file's full contents as its prompt. Use one agent for all repos of the task so they are scored on the same scale. Don't add anything to the prompt, and never tell the agent how a team placed.
4. Save the agent's final message to `.cache/reviews/<task>-<YYYY-MM-DD-HH-MM>.md`.
5. Run `bun scripts/review.ts add <task> <that file>`, passing through `--team` and `--result`. It checks the criteria against the rubric, recomputes each total, moves repos the reviewer says weren't built for this task into the excluded list, and updates `src/scores/<task>.json` and `src/teams.json`.
6. If a reviewed team isn't on the results page yet, add or update its entry in the `TASKS` list in `src/results.html` (team, project, status, desc, repos, demo).
7. Run `bun run build`, then report each project's total and its weakest criterion. Commit and push only when asked.

To re-score a whole task consistently, pass every repo of that task in one call with `--fresh`, so the reviewer compares them side by side instead of against earlier anchors.
