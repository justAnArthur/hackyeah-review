# Reviewing HubMI.pl (partner task · Małopolska, 15,000 PLN, Polish only)

## What the partner asked for
Design, name and prototype the "digital heart" of the Małopolska Social Innovation Hub. Seven modules: (1) social matchmaking — MANDATORY: user describes a problem, system finds similar cases and proposes existing innovations; (2) knowledge store: regional challenges map, innovation library, educational content, trend aggregation for admins; (3) idea creator: flashcards, grant-application generator, canvases, optional AI assistant; (4) innovation tester: sign-ups, ratings, feedback; (5) communication with ROPS, mentors, partners; (6) admin panel; (7) "innovation middleman": AI adapting an innovation into a service for an institution. Required: working MVP (matchmaking mandatory, each extra module scores more), UX/UI mockups, WCAG 2.1 AA target, scalability, data security, demo link plus mockups, estimated running cost, video ≤3 minutes, everything in Polish.

## How to read each criterion here
- **Challenge fulfilment (40)**: how many of the 7 modules exist in code (backend AND UI), with matchmaking working. This criterion dominates — a beautiful 2-module entry loses to an ugly 5-module one.
- **Implementation potential (20)**: could ROPS actually deploy it: real data model, auth, integration seams, cost estimate present.
- **Accessibility & intuitiveness (20)**: WCAG 2.1 AA is a stated target — look for semantic markup, contrast, keyboard support, Polish UI done well.
- **Bonus (20)**: UI quality, materials (mockups, video), MVP polish.

## Evidence checklist
- Matchmaking implemented: an endpoint or flow that takes a described problem and returns similar cases — find it working, not drawn.
- Modules counted in code: routes/components per module, each with UI.
- Polish language throughout: UI, description, materials.
- WCAG effort visible (aria attributes, contrast, keyboard handling).
- Cost estimate with numbers in the docs.

## Verification steps
1. Find the matchmaking similarity logic (embedding, tags, search?) and judge whether it's real.
2. Count modules: list the routes/screens and map them to the 7.
3. Check the admin panel exists — most teams forget it.

## Weak-entry patterns
- Figma mockups of 7 modules and one landing page in code.
- Matchmaking as a hardcoded "similar projects" list.
- English UI in a Polish-only task.
