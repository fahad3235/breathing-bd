/* breathing-bd — headless-Chrome smoke tests via raw CDP.
 * Run: node tests/smoke.mjs [desktop|mobile]
 * Uses ?fast=10 test hook (documented in TEST_RESULTS.md). */
import { spawn } from 'child_process';

const MODE = process.argv[2] === 'mobile' ? 'mobile' : 'desktop';
const PORT = 19333 + (MODE === 'mobile' ? 1 : 0);
const CHROME = '/opt/meta-chromium/chrome';
const PAGE_URL = 'file:///home/hatch/workspace/muse-project-factory/builds/breathing-bd/index.html?fast=10';

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', name); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const profile = '/tmp/breath-smoke-' + MODE + '-' + Date.now();
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: 'ignore' });
  await sleep(2500);

  // wait for the debugging port
  let up = false;
  for (let i = 0; i < 30 && !up; i++) {
    try {
      await fetch('http://127.0.0.1:' + PORT + '/json/version');
      up = true;
    } catch (e) { await sleep(500); }
  }
  if (!up) throw new Error('chrome debugging port never came up');

  // create tab (Chrome 152+: PUT with URL-encoded query string)
  const newTab = await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(PAGE_URL), {
    method: 'PUT'
  }).then(r => r.json());
  const wsUrl = newTab.webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method === 'Runtime.consoleAPICalled') consoleEvents.push(msg.params);
    else if (msg.method === 'Runtime.exceptionThrown') exceptions.push(msg.params);
    else if (msg.method === 'Network.requestWillBeSent') requests.push(msg.params.request.url);
  };
  const send = (method, params = {}) => new Promise(res => {
    const myId = ++id; pending.set(myId, res);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
  const consoleEvents = [], exceptions = [], requests = [];

  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.enable');
  if (MODE === 'mobile') {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  }
  const ev = async (expr, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
    if (r.result && r.result.result) return r.result.result.value;
    return undefined;
  };

  await sleep(1500); // let DOMContentLoaded + render finish

  // --- static render ---
  ok(await ev(`document.title.includes('Breathing')`), 'title');
  ok(await ev(`document.getElementById('appTitle').textContent === 'Breathing BD'`), 'header title');
  ok((await ev(`document.querySelectorAll('.pattern-card').length`)) === 5, '5 pattern cards');
  ok(await ev(`document.getElementById('phaseLabel').textContent.length > 0`), 'ready label shown');

  // --- custom pattern inputs appear ---
  await ev(`document.querySelector('[data-pattern="custom"]').click()`);
  await sleep(300);
  ok(await ev(`document.getElementById('customInputs').style.display !== 'none'`), 'custom inputs visible');
  await ev(`document.querySelector('[data-pattern="box"]').click()`);
  await sleep(200);

  // --- start a fast session (box, 2 cycles, fast=10 -> 1s phases, 8s total) ---
  await ev(`document.getElementById('modeN').value = '2'; document.getElementById('modeN').dispatchEvent(new Event('change'))`);
  await sleep(200);
  ok((await ev(`window.BreathingApp.getState().mode.n`)) === 2, 'mode n = 2');
  await ev(`document.getElementById('startBtn').click()`);
  await sleep(2500);
  ok((await ev(`window.BreathingApp.getRuntime() !== null`)), 'runtime active');
  const phase1 = await ev(`document.getElementById('phaseLabel').textContent`);
  ok(['Breathe in', 'Hold', 'Breathe out'].includes(phase1), 'phase label live: ' + phase1);
  const scale1 = await ev(`document.getElementById('breathCircle').style.transform`);
  ok(/scale\(0\.[6-9]/.test(scale1) || /scale\(1/.test(scale1), 'circle scaling: ' + scale1);
  const stats1 = await ev(`document.getElementById('liveStats').textContent`);
  ok(stats1.includes('Cycle 1 of 2'), 'live stats cycle text: ' + stats1);

  // --- pause / resume ---
  await ev(`document.getElementById('pauseBtn').click()`);
  await sleep(300);
  ok((await ev(`document.getElementById('phaseLabel').textContent`)) === 'Paused', 'paused label');
  await ev(`document.getElementById('pauseBtn').click()`);
  await sleep(300);
  ok((await ev(`document.getElementById('phaseLabel').textContent`)) !== 'Paused', 'resumed');

  // --- wait for natural completion (8s total + margin) ---
  await sleep(9000);
  ok((await ev(`window.BreathingApp.getRuntime()`)) === null, 'runtime null after finish');
  ok((await ev(`document.getElementById('resultCard').style.display`)) !== 'none', 'result card shown');
  ok((await ev(`document.getElementById('resultTitle').textContent`)) === 'Session complete', 'complete heading');
  const stored = await ev(`JSON.parse(localStorage.getItem('breathing-bd:v1')).sessions.length`);
  ok(stored === 1, '1 session persisted');
  const fin = await ev(`JSON.parse(localStorage.getItem('breathing-bd:v1')).sessions[0].finished`);
  ok(fin === true, 'session marked finished');
  const cyc = await ev(`JSON.parse(localStorage.getItem('breathing-bd:v1')).sessions[0].cyclesDone`);
  ok(cyc === 2, 'cyclesDone = 2');
  await ev(`document.getElementById('againBtn').click()`);
  await sleep(200);

  // --- early stop records unfinished session ---
  await ev(`document.getElementById('startBtn').click()`);
  await sleep(1500);
  await ev(`document.getElementById('stopBtn').click()`);
  await sleep(300);
  ok((await ev(`document.getElementById('resultTitle').textContent`)) === 'Session ended', 'early-stop heading');
  const fin2 = await ev(`JSON.parse(localStorage.getItem('breathing-bd:v1')).sessions[1].finished`);
  ok(fin2 === false, 'early session marked unfinished');
  await ev(`document.getElementById('againBtn').click()`);

  // --- history tab ---
  await ev(`document.getElementById('tab-history').click()`);
  await sleep(300);
  ok((await ev(`document.querySelectorAll('.hist-row').length`)) === 2, '2 history rows');
  ok((await ev(`document.querySelectorAll('.stat-card').length`)) === 4, '4 dashboard cards');

  // --- BN toggle ---
  await ev(`document.getElementById('langToggle').click()`);
  await sleep(300);
  ok((await ev(`document.getElementById('appTitle').textContent`)) === 'ব্রিদিং বিডি', 'BN title');
  const bnDigit = await ev(`document.querySelector('.stat-num').textContent`);
  ok(/[০-৯]/.test(bnDigit), 'Bengali digits in dashboard: ' + bnDigit);
  await ev(`document.getElementById('langToggle').click()`); // back to EN
  await sleep(200);

  // --- data tab: erase wrong word / right word ---
  await ev(`document.getElementById('tab-data').click()`);
  await sleep(200);
  await ev(`document.getElementById('eraseBtn').click()`);
  await ev(`document.getElementById('eraseWord').value = 'nope'`);
  await ev(`document.getElementById('eraseConfirm').click()`);
  await sleep(200);
  ok((await ev(`JSON.parse(localStorage.getItem('breathing-bd:v1')).sessions.length`)) === 2, 'wrong word keeps data');

  // --- malformed import rejected ---
  const importBad = await ev(`window.BreathingLogic.validateImport({app:'breathing-bd',version:1,sessions:[{startedAt:'x'}]}).ok`);
  ok(importBad === false, 'malformed import rejected by validator');

  // --- mobile overflow (both modes checked via emulation only in mobile run) ---
  const overflow = await ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  ok(overflow <= 1, 'no horizontal overflow (' + MODE + '): ' + overflow);

  // --- zero network requests (http/https) ---
  const httpReqs = requests.filter(u => /^https?:\/\//i.test(u));
  ok(httpReqs.length === 0, 'zero http(s) requests (saw ' + httpReqs.length + ')');

  // --- zero console errors / exceptions ---
  const errors = consoleEvents.filter(e => e.type === 'error');
  ok(errors.length === 0, 'zero console.error (' + errors.length + ')');
  ok(exceptions.length === 0, 'zero uncaught exceptions (' + exceptions.length + ')');
  if (errors.length) console.log('console errors:', JSON.stringify(errors).slice(0, 500));
  if (exceptions.length) console.log('exceptions:', JSON.stringify(exceptions).slice(0, 500));

  ws.close();
  chrome.kill('SIGKILL');
  console.log(`\n[${MODE}] ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
