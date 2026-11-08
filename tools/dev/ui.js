// Drive Byte Runner in headless Edge over the DevTools protocol, like a user would.
// usage: node ui.js <url> <outdir> [steps...]
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const [url, out = '.'] = process.argv.slice(2);
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'br-edge-'));
const port = 9333 + Math.floor(Math.random() * 500);
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1600,1000', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let tabs;
  for (let i = 0; i < 50; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
  const page = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const wait = new Map(); const logs = [];
  ws.onmessage = m => { const j = JSON.parse(m.data); if (j.id && wait.has(j.id)) { wait.get(j.id)(j); wait.delete(j.id); }
    if (j.method === 'Runtime.consoleAPICalled') logs.push('console.' + j.params.type + ': ' + j.params.args.map(a => a.value ?? a.description).join(' '));
    if (j.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION: ' + j.params.exceptionDetails.exception?.description);
    if (j.method === 'Network.responseReceived' && j.params.response.url.includes('/api/')) logs.push(`net ${j.params.response.status} ${j.params.response.url.replace(/token=[a-f0-9]+/, 'token=…')}`);
  };
  const cmd = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const js = async expr => { const r = await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
  const shot = async name => { const r = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(r.result.data, 'base64')); console.log('shot', name); };
  await cmd('Runtime.enable'); await cmd('Network.enable'); await cmd('Page.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cmd('Page.navigate', { url }); await sleep(2500);
  global.B = { js, shot, sleep, cmd };
  const script = process.env.UI_SCRIPT ? require(path.resolve(process.env.UI_SCRIPT)) : async () => {};
  try { await script(global.B); } catch (e) { console.log('SCRIPT ERROR', e.message); }
  console.log('--- log\n' + logs.join('\n'));
  ws.close(); edge.kill(); process.exit(0);
})().catch(e => { console.log('FAIL', e); edge.kill(); process.exit(1); });
