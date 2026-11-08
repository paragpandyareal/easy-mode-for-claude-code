/* =========================================================
   BYTE RUNNER · demo mode
   Used only when the page is opened without the local server
   (for example the online preview). It plays a pretend Claude Code
   session using exactly the same events the real one sends.
   ========================================================= */
(function () {
  'use strict';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const uid = () => Math.random().toString(16).slice(2, 10);

  const CWD = 'C:\\Users\\you\\Byte Runner Projects\\cat-cafe';
  const CAFE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Whisker &amp; Bean</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="hero">
    <p class="kicker">Cat café · Open daily</p>
    <h1>Whisker &amp; Bean</h1>
    <p>Coffee, cake and twelve very sleepy cats.</p>
    <a class="btn" href="#book">Book a table</a>
  </header>
  <main>
    <section class="card">
      <h2>Today's cats</h2>
      <ul class="cats">
        <li><b>Mochi</b> napping in the window</li>
        <li><b>Biscuit</b> judging everyone</li>
        <li><b>Pepper</b> wants your muffin</li>
      </ul>
    </section>
    <section class="card">
      <h2>Menu</h2>
      <p>Flat white 5 · Chai 5.5 · Cat-shaped cookies 4</p>
    </section>
    <section class="card" id="book">
      <h2>Opening hours</h2>
      <p>Every day, 8am to 6pm</p>
    </section>
  </main>
</body>
</html>
`;
  const CAFE_CSS = `body { margin: 0; font-family: system-ui, sans-serif; background: #fff7ee; color: #3b2a24; }
.hero { padding: 64px 24px 56px; text-align: center; background: linear-gradient(135deg, #ffd3b3, #ffd9e6 60%, #e8dcff); }
.kicker { text-transform: uppercase; letter-spacing: 2px; font-size: 12px; font-weight: 700; color: #b0627a; }
h1 { font-size: 44px; margin: 6px 0 10px; }
.btn { display: inline-block; margin-top: 14px; background: #3b2a24; color: #fff7ee; padding: 12px 20px; border-radius: 999px; text-decoration: none; font-weight: 700; }
main { display: grid; gap: 16px; padding: 24px; max-width: 720px; margin: -30px auto 40px; }
.card { background: #fff; border-radius: 18px; padding: 18px 22px; box-shadow: 0 10px 30px rgba(176, 98, 122, .15); }
.cats { padding-left: 18px; line-height: 1.9; }
`;
  const DIFFS = {
    'index.html': 'diff --git a/index.html b/index.html\nnew file mode 100644\n--- /dev/null\n+++ b/index.html\n@@ -0,0 +1,36 @@\n' + CAFE_HTML.trimEnd().split('\n').map(l => '+' + l).join('\n'),
    'style.css': 'diff --git a/style.css b/style.css\nnew file mode 100644\n--- /dev/null\n+++ b/style.css\n@@ -0,0 +1,9 @@\n' + CAFE_CSS.trimEnd().split('\n').map(l => '+' + l).join('\n'),
  };

  let emit = null, toast = () => {};
  let seq = 0, sid = 'demo' + uid().slice(0, 4), mode = 'default', cps = [], files = [], busy = false, cost = 0, turn = 0;
  let waiter = null, stopFlag = false, autoplay = true, alwaysWrite = false, cssDone = false;

  const info = () => ({ id: sid, cwd: CWD, title: 'cat-cafe', mode, model: null, effort: null, claudeSessionId: 'demo-session', status: 'running',
    inTerminal: false, busy, checkpoints: cps, previewKey: 'demo', undo: { disabled: null } });
  const app = (type, extra = {}) => emit({ seq: ++seq, sid, kind: 'app', t: Date.now(), data: { type, ...extra, session: info() } });
  const cl = data => emit({ seq: ++seq, sid, kind: 'claude', t: Date.now(), data });

  const CAPS = {
    commands: [
      { name: 'compact', description: 'Shrink the conversation to free up memory' }, { name: 'init', description: 'Write a CLAUDE.md about this project' },
      { name: 'review', description: 'Review the latest changes' }, { name: 'cafe-menu', description: '(your skill) Write a café menu in house style' },
      { name: 'frontend-design', description: '(skill) Distinctive, polished web design' }],
    models: [
      { value: 'default', displayName: 'Opus 5.5 (default)', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'] },
      { value: 'sonnet', displayName: 'Sonnet 5.5', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high'] },
      { value: 'haiku', displayName: 'Haiku 5.5', supportsEffort: false }],
    account: { email: 'demo@example.com', subscriptionType: 'Demo (pretend)', apiProvider: 'firstParty' },
    claude_code_version: '2.1.319',
  };

  async function stream(text, parent = null) {
    const id = 'msg_' + uid();
    if (!parent) cl({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start', message: { id } } });
    const words = text.split(/(\s+)/);
    if (!parent) for (let i = 0; i < words.length; i += 2) {
      if (stopFlag) break;
      cl({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: words.slice(i, i + 2).join('') } } });
      await sleep(38);
    }
    cl({ type: 'assistant', parent_tool_use_id: parent, message: { id, role: 'assistant', content: [{ type: 'text', text }], usage: { input_tokens: 3000 + turn * 1500, cache_read_input_tokens: 22000 + turn * 9000, cache_creation_input_tokens: 900, output_tokens: 300 } } });
  }

  async function tool(name, input, { parent = null, ask = false, result = 'Done', after } = {}) {
    if (stopFlag) return false;
    const id = 'toolu_' + uid();
    cl({ type: 'assistant', parent_tool_use_id: parent, message: { id: 'msg_' + id, role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
    if (ask) {
      const requestId = 'req_' + uid();
      cl({ type: 'control_request', request_id: requestId, request: { subtype: 'can_use_tool', tool_name: name, input, tool_use_id: id, permission_suggestions: [{ type: 'addRules', rules: [{ toolName: name }], behavior: 'allow', destination: 'session' }] } });
      const ans = await new Promise(res => {
        waiter = { id: requestId, res };
        if (autoplay) setTimeout(() => { if (waiter && waiter.id === requestId) { toast('Demo: approved for you. In real use you choose.'); answer({ requestId, allow: true, always: name === 'Write' }); } }, 6500);
      });
      if (!ans.allow) { cl({ type: 'user', parent_tool_use_id: parent, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content: 'The user said no' }] } }); return false; }
      if (ans.always && name === 'Write') alwaysWrite = true;
    }
    await sleep(ask ? 500 : 700);
    if (after) after();
    cl({ type: 'user', parent_tool_use_id: parent, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: result }] } });
    await sleep(350);
    return true;
  }

  function answer(body) {
    if (!waiter || waiter.id !== body.requestId) return false;
    const w = waiter; waiter = null;
    app('permission_answered', { requestId: body.requestId, allow: !!body.allow });
    w.res(body);
    return true;
  }

  const todos = done => ({ todos: [
    ['Check what is in the folder', 'Checking the folder'], ['Research what cat café sites show', 'Researching cat café sites'],
    ['Build the home page', 'Building the home page'], ['Add warm, friendly styling', 'Adding styling']]
    .map(([content, activeForm], i) => ({ content, activeForm, status: i < done ? 'completed' : i === done ? 'in_progress' : 'pending' })) });

  function setFiles(list) { files = list; app('changes', { files }); }

  async function runTurn(text) {
    turn++; busy = true; stopFlag = false;
    cps.push({ id: uid(), label: text.slice(0, 80), commit: uid(), t: Date.now() });
    app('user_message', { text, files: [] });
    app('checkpoint');
    await sleep(700);
    cl({ type: 'system', subtype: 'status', status: 'requesting' });
    cl({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', utilization: 0.18 + turn * 0.05, resetsAt: Math.floor(Date.now() / 1000) + 3 * 3600 } });
    cl({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: 0.34 + turn * 0.02, resetsAt: Math.floor(Date.now() / 1000) + 4 * 86400 } });
    cl({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_start', index: 0, content_block: { type: 'thinking' } } });
    await sleep(1400);

    if (turn > 1) {
      await stream("Good idea! I'll add a booking button that scrolls to the opening hours, and make it bounce a little so people notice it.");
      await tool('Read', { file_path: CWD + '\\index.html' }, { result: '36 lines' });
      await tool('Edit', { file_path: CWD + '\\index.html', old_string: '<a class="btn" href="#book">Book a table</a>', new_string: '<a class="btn bounce" href="#book">Book a table</a>' },
        { ask: mode === 'default', after: () => setFiles([{ file: 'index.html', added: 1, removed: 1, status: 'M' }]) });
      await finish('Done! The booking button now has a gentle bounce. Check it in PREVIEW, and if you do not like it, Undo puts it back.');
      return;
    }

    await stream("Ooh, a cat café website! I'll make a cosy one-page site. Here's my game plan.");
    await tool('TodoWrite', todos(0), { result: 'Todos updated' });
    await tool('Glob', { pattern: '**/*' }, { result: 'No files found' });
    await tool('TodoWrite', todos(1), { result: 'Todos updated' });

    const agentId = 'toolu_agent' + uid();
    cl({ type: 'assistant', parent_tool_use_id: null, message: { id: 'msg_' + agentId, role: 'assistant', content: [{ type: 'tool_use', id: agentId, name: 'Agent', input: { description: 'Research cat café websites', prompt: 'What do cat café websites usually show?', subagent_type: 'general-purpose' } }] } });
    await sleep(900);
    await tool('WebSearch', { query: 'cat cafe website ideas' }, { parent: agentId, result: 'menus, cat profiles, booking' });
    await tool('WebFetch', { url: 'https://example.com/cat-cafes', prompt: 'What do they show?' }, { parent: agentId, result: 'Cat profiles and hours' });
    await stream('Most cat café sites show the cats by name, the opening hours and a booking button.', agentId);
    await sleep(500);
    cl({ type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: agentId, content: 'Cat profiles, hours and booking are the big three.' }] } });

    await tool('TodoWrite', todos(2), { result: 'Todos updated' });
    const ok1 = await tool('Write', { file_path: CWD + '\\index.html', content: CAFE_HTML }, { ask: mode === 'default' && !alwaysWrite, result: 'File created',
      after: () => setFiles([{ file: 'index.html', added: 36, removed: 0, status: 'A' }]) });
    if (!ok1) { await finish('No worries, I did not create anything. Tell me what you would like instead.'); return; }
    await tool('TodoWrite', todos(3), { result: 'Todos updated' });
    await tool('Write', { file_path: CWD + '\\style.css', content: CAFE_CSS }, { ask: mode === 'default' && !alwaysWrite, result: 'File created',
      after: () => { cssDone = true; setFiles([{ file: 'index.html', added: 36, removed: 0, status: 'A' }, { file: 'style.css', added: 9, removed: 0, status: 'A' }]); } });
    await tool('Bash', { command: 'dir /b', description: 'List the files in the project folder' }, { ask: mode !== 'bypassPermissions' && mode !== 'auto', result: 'index.html\nstyle.css' });
    await tool('TodoWrite', todos(4), { result: 'Todos updated' });
    await finish("Done! **Whisker & Bean** has a peachy header, the cat list, a menu and opening hours. Open **PREVIEW** on the right to see it. Want me to add a booking button next?");
  }

  async function finish(text) {
    await stream(text);
    cost += 0.12 + Math.random() * 0.1;
    busy = false;
    cl({ type: 'result', subtype: 'success', is_error: false, num_turns: 7, duration_ms: 24000 + Math.round(Math.random() * 9000), total_cost_usd: Number(cost.toFixed(4)), result: text });
    app('idle');
    autoplay = false;
  }

  async function typeInto(text) {
    const p = document.getElementById('prompt');
    if (!p || p.value) return false;
    for (const ch of text) { if (!autoplay) return false; p.value += ch; p.dispatchEvent(new Event('input')); await sleep(42); }
    await sleep(500);
    if (!autoplay) return false;
    document.getElementById('composer').requestSubmit();
    return true;
  }

  const Demo = {
    start(onEvent, helpers = {}) {
      emit = onEvent; toast = helpers.toast || toast;
      emit({ seq: 0, kind: 'hello', data: { replayed: 0 } });
      setTimeout(() => {
        app('started'); app('capabilities', { data: CAPS });
        cl({ type: 'system', subtype: 'init', cwd: CWD, session_id: 'demo-session', model: 'claude-opus-5-5', permissionMode: mode });
        cl({ type: 'autocompact_state', value: { enabled: true, effective_window: 980000 } });
      }, 300);
      const stopAuto = () => { autoplay = false; };
      ['keydown', 'pointerdown'].forEach(ev => document.getElementById('prompt').addEventListener(ev, stopAuto, { once: true }));
      setTimeout(() => { if (autoplay) typeInto('Make me a website for my cat café 🐱'); }, 2600);
    },

    async api(path, body = {}) {
      await sleep(80);
      if (path === '/api/info') return { claudeFound: true, recentProjects: [CWD, 'C:\\Users\\you\\Documents\\budget-tracker'], sessions: [info()] };
      if (path === '/api/pick-folder') return { folder: CWD };
      if (path === '/api/make-folder') return { folder: 'C:\\Users\\you\\Byte Runner Projects\\' + (body.name || 'my-project') };
      if (path === '/api/login') return { ok: true };
      if (path === '/api/session/start') {
        if (body.mode) mode = body.mode;
        setTimeout(() => { app('started'); app('capabilities', { data: CAPS }); }, 50);
        return { session: info() };
      }
      const m = path.match(/^\/api\/session\/[^/]+\/([a-z-]+)$/);
      const action = m && m[1];
      if (action === 'send') {
        if (busy) { toast('Demo: Claude is busy. In the real app your message would queue up.'); return { ok: true }; }
        runTurn(String(body.text || 'Make it nicer'));
        return { ok: true };
      }
      if (action === 'permission') return { ok: answer(body) };
      if (action === 'interrupt') { stopFlag = true; if (waiter) answer({ requestId: waiter.id, allow: false }); return { ok: true }; }
      if (action === 'mode') { mode = body.mode; app('settings'); return { ok: true }; }
      if (action === 'model') { app('settings'); return { ok: true }; }
      if (action === 'diff') return { diff: DIFFS[body.file] || '(no changes)' };
      if (action === 'undo') {
        const cp = cps.find(c => c.id === body.checkpoint);
        cps = cps.filter(c => c.t < (cp ? cp.t : 0));
        files = []; cssDone = false; turn = 0; alwaysWrite = false;
        app('undone', { label: cp ? cp.label : 'that' }); app('changes', { files: [] });
        return { ok: true };
      }
      if (action === 'terminal') { toast('In the real app this opens Windows Terminal with this exact chat, so you can keep going in the CLI.', 'ok'); return { ok: true }; }
      if (action === 'reclaim') return { ok: true };
      if (action === 'open-folder') { toast('In the real app this opens the folder in File Explorer.'); return { ok: true }; }
      if (action === 'close') { toast('Demo: closing is turned off so the demo keeps working.'); return { ok: false }; }
      return { ok: true };
    },

    previewHtml(file) {
      if (!/index\.html?$/.test(file)) return '<p style="font-family:system-ui;padding:20px">Nothing to show</p>';
      const css = cssDone ? `<style>${CAFE_CSS}</style>` : '';
      return CAFE_HTML.replace('<link rel="stylesheet" href="style.css">', css);
    },
  };

  window.ByteDemo = Demo;
})();
