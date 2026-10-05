# Reviewing Sport & Healthcare (HackYeah 2026 open task, 8,000 PLN)

## What the organizer asked for
Holistically combine sport, physical health, mental wellbeing and access to care. Turn scattered health data into better decisions — not another monitoring dashboard. Round one is a review of the whole submission (deck of up to 10 slides, description, repo, demo or video) by at least three mentors; the jury then picks finalists for a live pitch. A project needs at least 50% of the points to receive the award.

## How to read each criterion here
- **Idea & Innovation (30)**: a decision the user couldn't make before (train differently, see a doctor, adjust medication load), not a nicer chart of data they already have.
- **Relation to Category (20)**: does it genuinely touch sport, physical health, mental wellbeing or access to care, and does health data drive a recommendation, alert or plan? A generic fitness app where no health decision changes is weak here.
- **Practical Applicability / Usability (20)**: would a patient or athlete actually use it? Consent flows, unclear medical claims ("diagnoses cancer") cost points.
- **Design (20)**: health tools need calm, legible UI; screenshot descriptions are your evidence.
- **Completeness & Implementation (10)**: the decision logic exists in code; integrations (watch data, e-prescription) are real or honestly stubbed.

## Evidence checklist
- A concrete decision output: a recommendation, alert, plan or flag — find it in the demo text or source.
- Health-data handling: any mention of where sensitive data rests, even one line, beats silence.
- The deck communicates the idea in 10 slides to a paper reviewer who never saw the repo.
- Mental wellbeing or access-to-care angle is real, not a renamed todo app.

## Verification steps
1. Find the decision point in code or demo text: what does the system *do* with the data?
2. Check whether the data source is real (watch export, public health API) or typed in by hand.
3. Judge the deck alone for a moment, as round one does.

## Weak-entry patterns
- Step/heart-rate dashboard number 47 with a chart library and no conclusion.
- "AI coach" that returns a hardcoded tip for any input.
- Medical claims with no disclaimer or evidence.
