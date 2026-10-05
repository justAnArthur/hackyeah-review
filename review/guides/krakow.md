# Reviewing Cracow without barriers (partner task · City of Kraków, 5,000 PLN, Polish only)

## What the partner asked for
A tool for residents and tourists to assess accessibility of places and routes for individual needs, scoped to one group (e.g. wheelchair users and parents with prams). Detailed barrier and facility data (steps, thresholds, ramps, lifts, door width, surface, toilets, rest spots) — never just "accessible or not". Every datum carries a source, date and reliability status; unverified reports visually distinct; a data gap must never display as "accessible". The demo must include a conflicting, incomplete or source-down case. Open data only (Kraków open data, MSIP WMS/WFS, dane.gov.pl, OSM with attribution). Ingestion separate from presentation. WCAG 2.2 AA (keyboard, screen reader, contrast, text alternative to the map). No disability disclosure required. Hosting outside the city, privacy basics, how to add a new city. Deliverables in Polish: description, prototype/demo, target group, data sources with freshness and reliability, business model, PDF ≤10 slides, video ≤3 minutes.

## How to read each criterion here
- **Relation & usability (25)**: the accessibility assessment fits individual needs — filters that change the verdict per person, not one green icon. Wrong-verdict-on-missing-data is the cardinal sin here.
- **Prototype quality (20)**: the map/place UI works, handles the required conflicting/incomplete case, keyboard-navigable.
- **Data reliability (15)**: sources, dates and reliability per datum; unverified visually distinct; real open data (OSM, city WFS) with attribution.
- **Scalability (20)**: adding a city is a data-configuration task, not a rewrite; ingestion separated from presentation in the code.
- **Business model (20)**: priced, with numbers — hosting, maintenance, who pays.

## Evidence checklist
- A datum shows: source, date, reliability — find it in the data model or UI.
- Missing data renders explicitly ("no data"), never as accessible.
- Real open-data integration in code (OSM query, city API), attribution present.
- WCAG evidence: landmarks, aria, focus states, contrast, non-map text alternative.
- Business model with amounts (PLN/month or per year).

## Verification steps
1. Find the data model: does a place carry per-attribute barrier details with provenance?
2. Search the UI text for the "no data" state; then check what it renders.
3. Identify the ingestion module and check it's separate from the map UI.

## Weak-entry patterns
- Invented demo venues with perfect data (violates the open-data rule and the reliability spirit).
- One "accessible: yes/no" flag — the brief explicitly rejects it.
- Beautiful map that a screen reader cannot use, in a task about accessibility.
