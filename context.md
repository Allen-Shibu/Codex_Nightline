# Context: CivicPulse

This document exists to brief an AI coding agent (Codex) at the very start of the build sprint so it understands the full project without back-and-forth. Read this fully before writing any code.

---

## Event context

- **Event:** Codex Nightline — Kochi Metro AI Hackathon
- **Format:** Solo, 2-hour build sprint, onboard a moving Kochi Metro train (Vyttila → Aluva → Thrippunithura → Vyttila)
- **Constraint:** implementation starts only after the sprint begins — nothing pre-built beforehand except this context doc and planning
- **Track:** Civic & Community Tools — "strengthen communities and local public life"
- **Connectivity:** assume patchy/unreliable internet during the build and demo. Anything live-network-dependent is a demo risk.

## One-line pitch

A crowdsourced civic issue tracker that doesn't just show what's broken right now — it remembers how long it's been broken, and starts predicting what's about to break.

## The problem being solved

Small civic issues — metro delays, power cuts, potholes, traffic blocks — go unreported or get reported in isolated, disconnected complaints. No one knows if it's just them or a real, spreading problem. Once reported, there's no record of how long anything took (or failed) to get fixed — complaints vanish into the void.

## Why this isn't "just Waze for civic issues"

Anticipate this comparison from judges and address it head-on. Waze tells you a problem exists *right now*. CivicPulse adds three things Waze doesn't have — these are the actual differentiators, not the crowdsourcing mechanic itself:

1. **The Ledger (accountability layer)** — every incident keeps a visible, growing age ("open 12 days"). This makes neglect visible and hard to ignore, independent of whether it ever gets fixed.
2. **Predictive warnings (pattern layer)** — the app proactively surfaces a warning based on known past patterns *before* fresh reports come in (e.g. "heavy rain today — this area has flooded 4 of the last 5 times").
3. **Multi-source cold start (credibility layer)** — the clustering pipeline also ingests mocked complaint-shaped content (e.g. fake social posts) alongside live user reports, answering "how does this have useful data on day one."

State the honest caveat upfront in any demo/pitch: this is a proof-of-concept for the *mechanism*, not a live pipeline into KMRL or the municipal corporation.

---

## Core user flow

1. **Location first** — on load, the app asks for location permission (or lets the user manually pick their area if denied/unavailable).
2. **Map view (primary screen)** — shows the user's area with incident **hotspots**: markers sized/colored by severity (small amber dot = Reported, larger glowing red = Critical). This is the "glance and understand" view.
3. **Report composer** — free-text input, no dropdowns or category pickers. User just describes what they see.
4. **Clustering** — new report is checked against currently open incidents by an LLM call ("does this match an existing incident? return the matching id, or 'new'"). Match → merge and escalate. No match → new incident, new hotspot.
5. **Feed/drill-down view** — tapping a hotspot opens the incident detail: description, category, severity stamp, age, tally-mark confirm count, and (if critical + aged) a "View draft letter" button.
6. **The Pulse** — an auto-generated one-line summary of everything currently open, regenerated as reports land, shown as a callout above the map/feed.
7. **Predictive banner** — a dashed-border callout separate from the Pulse, surfacing pattern-based warnings.
8. **Draft letter modal** — for critical + aged incidents, generates a ready-to-copy formal complaint addressed to the relevant authority (KMRL for metro, municipal corp for roads, electricity board for power), pre-filled with incident details, confirm count, and days open.

## Map implementation note (live map — decision made)

**Using a real live map**: Leaflet.js + OpenStreetMap tiles, centered on the Kochi Metro corridor, with incident markers plotted at real lat/lng and sized/colored by severity. This is the shipped implementation, not a fallback.

This carries a real, accepted risk: tile loading needs a live connection, and connectivity on the train may be unreliable. Mitigate rather than avoid:
- Pre-load/pan the map to the demo area before boarding, while on stable wifi/data, so tiles are browser-cached.
- Carry a phone hotspot as backup.
- Keep a static screenshot of the tile view as last-resort insurance only, not the default plan.

**Cross-window live sync (for the mockup, and the mental model for the real build):** the demo mockup uses a shared key-value store so two browser windows both read/write the same incident list — one window reporting an incident shows up in the other within a couple seconds, simulating two different commuters. The real build would replace this with an actual backend, but the interaction model (poll or push for updates, re-render on change) is the same.

---

## Data model

```
Incident {
  id,
  category,          // "POTHOLE" | "METRO DELAY" | "POWER CUT" | "TRAFFIC" | freeform
  description,
  location,          // rough label + real lat/lng for live map placement
  severity,          // "reported" | "confirmed" | "critical"
  reportCount,
  firstReported,      // timestamp, drives the age/Ledger display
  lastReported,
  resolved: bool
}
```

**Severity tiers (by reportCount):**
- 1 report → Reported (amber)
- 3+ reports → Confirmed (orange)
- 6+ reports → Critical (red)

Incidents auto-fade/expire if no new reports in ~15–20 minutes (keeps the board feeling alive, not clogged). This can be simulated/faked for the demo rather than truly time-based if it saves build time.

---

## Tech stack

- Single HTML file, vanilla JS, no build tooling — fastest to iterate on solo in a time-boxed sprint.
- Minimal backend only if needed for the LLM calls (e.g. a small Flask/Express proxy) — otherwise call the LLM API directly from the browser for the demo (acceptable risk given the setting; not production-grade, and that's fine).
- One LLM call per submitted report (clustering/matching).
- Periodic/on-demand LLM calls for: the Pulse summary regeneration, the predictive banner, and the draft-letter generation.
- Live map: Leaflet.js + OpenStreetMap tiles (real external dependency, accepted risk — see mitigations above). No other live external APIs (weather, transit) — those remain seeded/mocked for demo reliability.

## Core LLM prompts (draft — refine during build)

**Clustering/matching prompt:**
> Given this new report: "{report_text}", and this list of currently open incidents: {incident_list_json}, determine if the new report describes the same real-world event as any existing incident. Return the matching incident id, or "new" if it describes something not yet tracked. Consider synonyms and rephrasing (e.g. "train stuck" and "metro delayed" are the same event) but do not merge genuinely different incident types or locations.

**Pulse summary prompt:**
> Given this list of currently open incidents: {incident_list_json}, write one natural-language sentence summarizing everything currently happening, in plain, concise language a commuter would read at a glance. Prioritize higher-severity incidents first.

**Predictive warning prompt:**
> Given this seeded history of past patterns: {pattern_history_json}, and today's known condition(s): {current_conditions}, determine if a proactive warning is justified. If so, return one sentence in the style of: "Heavy rain expected — Kaloor has flooded in 4 of the last 5 similar days."

**Draft letter prompt:**
> Given this incident: {incident_json}, draft a short, formal complaint letter addressed to {authority_name}, referencing the report count, days open, and description. Keep it under 120 words, professional tone, no exaggeration.

---

## Build schedule (2 hours)

| Time | Task |
|---|---|
| 0:00–0:15 | Location prompt + live Leaflet/OSM map scaffold, base styling |
| 0:15–0:35 | Severity-colored markers on map (seeded incidents), tap-to-open detail |
| 0:35–1:00 | Report composer + LLM clustering call wired in — spend real time here, it's the core intelligence |
| 1:00–1:20 | Severity tiers, aging/Ledger display, tally-mark confirm counts |
| 1:20–1:35 | Pulse summary + predictive banner generation |
| 1:35–1:50 | Draft-letter modal + generation |
| 1:50–2:00 | Seed mock incidents + fake social posts, rehearse demo script, submission checks |

## Demo script

1. Open with the honest caveat (one sentence — proof-of-concept for the mechanism, not a live authority pipeline).
2. Open on the map view: seeded hotspots visible (one old critical pothole, one fresh delay, one power cut), plus the predictive rain warning.
3. From 2 browser tabs, submit slightly different phrasings of the same metro delay — watch its hotspot intensify and the Pulse summary update live.
4. Submit an unrelated incident type to show it creates a separate hotspot (proves clustering isn't just merging everything).
5. Tap the aged critical pothole hotspot → detail card → "View draft letter" → auto-drafted complaint appears instantly. Closing beat.

## Existing reference assets

- `civicpulse-live-map-mockup.html` — current reference mockup: real Leaflet/OpenStreetMap live map with severity-colored markers, cross-window live sync via shared storage, Pulse summary, predictive banner, incident feed, and draft-letter modal. This is the most up-to-date interaction reference.
- `civicpulse-mockup.html` — earlier mockup (feed/card view only, no map) — superseded by the live-map version above.
- `civicpulse-build-plan.md` — earlier build brief without the map/location flow — superseded by this context.md.
- `design-reference.md` — visual direction, color/type tokens, and the live-map implementation notes.
- `llm-prompts.md` — the four ready-to-use prompt templates (clustering, pulse summary, predictive warning, draft letter).
- `known-failure-modes.md` — the "don't get caught out" checklist, including live-map mitigations and how to handle the ParathiPetty comparison.

This context.md is the master brief and supersedes the other docs where they conflict.
