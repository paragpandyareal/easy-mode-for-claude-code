// Re-run the security reviewer's attacks against a fresh practice server.
// It builds its own "evil" test folder and a throwaway settings folder in %TEMP%,
// starts the server on port 4460, runs the checks, then stops it.
// usage: node tools/dev/attack-check.js
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn, execSync } = require('child_process');
const PORT = 4460;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'br-attack-'));
const EVIL = path.join(TMP, 'evil'), OUTSIDE = path.join(TMP, 'outside'), MARKER = path.join(TMP, 'marker.txt');

// The fixture: a folder that tries to run a status line, plus a secret and a junction out.
fs.mkdirSync(path.join(EVIL, '.claude'), { recursive: true });
fs.mkdirSync(OUTSIDE, { recursive: true });
fs.writeFileSync(path.join(EVIL, 'index.html'), '<h1>hello</h1>');
fs.writeFileSync(path.join(EVIL, '.env'), 'SECRET=1');
fs.writeFileSync(path.join(OUTSIDE, 'secret.txt'), 'secret');
fs.writeFileSync(path.join(EVIL, '.claude', 'settings.json'), JSON.stringify({ statusLine: { type: 'command', command: `node -e "require('fs').writeFileSync(${JSON.stringify(MARKER)},'x')"` } }));
try { execSync(`mklink /J "${path.join(EVIL, 'link')}" "${OUTSIDE}"`, { shell: 'cmd.exe', stdio: 'ignore' }); } catch { fs.symlinkSync(OUTSIDE, path.join(EVIL, 'link'), 'junction'); }

const env = { ...process.env, BYTE_RUNNER_PORT: String(PORT), APPDATA: path.join(TMP, 'appdata'), HOME: path.join(TMP, 'home') };
fs.mkdirSync(env.APPDATA, { recursive: true });
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'practice.js')], { env, stdio: 'ignore' });

const req = (method, p, { headers = {}, body, port = PORT } = {}) => new Promise(res => {
  const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { host: `127.0.0.1:${port}`, ...headers } }, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res({ status: x.statusCode, body: d, headers: x.headers })); });
  r.on('error', e => res({ status: 0, body: e.message })); if (body) r.write(JSON.stringify(body)); r.end();
});
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let page;
  for (let i = 0; i < 40; i++) { page = await req('GET', '/'); if (page.status === 200) break; await sleep(250); }
  const TOK = (page.body.match(/[a-f0-9]{48}/) || [])[0];
  ok(!!TOK, 'got token from our own host');
  const rebind = await req('GET', '/', { headers: { host: 'attacker.example:4460' } });
  ok(rebind.status === 421 && !/[a-f0-9]{48}/.test(rebind.body), 'DNS rebinding host is refused (' + rebind.status + ')');
  const H = { 'x-br-token': TOK, 'content-type': 'application/json', origin: `http://127.0.0.1:${PORT}` };
  let r = await req('POST', '/api/session/start', { headers: H, body: { cwd: EVIL } });
  let j = JSON.parse(r.body);
  ok(j.needsTrust && j.risks.statusLine, 'untrusted folder asks first');
  r = await req('POST', '/api/session/start', { headers: H, body: { cwd: EVIL, trust: false } });
  j = JSON.parse(r.body); const sid = j.session && j.session.id;
  ok(!!sid, 'can start safely without its settings');
  const sl = await req('POST', `/api/session/${sid}/statusline`, { headers: H, body: { data: {} } });
  await sleep(1500);
  ok(!fs.existsSync(MARKER), 'project status line did NOT run (' + sl.body.slice(0, 60) + ')');
  const g = (await req('GET', `/api/session/${sid}/interrupt?token=${TOK}`)).status;
  ok(g === 405 || g === 403, 'GET cannot trigger actions (' + g + ')');
  ok((await req('POST', `/api/session/${sid}/interrupt`, { headers: { 'x-br-token': TOK } })).status === 403, 'POST without our origin is refused');
  ok((await req('POST', `/api/session/${sid}/interrupt`, { headers: { ...H, origin: 'http://evil.example' } })).status === 403, 'POST from another site is refused');
  ok((await req('POST', `/api/session/${sid}/model`, { headers: H, body: { effort: 'high\r\nwhoami' } })).status === 400, 'odd effort value is refused');
  ok((await req('GET', '/api/info')).status === 401 || (await req('GET', '/api/info')).status === 403, 'API needs the token');
  const info = JSON.parse((await req('GET', '/api/info', { headers: { 'x-br-token': TOK } })).body);
  const key = info.sessions.find(x => x.id === sid).previewKey, pp = info.previewPort;
  const pv = f => req('GET', `/preview/${sid}.${key}/${f}`, { port: pp, headers: { host: `127.0.0.1:${pp}` } });
  ok((await pv('index.html')).status === 200, 'normal page still previews');
  ok((await pv('.env')).status === 403, 'hidden .env is not served');
  ok((await pv('link/secret.txt')).status === 403, 'junction outside the project is refused');
  ok((await pv('..%2f..%2foutside/secret.txt')).status >= 400, 'dot-dot escape is refused');
  ok((await req('GET', `/preview/${sid}.wrongkey/index.html`, { port: pp, headers: { host: `127.0.0.1:${pp}` } })).status >= 400, 'wrong preview key is refused');
  ok((await req('GET', `/preview/${sid}.${key}/index.html`, { port: pp, headers: { host: 'evil.example:' + pp } })).status === 421, 'preview refuses other host names');
  const csp = (await pv('index.html')).headers['content-security-policy'];
  ok(/connect-src 'self'/.test(csp || ''), 'preview pages cannot send data out');
  r = await req('POST', '/api/session/start', { headers: H, body: { cwd: EVIL, trust: true } });
  j = JSON.parse(r.body);
  ok(!j.needsTrust && j.session, 'trusting it works');
  fs.appendFileSync(path.join(EVIL, '.claude', 'settings.json'), ' ');
  j = JSON.parse((await req('POST', '/api/session/start', { headers: H, body: { cwd: EVIL } })).body);
  ok(j.needsTrust, 'changing its settings asks again');
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  srv.kill(); try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  process.exit(fails ? 1 : 0);
})();
