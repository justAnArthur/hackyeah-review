# Reviewing Artificial Intelligence (HackYeah 2026 open task, 8,000 PLN)

## What the organizer asked for
AI must play a meaningful role for a specific user need: finding and understanding complex information, adaptive learning, accessibility, creative assistance, workflow automation, comparing options. The team must explain the AI's role, how components fit, capabilities and limits, and how users verify outputs and stay in control. One concrete use case must be shown. This is the most crowded task — expect a wall of LLM wrappers; depth is the differentiator.

## How to read each criterion here
- **Idea & Innovation (30)**: the AI does something a prompt in a generic chat couldn't. Strong entries own a hard step (retrieval over messy sources, verification, domain constraint); weak ones forward text to one API.
- **Relation to Category (20)**: AI is the product, not a garnish. If removing the model call leaves the same product, relation is low.
- **Practical Applicability / Usability (20)**: the use case is specific and the target user named; "AI assistant for everyone" scores mid at best.
- **Design (20)**: AI products need trust UI: sources shown, confidence expressed, correction possible.
- **Completeness & Implementation (10)**: the AI path runs on real inputs; guardrails and failure states handled even minimally.

## Evidence checklist
- The model call exists in code with real inputs — not a recorded response string.
- One concrete use case demonstrated end to end.
- Verification and control: can a user see why the output is what it is, and fix it?
- AI tools credited (AI_WORKFLOW.md or docs) — required by the rules.
- Capabilities and limitations stated honestly somewhere.

## Verification steps
1. Find the inference call in source samples; check what surrounds it (retrieval, validation, post-processing).
2. Ask: what did this team build versus call? Score the built part.
3. Look for the "control" moment in the UI text: edit, reject, source link.

## Weak-entry patterns
- Thin wrapper: form → single prompt → chat answer, nothing else.
- "It also has AI" bolted onto a CRUD app.
- No hallucination handling, no sources, no credit for AI use.
