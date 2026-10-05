# Reviewing Smart City (HackYeah 2026 open task, 8,000 PLN)

## What the organizer asked for
Help cities work better day to day: mobility, energy, urban data, public services, quality of life, crisis response. No detailed brief was published — the site paragraph is the brief — so judge whether it would measurably improve city life for the people it serves.

## How to read each criterion here
- **Idea & Innovation (30)**: an insight into how a city works, for residents or for city staff, not a generic app with "smart city" in the title. Strong entries use urban data to change a decision (a route, a report, a dispatch, an alert).
- **Relation to Category (20)**: day-to-day municipal reality. Tools for armies, private companies or one-off emergencies reframed as "city" score low; crisis response for city services counts.
- **Practical Applicability / Usability (20)**: name who uses it day to day (residents, city staff or both) and what they get from it.
- **Design (20)**: maps and density are the native UI; legend, contrast and zoom behavior matter.
- **Completeness & Implementation (10)**: the data pipeline exists; the map isn't a static image with pins.

## Evidence checklist
- Real urban data feed in code (ZTP Kraków GTFS, GUGiK/Geoportal, GIOŚ, GUS BDL, OSM).
- The core capability computed, not simulated: actual ETA, actual overlay, actual aggregation.
- A named city role that would use the result.

## Verification steps
1. Find the data-fetching code: is there a real endpoint, or fixture JSON?
2. Check what the tool concludes (a ranking, an alert, a route) beyond display.
3. Consider operating cost for a moment — does anything scale past one demo district?

## Weak-entry patterns
- A map with hardcoded pins called "city platform".
- A transit or smog dashboard that only re-displays an existing public feed.
- Crisis command centre theatre with no live input.
