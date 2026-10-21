/* breathing-bd -- pure session-timing engine.
 * Dual-mode: browser (window.BreathingLogic) and node (module.exports).
 * All durations in SECONDS in patterns; phaseAt works in MILLISECONDS.
 * No DOM, no network, no secrets.
 */
(function () {
  'use strict';

  // Phase names in cycle order. hold1 = after inhale, hold2 = after exhale.
  var PHASE_ORDER = ['inhale', 'hold1', 'exhale', 'hold2'];

  var BUILTIN_PATTERNS = {
    box:     { inhale: 4, hold1: 4, exhale: 4, hold2: 4, key: 'box' },
    relax478:{ inhale: 4, hold1: 7, exhale: 8, hold2: 0, key: 'relax478' },
    calm46:  { inhale: 4, hold1: 0, exhale: 6, hold2: 0, key: 'calm46' },
    energize:{ inhale: 6, hold1: 2, exhale: 6, hold2: 0, key: 'energize' }
  };

  var MIN_PHASE_SEC = 1;
  var MAX_PHASE_SEC = 30;

  function clonePattern(p) {
    return { inhale: p.inhale, hold1: p.hold1, exhale: p.exhale, hold2: p.hold2 };
  }

  // Validate a 4-phase pattern object. Returns array of error-code strings (empty = ok).
  function validatePattern(p) {
    var errors = [];
    if (!p || typeof p !== 'object') return ['not-an-object'];
    var i, name, v;
    for (i = 0; i < PHASE_ORDER.length; i++) {
      name = PHASE_ORDER[i];
      v = p[name];
      if (typeof v !== 'number' || !isFinite(v)) { errors.push('bad-' + name); continue; }
      if (v !== Math.round(v)) { errors.push('not-integer-' + name); continue; }
      if (name === 'inhale' || name === 'exhale') {
        if (v < MIN_PHASE_SEC) errors.push('too-short-' + name);
        if (v > MAX_PHASE_SEC) errors.push('too-long-' + name);
      } else {
        // holds are optional (0 allowed) but capped
        if (v < 0) errors.push('negative-' + name);
        if (v > MAX_PHASE_SEC) errors.push('too-long-' + name);
      }
    }
    if (errors.length === 0) {
      var cyc = cycleDuration(p);
      if (cyc <= 0) errors.push('zero-cycle');
      if (cyc > 240) errors.push('cycle-too-long');
    }
    return errors;
  }

  // Ordered list of active phases (zero-duration holds dropped).
  // Each entry: { name, dur } with dur in seconds.
  function phaseList(p) {
    var out = [], i, name;
    for (i = 0; i < PHASE_ORDER.length; i++) {
      name = PHASE_ORDER[i];
      if (p[name] > 0) out.push({ name: name, dur: p[name] });
    }
    return out;
  }

  // One full breath cycle in seconds.
  function cycleDuration(p) {
    var phases = phaseList(p), total = 0, i;
    for (i = 0; i < phases.length; i++) total += phases[i].dur;
    return total;
  }

  // Breaths per minute for a pattern (exact float).
  function breathsPerMinute(p) {
    var cyc = cycleDuration(p);
    return cyc > 0 ? 60 / cyc : 0;
  }

  // Deterministic session position at elapsed milliseconds since session start.
  // mode: { type:'cycles', n } or { type:'minutes', n }.
  // Returns null when the session is complete (elapsed >= totalDuration).
  // Otherwise { phase, phaseIndex, cycleIndex, phaseStartMs, phaseEndMs,
  //             cycleStartMs, cycleEndMs, elapsedMs, totalMs }.
  function phaseAt(p, mode, elapsedMs) {
    var total = totalDuration(p, mode);
    if (!(elapsedMs >= 0) || elapsedMs >= total) return null;
    var cycMs = cycleDuration(p) * 1000;
    if (cycMs <= 0) return null;
    var cycleIndex = Math.floor(elapsedMs / cycMs);
    var within = elapsedMs - cycleIndex * cycMs;
    var phases = phaseList(p);
    var acc = 0, i, start, end;
    for (i = 0; i < phases.length; i++) {
      start = acc;
      end = acc + phases[i].dur * 1000;
      if (within < end) {
        return {
          phase: phases[i].name,
          phaseIndex: i,
          cycleIndex: cycleIndex,
          phaseStartMs: cycleIndex * cycMs + start,
          phaseEndMs: cycleIndex * cycMs + end,
          cycleStartMs: cycleIndex * cycMs,
          cycleEndMs: (cycleIndex + 1) * cycMs,
          elapsedMs: elapsedMs,
          totalMs: total
        };
      }
      acc = end;
    }
    // within == cycMs exactly would have been caught by floor(); defensive fallback
    return null;
  }

  // Total session length in milliseconds.
  function totalDuration(p, mode) {
    if (!mode || typeof mode !== 'object') return 0;
    if (mode.type === 'cycles') {
      var n = Math.floor(mode.n);
      if (!(n >= 1) || n > 200) return 0;
      return n * cycleDuration(p) * 1000;
    }
    if (mode.type === 'minutes') {
      var m = mode.n;
      if (typeof m !== 'number' || !(m >= 1) || m > 120) return 0;
      return m * 60000;
    }
    return 0;
  }

  // Validate session-setup form values. Returns error-code array.
  function validateSession(mode) {
    if (!mode || typeof mode !== 'object') return ['bad-mode'];
    if (mode.type === 'cycles') {
      if (!Number.isInteger(mode.n) || mode.n < 1 || mode.n > 200) return ['bad-cycles'];
      return [];
    }
    if (mode.type === 'minutes') {
      if (typeof mode.n !== 'number' || !isFinite(mode.n) || mode.n < 1 || mode.n > 120) return ['bad-minutes'];
      return [];
    }
    return ['bad-mode'];
  }

  // Summarize finished sessions into dashboard stats.
  // sessions: [{ startedAt (ISO), patternKey, inhale, hold1, exhale, hold2,
  //             modeType, modeN, cyclesDone, durationMs, finished }]
  function summarize(sessions) {
    var stats = {
      totalSessions: 0, finishedSessions: 0,
      totalMinutes: 0, totalCycles: 0,
      todaySessions: 0, todayMinutes: 0,
      streakDays: 0, perPattern: {}
    };
    if (!Array.isArray(sessions)) return stats;
    var todayStr = isoDay(new Date());
    var days = {}; // isoDay -> true for finished sessions
    var i, s;
    for (i = 0; i < sessions.length; i++) {
      s = sessions[i];
      if (!s || typeof s !== 'object') continue;
      stats.totalSessions++;
      if (!s.finished) continue;
      stats.finishedSessions++;
      var mins = (typeof s.durationMs === 'number' ? s.durationMs : 0) / 60000;
      stats.totalMinutes += mins;
      stats.totalCycles += (typeof s.cyclesDone === 'number' ? s.cyclesDone : 0);
      var key = typeof s.patternKey === 'string' ? s.patternKey : 'custom';
      stats.perPattern[key] = (stats.perPattern[key] || 0) + 1;
      var d = dayOf(s.startedAt);
      if (d) {
        days[d] = true;
        if (d === todayStr) { stats.todaySessions++; stats.todayMinutes += mins; }
      }
    }
    // streak: consecutive days ending today or yesterday
    var cursor = new Date();
    if (!days[isoDay(cursor)]) cursor = addDays(cursor, -1); // yesterday-alive rule
    var streak = 0;
    while (days[isoDay(cursor)]) { streak++; cursor = addDays(cursor, -1); }
    stats.streakDays = streak;
    stats.totalMinutes = Math.round(stats.totalMinutes * 100) / 100;
    stats.todayMinutes = Math.round(stats.todayMinutes * 100) / 100;
    return stats;
  }

  function isoDay(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function dayOf(iso) {
    if (typeof iso !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})T/.exec(iso);
    return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
  }
  function addDays(d, n) { var c = new Date(d.getTime()); c.setDate(c.getDate() + n); return c; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // Strict validation for JSON import envelopes.
  // envelope: { app:'breathing-bd', version:1, exportedAt, sessions:[...] }
  // Returns { ok:true, sessions } or { ok:false, error }.
  function validateImport(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'not-an-object' };
    if (data.app !== 'breathing-bd') return { ok: false, error: 'wrong-app' };
    if (data.version !== 1) return { ok: false, error: 'bad-version' };
    if (!Array.isArray(data.sessions)) return { ok: false, error: 'bad-sessions' };
    if (data.sessions.length > 5000) return { ok: false, error: 'too-many' };
    var clean = [], i, s, errs;
    for (i = 0; i < data.sessions.length; i++) {
      s = data.sessions[i];
      if (!s || typeof s !== 'object') return { ok: false, error: 'bad-entry-' + i };
      if (typeof s.startedAt !== 'string' || !dayOf(s.startedAt)) return { ok: false, error: 'bad-date-' + i };
      errs = validatePattern({ inhale: s.inhale, hold1: s.hold1, exhale: s.exhale, hold2: s.hold2 });
      if (errs.length) return { ok: false, error: 'bad-pattern-' + i };
      if (s.modeType !== 'cycles' && s.modeType !== 'minutes') return { ok: false, error: 'bad-mode-' + i };
      if (typeof s.modeN !== 'number' || !isFinite(s.modeN) || s.modeN <= 0) return { ok: false, error: 'bad-moden-' + i };
      if (typeof s.durationMs !== 'number' || s.durationMs < 0 || s.durationMs > 8 * 3600000) return { ok: false, error: 'bad-duration-' + i };
      if (typeof s.cyclesDone !== 'number' || s.cyclesDone < 0 || s.cyclesDone > 100000) return { ok: false, error: 'bad-cyclesdone-' + i };
      clean.push({
        startedAt: s.startedAt,
        patternKey: typeof s.patternKey === 'string' ? s.patternKey.slice(0, 40) : 'custom',
        inhale: s.inhale, hold1: s.hold1, exhale: s.exhale, hold2: s.hold2,
        modeType: s.modeType, modeN: s.modeN,
        cyclesDone: Math.floor(s.cyclesDone),
        durationMs: Math.round(s.durationMs),
        finished: s.finished === true
      });
    }
    return { ok: true, sessions: clean };
  }

  function buildExport(sessions) {
    return {
      app: 'breathing-bd',
      version: 1,
      exportedAt: new Date().toISOString(),
      sessions: sessions || []
    };
  }

  var api = {
    PHASE_ORDER: PHASE_ORDER,
    BUILTIN_PATTERNS: BUILTIN_PATTERNS,
    MIN_PHASE_SEC: MIN_PHASE_SEC,
    MAX_PHASE_SEC: MAX_PHASE_SEC,
    clonePattern: clonePattern,
    validatePattern: validatePattern,
    phaseList: phaseList,
    cycleDuration: cycleDuration,
    breathsPerMinute: breathsPerMinute,
    phaseAt: phaseAt,
    totalDuration: totalDuration,
    validateSession: validateSession,
    summarize: summarize,
    validateImport: validateImport,
    buildExport: buildExport,
    isoDay: isoDay
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (typeof window !== 'undefined') {
    window.BreathingLogic = api;
  }
})();
