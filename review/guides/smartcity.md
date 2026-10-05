# Reviewing Smart City (HackYeah 2026 open task, 8,000 PLN)

## What the organizer asked for
Help cities work better day to day: mobility, energy, urban data, public services, quality of life, crisis response. No detailed brief was published — the site paragraph is the brief — so judge whether a city would actually run this.

## How to read each criterion here
- **Idea & Innovation (30)**: a city-operations insight, not a consumer app with "smart city" in the title. Strong entries use urban data to change a decision (dispatch, routing, budget, alerting).
- **Relation to Category (20)**: day-to-day municipal reality. Tools for armies, private companies or one-off emergencies reframed as "city" score low; crisis response for city services counts.
- **Practical Applicability / Usability (20)**: name the operator — a city office, ZTP, a resident. If nobody in a municipality would log in, it's a demo toy.
- **Design (20)**: maps and density are the native UI; legend, contrast and zoom behavior matter.
- **Completeness & Implementation (10)**: the data pipeline exists; the map isn't a static image with pins.

## Evidence checklist
- Real urban data feed in code (ZTP Kraków GTFS, GUGiK/Geoportal, GIOŚ, GUS BDL, OSM) — juries recognize and reward real Polish integrations.
- The core capability computed, not simulated: actual ETA, actual overlay, actual aggregation.
- A named city role that would use the result.

## Verification steps
1. Find the data-fetching code: is there a real endpoint, or fixture JSON?
2. Check what the tool concludes (a ranking, an alert, a route) beyond display.
3. Consider operating cost for a moment — does anything scale past one demo district?

## Weak-entry patterns
- A map with hardcoded pins called "city platform".
- Warsaw ZTM clone (wrong city, most-crowded demo in Poland) or a generic smog dashboard.
- Crisis command centre theatre with no live input.
