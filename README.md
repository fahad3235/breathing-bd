# Breathing BD

Offline bilingual (EN / বাংলা) guided breathing coach. Pick a pattern, set a session length, and follow the animated breath circle with phase labels and gentle sound cues.

Live demo: `https://fahad3235.github.io/breathing-bd/` (after Pages is enabled)

## Problem

Exam stress, deadline pressure, and restless nights are everyday realities for Bangladeshi students and professionals. Breathing BD is a tiny, honest tool for that: guided breathing sessions that run 100% offline — no accounts, no tracking, no network.

## Features

- **5 breathing patterns** — Box (4-4-4-4), 4-7-8 Relax, Calm 4-6, Energize 6-2-6, plus a **custom** pattern (editable inhale / hold / exhale times, 1–30 s, validated)
- **Live guided session** — animated breath circle that grows on inhale and shrinks on exhale, phase label (Breathe in / Hold / Breathe out) with per-phase countdown, session progress bar, live stats (cycle n of N, elapsed, remaining)
- **Session engine** — run by breath cycles (1–200) or minutes (1–120); pause / resume / end-early; a soft Web Audio tone marks each phase change (mutable)
- **Dashboard** — finished vs total sessions, minutes, breath cycles, day streak (yesterday-alive rule), per-pattern counts
- **Session history** — last 50 sessions with pattern, length, cycles, and completed/ended-early badges
- **Data portability** — JSON export / strict import (wrong-app, bad-version, and malformed entries rejected) / typed-DELETE erase-all
- **Bilingual UI** — EN / বাংলা toggle persisted in localStorage, Bengali digits in BN mode
- **Mobile friendly** — responsive down to 390 px; zero network requests by design

## Stack

Vanilla HTML + CSS + JS. No frameworks, no build step, no dependencies, no CDN.
`js/logic.js` is the pure session-timing engine (shared between the browser and the node test suite).

## Prerequisites

Any modern browser. For tests: Node.js 18+ and Chromium (tests use `/opt/meta-chromium/chrome` on the factory VM; any headless Chromium works).

## Install & run

No install. Open `index.html` in a browser, or serve the folder:

```bash
cd breathing-bd
python3 -m http.server 8080
# open http://localhost:8080/
```

## Dev commands

```bash
node tests/test_logic.mjs      # 73 unit tests for the timing engine
node tests/smoke.mjs desktop   # 30 headless-Chrome checks (raw CDP)
node tests/smoke.mjs mobile    # same 30 checks at 390 px emulation
```

Test-only URL hook: `?fast=N` divides every phase duration by N so a full
session can be exercised in seconds (used by the smoke suite; documented in
`TEST_RESULTS.md`). It does not change any math — only the clock speed.

## Environment

None. No API keys, no env files, no backend. All state lives in
`localStorage` under the key `breathing-bd:v1`.

## Testing

- `tests/test_logic.mjs`: 73 assertions over `phaseList`, `cycleDuration`,
  `breathsPerMinute`, `phaseAt` (exact phase boundaries incl. cycle rollover
  and minutes-mode completion), `validatePattern`, `validateSession`,
  `summarize` (streak rules, per-pattern counts), `validateImport`
  (wrong-app / bad-version / malformed entries / sanitization).
- `tests/smoke.mjs`: 30 checks × desktop/mobile — full guided session to
  natural completion (fast hook), pause/resume, early-stop recording, history
  rendering, custom-pattern UI, BN toggle + Bengali digits, typed-DELETE
  erase guard, import validator, 390 px no-overflow, zero `http(s)` requests,
  zero console errors / uncaught exceptions.

See `TEST_RESULTS.md` for the recorded run.

## Deployment

Static site — GitHub Pages (`main` / root), Netlify Drop, or any static host.
No build step.

## Limitations

- A relaxation aid, not medical treatment. If you feel dizzy, stop and breathe normally.
- Pattern presets are common published breathing patterns, not a prescription.
- Breath pacing depends on your device's timer; the `?fast=` hook is test-only.
- Sound cues need a browser with Web Audio; the app works silently without it.

## Status

MVP complete. All tests green. No backend, no accounts, no analytics.
