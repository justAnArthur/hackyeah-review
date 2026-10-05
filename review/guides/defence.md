# Reviewing Defence (HackYeah 2026 open task, 8,000 PLN)

## What the organizer asked for
Something that strengthens security and resilience: prevent, detect earlier, or reduce consequences. The scenario must be realistic and degraded — incomplete information, limited resources, services down — and the demo should show better preparedness, response or continuity, not a staged happy path.

## How to read each criterion here
- **Idea & Innovation (30)**: a real gap in security practice, not "a dashboard for alerts". Strong entries pick one concrete adversary or failure mode (a phishing wave on seniors, a dependency outage) and reason about it; weak ones say "AI-powered threat detection".
- **Relation to Category (20)**: it must be security/resilience work. A generic monitor or a military-themed game is off-category. Civil defence, disinfo verification, continuity planning all count.
- **Practical Applicability / Usability (20)**: who runs this at 3 a.m. during an incident? An SOCs tool nobody but the author can operate scores low. Time-to-insight matters.
- **Design (20)**: crisis tools must be readable under stress — glanceable status, clear severity, no clutter.
- **Completeness & Implementation (10)**: the detection/routing/encryption claims exist in code, not only in the deck or a video.

## Evidence checklist
- Degraded scenario actually demonstrated (inputs missing, a service down, stale data).
- Core security claims implemented: search the repo for the encryption/routing/detection code paths.
- Real data feeds versus invented events.
- Alerting/escalation flow reachable in the demo, not a screenshot.

## Verification steps
1. Locate the security-critical module in the source samples; read it. Is the logic there or stubbed?
2. Check whether the "attack" input is hardcoded or pluggable.
3. Trace one alert from detection to action in the UI.

## Weak-entry patterns
- A slide deck about threats with a login screen mockup and no detection logic.
- A "SOC dashboard" fed by `setTimeout` random numbers.
- Happy-path demo where every service is up — the opposite of the brief.
