/* breathing-bd — node unit tests for js/logic.js. Run: node tests/test_logic.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const L = require('../js/logic.js');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', name); }
}
function eq(a, b, name) { ok(a === b, name + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function close(a, b, name, eps) { ok(Math.abs(a - b) <= (eps || 1e-9), name + ' (got ' + a + ', want ' + b + ')'); }

// --- phaseList ---
eq(L.phaseList(L.BUILTIN_PATTERNS.box).map(p => p.name).join(','),
   'inhale,hold1,exhale,hold2', 'box phaseList order');
eq(L.phaseList(L.BUILTIN_PATTERNS.relax478).map(p => p.name).join(','),
   'inhale,hold1,exhale', 'relax478 drops zero hold2');
eq(L.phaseList(L.BUILTIN_PATTERNS.calm46).map(p => p.name).join(','),
   'inhale,exhale', 'calm46 drops both zero holds');
eq(L.phaseList(L.BUILTIN_PATTERNS.energize).length, 3, 'energize has 3 phases');

// --- cycleDuration / breathsPerMinute ---
eq(L.cycleDuration(L.BUILTIN_PATTERNS.box), 16, 'box cycle = 16s');
eq(L.cycleDuration(L.BUILTIN_PATTERNS.relax478), 19, 'relax478 cycle = 19s');
eq(L.cycleDuration(L.BUILTIN_PATTERNS.calm46), 10, 'calm46 cycle = 10s');
close(L.breathsPerMinute(L.BUILTIN_PATTERNS.box), 3.75, 'box bpm = 3.75');
close(L.breathsPerMinute(L.BUILTIN_PATTERNS.calm46), 6, 'calm46 bpm = 6');

// --- phaseAt (box pattern, ms) ---
const box = L.BUILTIN_PATTERNS.box;
const cycMode = { type: 'cycles', n: 2 };
let pos = L.phaseAt(box, cycMode, 0);
eq(pos.phase, 'inhale', 't=0 inhale'); eq(pos.cycleIndex, 0, 't=0 cycle 0');
pos = L.phaseAt(box, cycMode, 3999);
eq(pos.phase, 'inhale', 't=3999 still inhale');
pos = L.phaseAt(box, cycMode, 4000);
eq(pos.phase, 'hold1', 't=4000 hold1'); eq(pos.phaseIndex, 1, 'hold1 index 1');
pos = L.phaseAt(box, cycMode, 8000);
eq(pos.phase, 'exhale', 't=8000 exhale');
pos = L.phaseAt(box, cycMode, 12000);
eq(pos.phase, 'hold2', 't=12000 hold2');
pos = L.phaseAt(box, cycMode, 15999);
eq(pos.phase, 'hold2', 't=15999 hold2');
pos = L.phaseAt(box, cycMode, 16000);
eq(pos.phase, 'inhale', 't=16000 cycle 2 inhale'); eq(pos.cycleIndex, 1, 't=16000 cycle 1');
eq(pos.cycleStartMs, 16000, 'cycle2 start'); eq(pos.cycleEndMs, 32000, 'cycle2 end');
eq(L.phaseAt(box, cycMode, 32000), null, 't=total -> null (complete)');
eq(L.phaseAt(box, cycMode, 99999), null, 't>total -> null');
eq(L.phaseAt(box, cycMode, -5), null, 'negative -> null');
eq(L.phaseAt(box, { type: 'cycles', n: 1 }, 8000).phaseEndMs, 12000, 'phaseEndMs exact');
eq(L.phaseAt(box, { type: 'cycles', n: 1 }, 8000).phaseStartMs, 8000, 'phaseStartMs exact');

// minutes mode
const minMode = { type: 'minutes', n: 2 };
eq(L.totalDuration(box, minMode), 120000, '2 minutes = 120000ms');
eq(L.phaseAt(box, minMode, 119999).phase, 'hold1', 't=119999 last phase (cycle 7 hold1)');
eq(L.phaseAt(box, minMode, 120000), null, 't=120000 -> complete');
eq(L.totalDuration(box, cycMode), 32000, '2 cycles of box = 32000ms');

// --- validatePattern ---
eq(L.validatePattern(box).length, 0, 'box valid');
ok(L.validatePattern({ inhale: 0, hold1: 0, exhale: 4, hold2: 0 }).length > 0, 'inhale 0 rejected');
ok(L.validatePattern({ inhale: 4, hold1: -1, exhale: 4, hold2: 0 }).length > 0, 'negative hold rejected');
ok(L.validatePattern({ inhale: 4, hold1: 0, exhale: 31, hold2: 0 }).length > 0, 'exhale 31 rejected');
ok(L.validatePattern({ inhale: 4, hold1: 0, exhale: 4.5, hold2: 0 }).length > 0, 'fraction rejected');
ok(L.validatePattern({ inhale: 4, hold1: 'x', exhale: 4, hold2: 0 }).length > 0, 'string rejected');
ok(L.validatePattern(null).length > 0, 'null rejected');
eq(L.validatePattern({ inhale: 30, hold1: 30, exhale: 30, hold2: 30 }).length, 0, 'max bounds valid');
ok(L.validatePattern({ inhale: 1, hold1: 0, exhale: 1, hold2: 0 }).length === 0, 'min bounds valid');

// --- validateSession ---
eq(L.validateSession({ type: 'cycles', n: 5 }).length, 0, 'cycles 5 valid');
ok(L.validateSession({ type: 'cycles', n: 0 }).length > 0, 'cycles 0 rejected');
ok(L.validateSession({ type: 'cycles', n: 201 }).length > 0, 'cycles 201 rejected');
ok(L.validateSession({ type: 'cycles', n: 2.5 }).length > 0, 'cycles fraction rejected');
eq(L.validateSession({ type: 'minutes', n: 10 }).length, 0, 'minutes 10 valid');
ok(L.validateSession({ type: 'minutes', n: 0 }).length > 0, 'minutes 0 rejected');
ok(L.validateSession({ type: 'minutes', n: 121 }).length > 0, 'minutes 121 rejected');
ok(L.validateSession({ type: 'bogus', n: 5 }).length > 0, 'bad type rejected');
ok(L.validateSession(null).length > 0, 'null mode rejected');

// --- summarize ---
const s1 = { startedAt: '2026-10-21T05:00:00.000Z', patternKey: 'box', inhale: 4, hold1: 4, exhale: 4, hold2: 4, modeType: 'cycles', modeN: 5, cyclesDone: 5, durationMs: 80000, finished: true };
const s2 = { startedAt: '2026-10-20T05:00:00.000Z', patternKey: 'relax478', inhale: 4, hold1: 7, exhale: 8, hold2: 0, modeType: 'minutes', modeN: 2, cyclesDone: 6, durationMs: 120000, finished: true };
const s3 = { startedAt: '2026-10-21T06:00:00.000Z', patternKey: 'box', inhale: 4, hold1: 4, exhale: 4, hold2: 4, modeType: 'cycles', modeN: 3, cyclesDone: 1, durationMs: 20000, finished: false };
let sum = L.summarize([s1, s2, s3]);
eq(sum.totalSessions, 3, 'summarize counts all');
eq(sum.finishedSessions, 2, 'summarize counts finished');
close(sum.totalMinutes, 3.33, 'summarize total minutes (2dp)');
eq(sum.totalCycles, 11, 'summarize total cycles');
eq(sum.perPattern.box, 1, 'perPattern box');
eq(sum.perPattern.relax478, 1, 'perPattern relax478');
ok(sum.streakDays >= 1, 'streak at least 1 (today + yesterday)');
// streak broken by gap
const g1 = { startedAt: '2026-10-21T05:00:00.000Z', patternKey: 'box', inhale: 4, hold1: 4, exhale: 4, hold2: 4, modeType: 'cycles', modeN: 1, cyclesDone: 1, durationMs: 16000, finished: true };
const g2 = { startedAt: '2026-10-15T05:00:00.000Z', patternKey: 'box', inhale: 4, hold1: 4, exhale: 4, hold2: 4, modeType: 'cycles', modeN: 1, cyclesDone: 1, durationMs: 16000, finished: true };
eq(L.summarize([g1, g2]).streakDays, 1, 'gap breaks streak');
eq(L.summarize([]).streakDays, 0, 'empty streak 0');
eq(L.summarize('nope').totalSessions, 0, 'non-array safe');

// --- validateImport ---
const env = L.buildExport([s1]);
eq(env.app, 'breathing-bd', 'export app tag'); eq(env.version, 1, 'export version');
let v = L.validateImport(JSON.parse(JSON.stringify(env)));
eq(v.ok, true, 'round-trip import ok'); eq(v.sessions.length, 1, 'round-trip 1 session');
eq(L.validateImport({ app: 'other', version: 1, sessions: [] }).ok, false, 'wrong app rejected');
eq(L.validateImport({ app: 'breathing-bd', version: 2, sessions: [] }).ok, false, 'bad version rejected');
eq(L.validateImport({ app: 'breathing-bd', version: 1, sessions: 'x' }).ok, false, 'bad sessions rejected');
eq(L.validateImport({ app: 'breathing-bd', version: 1, sessions: [{ startedAt: 'bad', patternKey: 'box', inhale: 4, hold1: 4, exhale: 4, hold2: 4, modeType: 'cycles', modeN: 5, cyclesDone: 5, durationMs: 80000, finished: true }] }).ok, false, 'bad date rejected');
eq(L.validateImport({ app: 'breathing-bd', version: 1, sessions: [{ startedAt: s1.startedAt, patternKey: 'box', inhale: 0, hold1: 4, exhale: 4, hold2: 4, modeType: 'cycles', modeN: 5, cyclesDone: 5, durationMs: 80000, finished: true }] }).ok, false, 'bad pattern rejected');
eq(L.validateImport({ app: 'breathing-bd', version: 1, sessions: [{ startedAt: s1.startedAt, patternKey: 'box', inhale: 4, hold1: 4, exhale: 4, hold2: 4, modeType: 'huh', modeN: 5, cyclesDone: 5, durationMs: 80000, finished: true }] }).ok, false, 'bad modeType rejected');
eq(L.validateImport(null).ok, false, 'null rejected');
// sanitization: long patternKey truncated, finished coerced
let vs = L.validateImport({ app: 'breathing-bd', version: 1, sessions: [{ startedAt: s1.startedAt, patternKey: 'x'.repeat(100), inhale: 4, hold1: 4, exhale: 4, hold2: 4, modeType: 'cycles', modeN: 5, cyclesDone: 2.7, durationMs: 80000.4, finished: 1 }] });
eq(vs.ok, true, 'sanitize ok'); eq(vs.sessions[0].patternKey.length, 40, 'patternKey truncated');
eq(vs.sessions[0].cyclesDone, 2, 'cyclesDone floored'); eq(vs.sessions[0].finished, false, 'finished coerced false');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
