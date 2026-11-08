// End-to-end check of Byte Runner's API against practice mode.
// usage: node e2e.js <port> <project dir>
const http = require('http');
const [port, dir] = [Number(process.argv[2] || 4318), process.argv[3]];
const B = `http://127.0.0.1:${port}`;
let TOK;
const req = (method, p, body) => new Promise((res, rej) => {
  const r = http.request(B + p, { method, headers: { 'x-br-token': TOK || '', 'content-type': 'application/json' } }, x => {
    let d = ''; x.on('data', c => d += c); x.on('end', () => { try { res(JSON.parse(d)); } catch { res(d); } });
  });
  r.on('error', rej); if (body) r.write(JSON.stringify(body)); r.end();
});
const events = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(150); } throw new Error('timeout'); }
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);

(async () => {
  const html = await req('GET', '/');
  TOK = html.match(/[a-f0-9]{48}/)[0];
  http.get(B + '/api/events', { headers: { 'x-br-token': TOK } }, r => {
    let buf = ''; r.on('data', c => { buf += c; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 2); if (l.startsWith('data: ')) events.push(JSON.parse(l.slice(6))); } });
  });
  const info = await req('GET', '/api/info');
  ok(info.claudeFound, 'claude found: ' + info.claudeVersion);
  const { session } = await req('POST', '/api/session/start', { cwd: dir, mode: 'default' });
  const sid = session.id;
  const caps = await until(() => events.find(e => e.sid === sid && e.data.type === 'capabilities'));
  ok(caps, 'handshake: ' + (caps.data.data.commands || []).length + ' commands');

  async function turn(text) {
    const start = events.length;
    await req('POST', `/api/session/${sid}/send`, { text });
    const answered = new Set(); const seen = [];
    await until(() => {
      for (const e of events.slice(start)) {
        if (e.sid !== sid) continue;
        const d = e.data;
        if (d.type === 'control_request' && d.request.subtype === 'can_use_tool' && !answered.has(d.request_id)) {
          answered.add(d.request_id); seen.push(d.request.tool_name);
          const body = { requestId: d.request_id, allow: true };
          if (d.request.tool_name === 'AskUserQuestion') body.updatedInput = { ...d.request.input, answers: {} };
          req('POST', `/api/session/${sid}/permission`, body);
        }
        if (d.type === 'result') return true;
      }
    }, 30000);
    return seen;
  }
  const asked = await turn('Make me a small web page about cats');
  ok(asked.length, 'permission cards answered: ' + asked.join(', '));
  const ch = await until(() => [...events].reverse().find(e => e.sid === sid && e.data.type === 'changes' && e.data.files.length));
  ok(ch, 'changes: ' + ch.data.files.map(f => f.status + ' ' + f.file).join(', '));

  const info2 = await req('GET', '/api/info');
  const s2 = info2.sessions.find(s => s.id === sid);
  ok(s2.checkpoints.length >= 1, 'save points: ' + s2.checkpoints.length);
  const fs = require('fs');
  const before = fs.readdirSync(dir);
  const u = await req('POST', `/api/session/${sid}/undo`, { checkpoint: s2.checkpoints[0].id });
  const after = fs.readdirSync(dir);
  ok(u.ok, `undo: files before [${before}] after [${after}]`);
  ok(!fs.existsSync(require('path').join(dir, '.git')), 'project has no .git added by us');

  const r = await req('POST', `/api/session/${sid}/close`, {});
  ok(r.ok, 'closed');
  process.exit(0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
