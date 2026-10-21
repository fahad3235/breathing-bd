# TEST RESULTS — breathing-bd (run #101, 2026-10-21 09:00 slot)

## Unit tests — `node tests/test_logic.mjs`
73/73 passed. Covers: phaseList ordering + zero-hold dropping (box 4 phases,
relax478 3, calm46 2, energize 3); cycleDuration (box 16 s, relax478 19 s,
calm46 10 s); breathsPerMinute (box 3.75, calm46 6.0); phaseAt exact boundaries
on box/2-cycles (t=0 inhale; 3999 inhale; 4000 hold1; 8000 exhale; 12000 hold2;
15999 hold2; 16000 cycle-2 inhale; 32000 null-complete; negative null;
phaseStartMs/phaseEndMs exact); minutes-mode (2 min = 120000 ms, completion at
120000, last phase at 119999 = cycle 7 hold1); validatePattern (zero inhale,
negative hold, >30 s, fractions, non-numbers, null rejected; 30/30 max valid);
validateSession (cycles 0/201/fraction, minutes 0/121, bad type rejected);
summarize (finished/total counts, minutes 3.33 2dp, cycles, per-pattern, streak
2 for today+yesterday, gap breaks streak, empty safe, non-array safe);
validateImport/buildExport round-trip (wrong-app, bad-version, bad-sessions,
bad date/pattern/mode rejected; patternKey truncated to 40, cyclesDone floored,
finished coerced).

Repairs: 1 test-side (totalMinutes expectation corrected to the app's 2dp
rounding, 3.33). 0 app-logic bugs found by unit tests.

## Headless-Chrome smoke — `node tests/smoke.mjs` (raw CDP, /opt/meta-chromium/chrome)
30/30 desktop (1280) + 30/30 mobile (390 px emulation). Test hook `?fast=10`
divides phase durations by 10 (box 4 s -> 1 s phases; 2-cycle session = 8 s).

Hand-verified: title/header render; 5 pattern cards; custom card reveals 4
duration inputs; mode n=2 accepted; session starts (runtime active, phase label
live, circle transform scaling, "Cycle 1 of 2" stats); pause shows "Paused",
resume clears it; natural completion at ~8 s -> runtime null, result card,
"Session complete" heading, 1 session persisted finished:true cyclesDone:2;
"Start another" resets; early stop -> "Session ended", finished:false;
history tab shows 2 rows + 4 dashboard cards (bug found & fixed: history panel
went stale after a session — finishSession now re-renders history);
BN toggle -> Bengali title + Bengali digits in dashboard; erase "nope" keeps
data; validateImport rejects malformed entry; 390 px zero horizontal overflow;
zero http(s) requests; zero console.error; zero uncaught exceptions.

Repairs: 1 real app bug (stale history panel after session completion —
finishSession now calls renderHistory); 1 test-side (async-IIFE evaluate
returned a Promise — replaced with a synchronous expression). 3 harness
fixes (Chrome 152 needs 6 s+ startup wait; /json/new requires PUT with
URL-encoded query string, not GET or JSON body).

## Source hygiene
Pure-ASCII sources (Bengali as \uXXXX escapes in JS, numeric entities in
HTML); `grep -rP '[^\x00-\x7F]' js/ css/ index.html` returns nothing.
Zero network requests by design (verified in smoke via Network domain).
No secrets in code. Ships empty — no fabricated sessions.
