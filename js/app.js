/* breathing-bd -- UI. Requires logic.js + i18n.js loaded before this file. */
(function () {
  'use strict';

  var L = window.BreathingLogic;
  var I18N = window.BreathingI18n;

  var STORE_KEY = 'breathing-bd:v1';
  // Test hook: ?fast=N divides every phase duration by N (documented in TEST_RESULTS.md).
  var FAST = 1;
  try {
    var m = /[?&]fast=(\d+)/.exec(window.location.search || '');
    if (m && parseInt(m[1], 10) >= 1) FAST = parseInt(m[1], 10);
  } catch (e) { /* ignore */ }

  // ---------- storage ----------
  function loadStore() {
    var s = { lang: 'en', patternKey: 'box', custom: { inhale: 4, hold1: 4, exhale: 4, hold2: 0 }, mode: { type: 'cycles', n: 5 }, sound: true, sessions: [] };
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && typeof d === 'object') {
          if (d.lang === 'en' || d.lang === 'bn') s.lang = d.lang;
          if (typeof d.patternKey === 'string' && (L.BUILTIN_PATTERNS[d.patternKey] || d.patternKey === 'custom')) s.patternKey = d.patternKey;
          if (d.custom && L.validatePattern(d.custom).length === 0) s.custom = L.clonePattern(d.custom);
          if (d.mode && L.validateSession(d.mode).length === 0) s.mode = { type: d.mode.type, n: d.mode.n };
          if (typeof d.sound === 'boolean') s.sound = d.sound;
          if (Array.isArray(d.sessions)) {
            var v = L.validateImport({ app: 'breathing-bd', version: 1, sessions: d.sessions });
            if (v.ok) s.sessions = v.sessions;
          }
        }
      }
    } catch (e) { /* corrupted storage -> defaults */ }
    return s;
  }
  function saveStore() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify({
        lang: state.lang, patternKey: state.patternKey, custom: state.custom,
        mode: state.mode, sound: state.sound, sessions: state.sessions
      }));
    } catch (e) { /* quota -> ignore */ }
  }

  var state = loadStore();
  function t(key, vars) { return I18N.t(state.lang, key, vars); }
  function num(v) {
    var s = String(v);
    if (state.lang === 'bn') {
      return s.replace(/[0-9]/g, function (d) { return '\u09e6\u09e7\u09e8\u09e9\u09ea\u09eb\u09ec\u09ed\u09ee\u09ef'[+d]; });
    }
    return s;
  }

  // ---------- audio ----------
  var audioCtx = null;
  function ensureAudio() {
    if (!state.sound) return null;
    try {
      if (!audioCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    } catch (e) { return null; }
  }
  function tone(freq, durMs, gain) {
    var ctx = ensureAudio();
    if (!ctx) return;
    try {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(gain || 0.08, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durMs / 1000);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + durMs / 1000 + 0.05);
    } catch (e) { /* audio unavailable */ }
  }
  var PHASE_FREQ = { inhale: 523.25, hold1: 659.25, exhale: 392.0, hold2: 329.63 };

  // ---------- session runtime ----------
  // runtime: null | { pattern, mode, totalMs, startedPerf, pausedAccum, pauseStartPerf|null,
  //                   lastPhase, done, lastTickSec }
  var runtime = null;

  function activePattern() {
    var p = state.patternKey === 'custom' ? L.clonePattern(state.custom) : L.clonePattern(L.BUILTIN_PATTERNS[state.patternKey]);
    if (FAST !== 1) {
      var out = {}, k;
      for (k in p) { if (Object.prototype.hasOwnProperty.call(p, k)) out[k] = Math.max(1, Math.round(p[k] / FAST)); }
      return out;
    }
    return p;
  }

  function elapsedMs() {
    if (!runtime) return 0;
    var now = window.performance.now();
    var acc = runtime.pausedAccum;
    if (runtime.pauseStartPerf !== null) acc += now - runtime.pauseStartPerf;
    return now - runtime.startedPerf - acc;
  }

  function recordSession(finished) {
    var el = elapsedMs();
    var cycMs = L.cycleDuration(runtime.pattern) * 1000;
    var cyclesDone = cycMs > 0 ? Math.floor(el / cycMs) : 0;
    if (finished) {
      if (runtime.mode.type === 'cycles') cyclesDone = runtime.mode.n;
      else cyclesDone = Math.floor(el / cycMs);
    }
    state.sessions.push({
      startedAt: new Date(runtime.wallStart).toISOString(),
      patternKey: state.patternKey,
      inhale: runtime.pattern.inhale, hold1: runtime.pattern.hold1,
      exhale: runtime.pattern.exhale, hold2: runtime.pattern.hold2,
      modeType: runtime.mode.type, modeN: runtime.mode.n,
      cyclesDone: cyclesDone, durationMs: Math.round(el), finished: finished
    });
    saveStore();
  }

  // ---------- DOM helpers ----------
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  // ---------- render ----------
  function renderAll() { renderHeader(); renderGuide(); renderHistory(); renderData(); applyLang(); }

  function applyLang() {
    document.documentElement.lang = state.lang === 'bn' ? 'bn' : 'en';
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    }
    $('langToggle').textContent = t('lang.toggle');
  }

  function renderHeader() {
    $('appTitle').textContent = t('app.title');
    $('appTagline').textContent = t('app.tagline');
  }

  function setTab(name) {
    var tabs = ['guide', 'history', 'data'];
    tabs.forEach(function (n) {
      $('tab-' + n).classList.toggle('active', n === name);
      $('panel-' + n).classList.toggle('active', n === name);
    });
  }

  function renderGuide() {
    // pattern cards
    var wrap = $('patternCards');
    wrap.innerHTML = '';
    var keys = ['box', 'relax478', 'calm46', 'energize', 'custom'];
    keys.forEach(function (k) {
      var card = el('button', 'pattern-card' + (state.patternKey === k ? ' selected' : ''));
      card.type = 'button';
      card.setAttribute('data-pattern', k);
      var p = k === 'custom' ? state.custom : L.BUILTIN_PATTERNS[k];
      var seq = L.phaseList(p).map(function (ph) { return ph.dur; }).join('-');
      card.appendChild(el('span', 'pattern-name', t('pattern.' + k)));
      card.appendChild(el('span', 'pattern-seq', num(seq)));
      card.appendChild(el('span', 'pattern-desc', t('pattern.' + k + '.desc')));
      card.addEventListener('click', function () {
        if (runtime) return; // locked during session
        state.patternKey = k; saveStore(); renderGuide();
      });
      wrap.appendChild(card);
    });
    // custom inputs
    var ci = $('customInputs');
    ci.style.display = state.patternKey === 'custom' ? '' : 'none';
    if (state.patternKey === 'custom') {
      ci.innerHTML = '';
      ['inhale', 'hold1', 'exhale', 'hold2'].forEach(function (name) {
        var lab = el('label', 'field');
        lab.appendChild(el('span', '', t('custom.' + name)));
        var inp = el('input', 'num-input');
        inp.type = 'number'; inp.min = name === 'inhale' || name === 'exhale' ? '1' : '0';
        inp.max = '30'; inp.step = '1'; inp.value = state.custom[name];
        inp.id = 'custom-' + name;
        inp.disabled = !!runtime;
        inp.addEventListener('change', function () {
          var v = parseInt(inp.value, 10);
          var trial = L.clonePattern(state.custom);
          trial[name] = isNaN(v) ? state.custom[name] : v;
          if (L.validatePattern(trial).length === 0) { state.custom = trial; saveStore(); }
          renderGuide();
        });
        lab.appendChild(inp);
        ci.appendChild(lab);
      });
    }
    // mode + count
    $('modeCycles').classList.toggle('selected', state.mode.type === 'cycles');
    $('modeMinutes').classList.toggle('selected', state.mode.type === 'minutes');
    $('modeCycles').textContent = t('setup.cycles');
    $('modeMinutes').textContent = t('setup.minutes');
    $('modeN').value = state.mode.n;
    $('modeN').disabled = !!runtime;
    $('soundToggle').textContent = (state.sound ? t('setup.sound.on') : t('setup.sound.off'));
    $('soundToggle').classList.toggle('on', state.sound);
    $('bpmHint').textContent = t('live.bpm') + ': ' + num(activePatternBpm());
    $('startBtn').disabled = !!runtime;
    $('pauseBtn').disabled = !runtime || runtime.done;
    $('stopBtn').disabled = !runtime;
    if (!runtime) {
      $('phaseLabel').textContent = t('live.ready');
      $('phaseCount').textContent = '';
      setCircle(0.6, 'idle');
    }
  }

  function activePatternBpm() {
    var b = L.breathsPerMinute(activePattern());
    return (Math.round(b * 100) / 100).toString();
  }

  var PHASE_CLASS = { inhale: 'inhale', hold1: 'hold', exhale: 'exhale', hold2: 'hold' };
  function setCircle(scale, phase) {
    var c = $('breathCircle');
    c.style.transform = 'scale(' + scale.toFixed(4) + ')';
    c.className = 'breath-circle phase-' + (phase || 'idle');
  }

  // main loop
  var rafId = null;
  function loop() {
    if (!runtime || runtime.done) return;
    if (runtime.pauseStartPerf === null) {
      var elMs = elapsedMs();
      var pos = L.phaseAt(runtime.pattern, runtime.mode, elMs);
      if (!pos) { finishSession(true); return; }
      if (pos.phase !== runtime.lastPhase) {
        runtime.lastPhase = pos.phase;
        tone(PHASE_FREQ[pos.phase] || 440, 400);
      }
      // circle scale within phase
      var phaseDur = pos.phaseEndMs - pos.phaseStartMs;
      var frac = phaseDur > 0 ? (elMs - pos.phaseStartMs) / phaseDur : 0;
      var scale;
      if (pos.phase === 'inhale') scale = 0.6 + 0.4 * frac;
      else if (pos.phase === 'exhale') scale = 1.0 - 0.4 * frac;
      else scale = pos.phase === 'hold1' ? 1.0 : 0.6;
      setCircle(scale, PHASE_CLASS[pos.phase]);
      var remainSec = Math.ceil((pos.phaseEndMs - elMs) / 1000);
      $('phaseLabel').textContent = t('phase.' + pos.phase);
      $('phaseCount').textContent = num(remainSec);
      var totalLeft = Math.max(0, Math.ceil((runtime.totalMs - elMs) / 1000));
      $('liveStats').textContent =
        t('live.cycle') + ' ' + num(pos.cycleIndex + 1) +
        (runtime.mode.type === 'cycles' ? ' ' + t('live.of') + ' ' + num(runtime.mode.n) : '') +
        '  \u00b7  ' + t('live.elapsed') + ' ' + num(fmtDur(Math.floor(elMs / 1000))) +
        '  \u00b7  ' + t('live.remaining') + ' ' + num(fmtDur(totalLeft));
      $('progressFill').style.width = (100 * elMs / runtime.totalMs).toFixed(2) + '%';
    }
    rafId = window.requestAnimationFrame(loop);
  }

  function fmtDur(totalSec) {
    var m = Math.floor(totalSec / 60), s = totalSec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function startSession() {
    var errs = L.validateSession(state.mode);
    if (errs.length) { showError(t(errs[0] === 'bad-cycles' ? 'err.cycles' : 'err.minutes')); return; }
    var pattern = activePattern();
    var perrs = L.validatePattern(pattern);
    if (perrs.length) { showError(t('err.pattern', { err: perrs[0] })); return; }
    var total = L.totalDuration(pattern, state.mode);
    if (!total) { showError(t('err.cycles')); return; }
    ensureAudio(); // unlock audio on user gesture
    runtime = {
      pattern: pattern, mode: { type: state.mode.type, n: state.mode.n },
      totalMs: total, startedPerf: window.performance.now(), wallStart: Date.now(),
      pausedAccum: 0, pauseStartPerf: null, lastPhase: null, done: false
    };
    hideError(); renderGuide();
    $('pauseBtn').textContent = t('btn.pause');
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = window.requestAnimationFrame(loop);
  }

  function togglePause() {
    if (!runtime || runtime.done) return;
    var now = window.performance.now();
    if (runtime.pauseStartPerf === null) {
      runtime.pauseStartPerf = now;
      $('phaseLabel').textContent = t('live.paused');
      $('pauseBtn').textContent = t('btn.resume');
    } else {
      runtime.pausedAccum += now - runtime.pauseStartPerf;
      runtime.pauseStartPerf = null;
      runtime.lastPhase = null; // force tone re-fire
      $('pauseBtn').textContent = t('btn.pause');
    }
  }

  function finishSession(finished) {
    if (!runtime || runtime.done) return;
    runtime.done = true;
    recordSession(finished);
    runtime = null;
    if (rafId) { window.cancelAnimationFrame(rafId); rafId = null; }
    renderGuide();
    renderHistory();
    // show result card
    var card = $('resultCard');
    card.style.display = '';
    $('resultTitle').textContent = t(finished ? 'done.heading' : 'stopped.heading');
    var last = state.sessions[state.sessions.length - 1];
    $('resultStats').textContent =
      t('done.cycles') + ': ' + num(last.cyclesDone) + '  \u00b7  ' +
      t('done.time') + ': ' + num(fmtDur(Math.round(last.durationMs / 1000)));
    $('resultNote').textContent = finished ? '' : t('stopped.note');
    setCircle(0.6, 'idle');
  }

  function endSessionEarly() { finishSession(false); }

  function showError(msg) {
    var e = $('formError');
    e.textContent = msg; e.style.display = '';
  }
  function hideError() { var e = $('formError'); e.style.display = 'none'; }

  // ---------- history ----------
  function renderHistory() {
    var stats = L.summarize(state.sessions);
    var d = $('dashCards');
    d.innerHTML = '';
    var cards = [
      ['dash.sessions', stats.finishedSessions + '/' + stats.totalSessions],
      ['dash.minutes', Math.round(stats.totalMinutes * 10) / 10],
      ['dash.cycles', stats.totalCycles],
      ['dash.streak', stats.streakDays]
    ];
    cards.forEach(function (c) {
      var card = el('div', 'stat-card');
      card.appendChild(el('div', 'stat-num', num(c[1])));
      card.appendChild(el('div', 'stat-label', t(c[0])));
      d.appendChild(card);
    });
    var list = $('historyList');
    list.innerHTML = '';
    if (!state.sessions.length) {
      list.appendChild(el('p', 'empty', t('hist.empty')));
      return;
    }
    var items = state.sessions.slice().reverse().slice(0, 50);
    items.forEach(function (s) {
      var row = el('div', 'hist-row');
      var dt = new Date(s.startedAt);
      var dateStr = dt.getFullYear() + '-' + (dt.getMonth() + 1) + '-' + dt.getDate();
      row.appendChild(el('span', 'hist-date', num(dateStr)));
      row.appendChild(el('span', 'hist-pattern', patternDisplayName(s.patternKey)));
      row.appendChild(el('span', 'hist-mode',
        s.modeType === 'cycles' ? num(s.modeN) + ' ' + t('setup.cycles') : num(s.modeN) + ' ' + t('setup.minutes')));
      row.appendChild(el('span', 'hist-cycles', num(s.cyclesDone) + ' ' + t('done.cycles')));
      row.appendChild(el('span', 'hist-badge ' + (s.finished ? 'ok' : 'early'), t(s.finished ? 'hist.finished' : 'hist.ended')));
      list.appendChild(row);
    });
  }

  function patternDisplayName(key) {
    if (key === 'custom') return t('pattern.custom');
    if (L.BUILTIN_PATTERNS[key]) return t('pattern.' + key);
    return key;
  }

  // ---------- data ----------
  function renderData() { /* static; wired once */ }

  function download(filename, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function wire() {
    $('langToggle').addEventListener('click', function () {
      state.lang = state.lang === 'en' ? 'bn' : 'en';
      saveStore(); renderAll();
    });
    ['guide', 'history', 'data'].forEach(function (n) {
      $('tab-' + n).addEventListener('click', function () { setTab(n); });
    });
    $('modeCycles').addEventListener('click', function () {
      if (runtime) return;
      state.mode = { type: 'cycles', n: 5 }; saveStore(); renderGuide();
    });
    $('modeMinutes').addEventListener('click', function () {
      if (runtime) return;
      state.mode = { type: 'minutes', n: 5 }; saveStore(); renderGuide();
    });
    $('modeN').addEventListener('change', function () {
      var v = parseFloat($('modeN').value);
      var trial = { type: state.mode.type, n: v };
      if (L.validateSession(trial).length === 0) { state.mode = trial; saveStore(); }
      renderGuide();
    });
    $('soundToggle').addEventListener('click', function () {
      state.sound = !state.sound; saveStore(); renderGuide();
    });
    $('startBtn').addEventListener('click', startSession);
    $('pauseBtn').addEventListener('click', togglePause);
    $('stopBtn').addEventListener('click', endSessionEarly);
    $('againBtn').addEventListener('click', function () {
      $('resultCard').style.display = 'none';
      renderGuide();
    });
    $('exportBtn').addEventListener('click', function () {
      download('breathing-bd-export.json', JSON.stringify(L.buildExport(state.sessions), null, 2));
    });
    $('importFile').addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var v = L.validateImport(JSON.parse(r.result));
          if (v.ok) {
            state.sessions = v.sessions; saveStore();
            $('importMsg').textContent = t('data.import.ok', { n: num(v.sessions.length) });
            renderHistory();
          } else {
            $('importMsg').textContent = t('data.import.bad', { err: v.error });
          }
        } catch (e) { $('importMsg').textContent = t('data.import.bad', { err: 'parse' }); }
        ev.target.value = '';
      };
      r.readAsText(f);
    });
    $('eraseBtn').addEventListener('click', function () {
      $('eraseBox').style.display = '';
    });
    $('eraseConfirm').addEventListener('click', function () {
      if ($('eraseWord').value.trim() === 'DELETE') {
        state.sessions = []; saveStore();
        $('eraseMsg').textContent = t('data.erase.done');
        renderHistory();
      } else {
        $('eraseMsg').textContent = t('data.erase.wrong');
      }
    });
  }

  // expose for tests
  window.BreathingApp = {
    getState: function () { return state; },
    getRuntime: function () { return runtime; },
    startSession: startSession,
    togglePause: togglePause,
    endSessionEarly: endSessionEarly,
    finishSession: finishSession,
    elapsedMs: elapsedMs,
    renderAll: renderAll,
    FAST: FAST
  };

  document.addEventListener('DOMContentLoaded', function () {
    wire(); renderAll(); setTab('guide');
  });
})();
