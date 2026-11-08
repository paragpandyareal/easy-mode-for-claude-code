/* =========================================================
   EASY MODE · app (v0.2)
   Turns Claude Code's stream of events into a friendly game screen:
   a session board, widgets you can arrange, alerts for every project,
   and two skins (Arcade Dusk and Good Boy Club).
   ========================================================= */
(function () {
  'use strict';

  /* ---------------- small helpers ---------------- */
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const base = p => String(p || '').split(/[\\/]/).filter(Boolean).pop() || String(p || '');
  const money = n => '$' + (Number(n) || 0).toFixed(2);
  const clock = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's' : Math.floor(s / 3600) + 'h ' + String(Math.floor(s / 60) % 60).padStart(2, '0') + 'm'; };
  const ago = t => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + ' min ago' : new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
  const kfmt = n => { n = Math.round(n || 0); return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k' : String(n); };
  const cap = t => String(t || '').replace(/^\w/, c => c.toUpperCase());
  const lowerFirst = s => s ? s[0].toLowerCase() + s.slice(1) : s;
  const store = { get(k, d) { try { const v = localStorage.getItem('br.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('br.' + k, JSON.stringify(v)); } catch { /* */ } } };

  const TOKEN = ($('meta[name=br-token]') || {}).content || '';
  const DEMO = !TOKEN || TOKEN.startsWith('__') || location.protocol === 'file:' || !!window.BR_FORCE_DEMO;
  let PREVIEW_ORIGIN = '';
  const { World, paintBot } = window.ByteWorld;
  const { SKINS, SOUNDS, unlockAudio, audioReady } = window.ByteSkins;
  const Demo = window.ByteDemo;

  /* ---------------- skins and words ---------------- */
  let skin = SKINS[document.documentElement.dataset.skin] || SKINS.arcade;
  const L = k => { const v = skin.L[k]; return Array.isArray(v) ? v[0] : (v ?? k); };
  const Lsub = k => { const v = skin.L[k]; return Array.isArray(v) ? v[1] : ''; };
  function applySkin(id, save = true) {
    if (save) store.set('skin', id);
    const pick = id === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'arcade' : 'goodboy') : id;
    skin = SKINS[pick] || SKINS.arcade;
    document.documentElement.dataset.skin = skin.id;
    $$('[data-l]').forEach(el => { el.textContent = L(el.dataset.l); });
    $('#sendBtn').textContent = L('send'); $('#stopBtn').textContent = L('stop');
    World.setSkin(skin.world);
    paintLogo();
    reskinFeeds();
    buildColumns();
    renderAll();
  }
  // Good Boy Club uses the owner's Winston art; Arcade uses pixel Bit.
  const faceImg = new Image(); faceImg.src = (window.BR_ART && window.BR_ART.w_front) || ((window.BR_ART_BASE || '/static/art/') + 'w_front.png');
  function paintAvatar(c, blink) {
    if (skin.id !== 'goodboy') return paintBot(c, blink);
    const draw = () => { c.width = 64; c.height = 64; const g = c.getContext('2d'); g.clearRect(0, 0, 64, 64); const k = Math.min(64 / faceImg.width, 64 / faceImg.height); const w = faceImg.width * k, hh = faceImg.height * k; g.drawImage(faceImg, (64 - w) / 2, (64 - hh) / 2 + (blink ? 1 : 0), w, hh); };
    if (faceImg.complete && faceImg.width) draw(); else faceImg.addEventListener('load', draw, { once: true });
  }
  function paintLogo() { paintAvatar($('#logoBot')); }

  /* ---------------- sound and alerts ---------------- */
  const Sound = {
    mode: store.get('alerts', 'alerts'), // alerts | all | off
    play(kind) {
      if (this.mode === 'off' || !live) return;
      if (this.mode === 'alerts' && !['wait', 'done', 'error'].includes(kind)) return;
      try { (SOUNDS[skin.id] || SOUNDS.arcade)[kind](); } catch { /* */ }
    },
  };

  /* ---------------- API ---------------- */
  async function api(path, body) {
    if (DEMO) return Demo.api(path, body);
    let r;
    try {
      r = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'x-br-token': TOKEN, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch { return { error: 'Easy Mode is not running. Start it again from the desktop shortcut.' }; }
    let j = {}; try { j = await r.json(); } catch { /* */ }
    if (r.status === 403 && j.error === 'Not allowed') { location.reload(); return { error: 'Reconnecting…' }; }
    if (r.status === 404 && j.error === 'Session not found') { resync(true); return { error: 'That chat had ended, so I tidied it away. Start a new one or press Continue.' }; }
    if (!r.ok && !j.error) j.error = 'Something went wrong (' + r.status + ')';
    return j;
  }
  async function resync(quiet) {
    if (DEMO) return;
    let info; try { info = await (await fetch('/api/info', { headers: { 'x-br-token': TOKEN } })).json(); } catch { return; }
    if (!info || !Array.isArray(info.sessions)) return;
    const real = new Set(info.sessions.map(x => x.id)); let gone = 0;
    for (const id of [...sessions.keys()]) if (!real.has(id)) { sessions.delete(id); gone++; }
    if (gone || (activeId && !sessions.has(activeId))) setActive(sessions.keys().next().value || null);
    if (gone && !quiet) toast('Some chats had ended, so I tidied them away.');
  }
  let downSince = 0, appVersion = '';
  setInterval(async () => { if (DEMO || !downSince) return; try { const r = await fetch('/api/info', { headers: { 'x-br-token': TOKEN } }); if (r.status === 403) location.reload(); } catch { /* still down */ } }, 3000);

  /* ---------------- tool vocabulary ---------------- */
  const GEM = {
    read: ['#82c8ff', 'READ', 'Reading files'], make: ['#7ee8c8', 'MAKE', 'Writing files'], edit: ['#ffb68e', 'EDIT', 'Changing files'], run: ['#ffe08a', 'RUN', 'Running commands'],
    find: ['#b8a2ff', 'FIND', 'Searching'], web: ['#ff92b4', 'WEB', 'Using the web'], help: ['#82c8ff', 'HELP', 'Helpers'], app: ['#9fe3ff', 'APP', 'Skills and apps'], plan: ['#ffe08a', 'PLAN', 'Planning'], misc: ['#c9c0ef', 'USE', 'Other tools'],
  };
  const hostOf = u => { try { return new URL(u).host; } catch { return u; } };
  function describeTool(name, input = {}) {
    const f = input.file_path || input.notebook_path || input.path;
    switch (name) {
      case 'Read': return { kind: 'read', text: `Reading ${base(f)}`, item: 'Read ' + base(f) };
      case 'Write': return { kind: 'make', text: `Creating ${base(f)}`, item: 'Write ' + base(f) };
      case 'Edit': case 'MultiEdit': return { kind: 'edit', text: `Changing ${base(f)}`, item: 'Edit ' + base(f) };
      case 'NotebookEdit': return { kind: 'edit', text: `Changing the notebook ${base(f)}`, item: 'Edit ' + base(f) };
      case 'Bash': case 'PowerShell': return { kind: 'run', text: input.description || 'Running a command', item: 'Command: ' + String(input.command || '').slice(0, 40) };
      case 'Glob': return { kind: 'find', text: `Looking for files (${input.pattern || 'everything'})`, item: 'Find ' + (input.pattern || '') };
      case 'Grep': return { kind: 'find', text: `Searching inside files for “${input.pattern || ''}”`, item: 'Search ' + (input.pattern || '') };
      case 'LS': return { kind: 'find', text: 'Looking around the folder', item: 'List folder' };
      case 'WebSearch': return { kind: 'web', text: `Searching the web for “${input.query || ''}”`, item: 'Web search' };
      case 'WebFetch': return { kind: 'web', text: `Reading a web page on ${hostOf(input.url)}`, item: 'Web page ' + hostOf(input.url) };
      case 'TodoWrite': case 'TaskUpdate': return { kind: 'plan', text: 'Updated the to-do list', item: 'To-do list' };
      case 'TaskCreate': return { kind: 'plan', text: `New task: ${input.subject || ''}`, item: 'To-do list' };
      case 'EnterPlanMode': return { kind: 'plan', text: 'Switching to planning', item: 'Planning' };
      case 'Skill': return { kind: 'app', text: `Using the ${input.skill || input.name || input.command || ''} skill`, item: 'Skill ' + (input.skill || input.name || input.command || '') };
      case 'Agent': case 'Task': return { kind: 'help', text: `Sending a ${L('helperWord')} to ${lowerFirst(input.description || 'help out')}`, item: 'Helper ' + (input.description || '') };
      default:
        if (name.startsWith('mcp__')) { const [, srv, tool] = name.split('__'); return { kind: 'app', text: `Using ${srv}: ${String(tool || '').replace(/_/g, ' ')}`, item: 'App ' + srv }; }
        return { kind: 'misc', text: `Using ${name}`, item: name };
    }
  }
  function toolDetail(name, input = {}) {
    if (name === 'Bash' || name === 'PowerShell') return input.command || '';
    if (name === 'Write') return (input.file_path || '') + '\n\n' + String(input.content || '').split('\n').slice(0, 60).join('\n');
    if (name === 'Edit') return (input.file_path || '') + '\n\n- ' + String(input.old_string || '').split('\n').join('\n- ') + '\n+ ' + String(input.new_string || '').split('\n').join('\n+ ');
    try { return JSON.stringify(input, null, 2); } catch { return String(input); }
  }
  function riskOf(name, input = {}, cwd = '') {
    const cmd = String(input.command || ''), f = String(input.file_path || input.notebook_path || ''), out = [];
    if (/(^|[\s;&|(])(rm|rmdir|del|erase|rd|Remove-Item|shred|format|mkfs|dd)\b|--force|\s-rf?\b|git\s+(reset|clean|push\s+-f)/i.test(cmd)) out.push(['w-red', 'This deletes or overwrites things. Make sure it is what you want.']);
    else if (/(curl|wget|Invoke-WebRequest|iwr|npm|npx|pnpm|yarn|pip|winget|choco|brew|apt|git\s+clone)/i.test(cmd)) out.push(['w-amber', 'This downloads or installs something from the internet.']);
    if (/\b(sudo|runas|Set-ExecutionPolicy|reg\s+add|setx)\b/i.test(cmd)) out.push(['w-red', 'This changes system settings.']);
    if (f && cwd && !isInside(cwd, f)) out.push(['w-red', 'This is outside your project folder.']);
    return out;
  }
  function isInside(b, p) { const n = s => String(s).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase(); const B = n(b), q = n(p); if (!/^([a-z]:)?\//i.test(q)) return true; return q === B || q.startsWith(B + '/'); }
  const breedFor = (type = '', desc = '') => { const t = (type + ' ' + desc).toLowerCase(); return /explore|search|find|look/.test(t) ? 'pip' : /web|research|read/.test(t) ? 'mochi' : /plan|design|architect/.test(t) ? 'biscuit' : /review|check|test|verify/.test(t) ? 'luna' : /bash|build|command|run|fix/.test(t) ? 'pepper' : 'tofu'; };
  const BREED_NAME = { pip: 'Pip', mochi: 'Mochi', biscuit: 'Biscuit', pepper: 'Pepper', luna: 'Luna', tofu: 'Tofu' };
  const ART = name => (window.BR_ART && window.BR_ART[name]) || ((window.BR_ART_BASE || '/static/art/') + name + '.png');

  // Things that look like passwords or keys. Never offer to save these in an "always allow" rule.
  const SECRET_RE = [/(pass(word)?|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|bearer|authorization)["']?\s*[=: ]\s*["']?[^\s"']{6,}/i,
    /\bsk[-_](live|test|proj|ant)?[-_]?[A-Za-z0-9]{12,}/, /AKIA[0-9A-Z]{16}/, /\bgh[pousr]_[A-Za-z0-9]{20,}/, /github_pat_[A-Za-z0-9_]{20,}/, /\bxox[abposr]-[A-Za-z0-9-]{10,}/,
    /:\/\/[^\s/:@]+:[^\s/@]+@/, /\s-p\S{4,}/, /\bcurl\b[^\n]*\s-u\s*\S+:\S+/i, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];

  /* ---------------- markdown (small and safe) ---------------- */
  function md(src) {
    const blocks = [];
    let s = String(src || '').replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, l, code) => { blocks.push(code.replace(/\n$/, '')); return `\u0000${blocks.length - 1}\u0000`; });
    s = esc(s);
    const inline = t => t.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?]|$)/g, '$1<em>$2</em>').replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    const lines = s.split('\n');
    let html = '', list = null, para = [], i = 0;
    const flushP = () => { if (para.length) { html += `<p>${inline(para.join('<br>'))}</p>`; para = []; } };
    const flushL = () => { if (list) { html += `<${list.t}>${list.items.map(x => `<li>${inline(x)}</li>`).join('')}</${list.t}>`; list = null; } };
    const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        flushP(); flushL();
        const head = cells(line); i += 2; const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
        i--;
        html += `<table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
        continue;
      }
      const code = line.match(/^\u0000(\d+)\u0000$/), hd = line.match(/^(#{1,4})\s+(.*)$/), ul = line.match(/^\s*[-*•]\s+(.*)$/), ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (code) { flushP(); flushL(); html += `<pre><code>${esc(blocks[+code[1]])}</code></pre>`; }
      else if (hd) { flushP(); flushL(); html += `<h3>${inline(hd[2])}</h3>`; }
      else if (ul || ol) { flushP(); const t = ul ? 'ul' : 'ol'; if (!list || list.t !== t) { flushL(); list = { t, items: [] }; } list.items.push((ul || ol)[1]); }
      else if (!line.trim()) { flushP(); flushL(); }
      else { flushL(); para.push(line); }
    }
    flushP(); flushL();
    return html.replace(/\u0000(\d+)\u0000/g, (_, k) => `<pre><code>${esc(blocks[+k])}</code></pre>`);
  }

  /* ---------------- session state ---------------- */
  const sessions = new Map();
  const closedIds = new Set(); // chats closed while this page was open: ignore any late news about them
  let activeId = null, lastSeq = 0, live = DEMO;
  const imgCache = new Map();
  const S = id => sessions.get(id);
  function ensure(id, info) {
    let s = sessions.get(id);
    if (!s) {
      s = {
        id, info: info || { id, title: 'Project', cwd: '', checkpoints: [], mode: 'default' },
        feed: h('div', { class: 'session-feed' }), live: null, liveMsg: null, tools: new Map(), groups: new Map(), cards: new Map(),
        todos: [], tasks: [], files: [], selFile: null, agents: new Map(), tally: {}, ctxUsed: 0, ctxWin: 200000, ctxBase: 0, ctxHist: [],
        cost: 0, costBase: 0, costRaw: 0, rate: {}, caps: null, init: null, busy: false, waiting: 0, turnStart: 0, turnGems: 0, turnCostStart: 0, turnTools: 0, turnDenied: 0,
        say: '', stage: 'READY', alert: null, welcomed: false, loginShown: false, previewPath: '', thinkingEl: null, thinkChars: 0,
        msgSeen: new Set(), touched: [], existing: [], tk: { fresh: 0, cacheRead: 0, cacheWrite: 0, out: 0 }, areas: {}, items: {}, skillsUsed: {}, skillsActive: new Set(),
        turns: 0, playMs: 0, clears: 0, redo: false, lastTool: null, created: Date.now(), env: null, slText: null, hookLog: [], history: [], turnLabel: '', lastMsgAt: 0,
      };
      sessions.set(id, s);
      if (!activeId) setActive(id);
    }
    if (info) s.info = info;
    return s;
  }
  // One clear state per project, used by the board, the stage and the alerts.
  function stateOf(s) {
    if (!s) return 'none';
    if (s.info.inTerminal) return 'terminal';
    if (s.stage === 'NEED LOGIN') return 'login';
    if (s.waiting) return 'needs';
    if (s.busy) return 'working';
    if (s.alert === 'error') return 'error';
    if (s.alert === 'done') return 'done';
    if (s.alert === 'partial') return 'partial';
    return 'ready';
  }
  // The words shown on the board card and the scene chip for each state.
  function stateLabel(s) {
    const st = stateOf(s);
    return { ready: L('ready'), working: L('working1') + ' · ' + clock(Date.now() - s.turnStart), needs: '! ' + L('needs'), done: '★ ' + L('done'), partial: L('yourTurn'), error: L('error'), login: L('login'), terminal: 'IN TERMINAL', none: L('ready') }[st];
  }
  function setActive(id) {
    activeId = id;
    const s = S(id), feed = $('#feed');
    feed.innerHTML = '';
    if (s) {
      if (s.alert && stateOf(s) !== 'needs') s.alert = null; // looking at it counts as seen
      if (!s.welcomed && !s.feed.childElementCount) { s.welcomed = true; s.feed.append(welcomeEl()); }
      feed.append(s.feed);
      World.clearHelpers();
      for (const a of s.agents.values()) if (a.status === 'working') World.drone(a.id, { breed: a.breed });
    } else feed.append(noSessionEl());
    renderAll(); scrollFeed(true); updateAttention();
  }
  function renderAll() {
    renderBoard(); renderWidgets(); renderStatus(); renderComposer(); renderWorld(); renderNeedsBar();
    const s = S(activeId);
    $('#termBanner').classList.toggle('hidden', !(s && s.info.inTerminal));
    $('#composer').classList.toggle('paused', !!(s && s.info.inTerminal));
    $('#redoBtn').classList.toggle('hidden', !(s && s.redo));
  }

  /* ---------------- alerts: done, needs you, error (for every project) ---------------- */
  let notifyOK = typeof Notification !== 'undefined' && Notification.permission === 'granted';
  function notify(s, kind, text) {
    if (kind !== 'needs') s.alert = kind;
    if (!live) { updateAttention(); return; } // catching up after a reload: no sounds or pop-ups
    Sound.play(kind === 'needs' ? 'wait' : kind === 'partial' ? 'done' : kind);
    const name = s.info.title || base(s.info.cwd);
    const away = document.hidden || s.id !== activeId;
    const msg = kind === 'needs' ? `${name} needs you${text ? ': ' + text : ''}` : kind === 'partial' ? `${name} stopped where you said no` : kind === 'done' ? `${name} is done${text ? ': ' + text : ''}` : `${name} hit a problem`;
    if (s.id !== activeId) toast(msg, kind === 'needs' ? 'needs' : kind === 'error' ? 'err' : 'done', { label: 'Jump to it', fn: () => { setActive(s.id); focusNeeds(); } }, kind === 'needs' ? 9000 : 6000);
    if (document.hidden && notifyOK) {
      try { const n = new Notification(kind === 'needs' ? '🔔 ' + L('needs') : kind === 'done' ? '✅ ' + L('done') : '⚠ ' + L('error'), { body: msg, tag: 'br-' + s.id + '-' + kind, silent: true }); n.onclick = () => { window.focus(); setActive(s.id); n.close(); }; } catch { /* */ }
    }
    updateAttention();
    if (!away && kind === 'done') setTimeout(() => { if (s.alert === 'done' && s.id === activeId && !document.hidden) { s.alert = null; renderBoard(); } }, 8000);
  }
  // Tab title, favicon badge and title flash reflect everything that needs you.
  const FAV0 = $('#favicon').href;
  function updateAttention() {
    const needs = [...sessions.values()].filter(s => stateOf(s) === 'needs');
    const done = [...sessions.values()].filter(s => s.alert === 'done' && (s.id !== activeId || document.hidden));
    const n = needs.length + done.length;
    const first = needs[0] || done[0];
    document.title = n ? `(${n}) ${first.info.title || 'Claude'} ${needs.length ? 'needs you' : 'is done'} · Easy Mode` : 'Easy Mode for Claude Code';
    const c = document.createElement('canvas'); c.width = 32; c.height = 32; const g = c.getContext('2d');
    const img = new Image();
    img.onload = () => { g.drawImage(img, 0, 0, 32, 32); if (n) { g.fillStyle = needs.length ? '#ffd23f' : '#34b37a'; g.beginPath(); g.arc(23, 9, 9, 0, 7); g.fill(); g.fillStyle = '#2b1d33'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.fillText(n > 9 ? '9+' : String(n), 23, 14); } $('#favicon').href = c.toDataURL(); };
    img.src = FAV0;
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { const s = S(activeId); if (s && s.alert === 'done') s.alert = null; renderBoard(); updateAttention(); } });

  /* ---------------- feed helpers ---------------- */
  function scrollFeed(force) {
    const feed = $('#feed');
    if (matchMedia('(max-width: 820px)').matches) { if (!force) { const near = innerHeight + scrollY > document.body.scrollHeight - 500; if (near) scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); } return; }
    const near = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 260;
    if (force || near) requestAnimationFrame(() => { feed.scrollTop = feed.scrollHeight; });
  }
  function add(s, el) { const w = s.feed.querySelector('.welcome'); if (w) w.remove(); s.feed.append(el); if (s.id === activeId) scrollFeed(); return el; }
  function avatar() { const c = h('canvas'); paintAvatar(c); return h('div', { class: 'avatar' }, c); }
  function claudeBubble(s, text, isLive) {
    const copy = h('button', { class: 'copy', type: 'button', title: 'Copy this reply' }, '⧉ Copy');
    const b = h('div', { class: 'bubble' + (isLive ? ' live' : '') }, h('span', { class: 'who' }, W8.claudeWho(), copy), h('div', { class: 'md' }));
    b._text = text;
    copy.addEventListener('click', () => { navigator.clipboard.writeText(b._text || '').then(() => toast('Copied', 'ok')); });
    b.querySelector('.md').innerHTML = md(text);
    add(s, h('div', { class: 'msg msg-claude' }, avatar(), b));
    return b;
  }
  function setBubble(b, text, isLive) { b._text = text; b.querySelector('.md').innerHTML = md(text); b.classList.toggle('live', !!isLive); }
  const W8 = {
    claudeWho: () => skin.id === 'goodboy' ? 'Winston says' : 'CLAUDE',
    userWho: () => skin.id === 'goodboy' ? 'You said' : 'PLAYER 1 SAYS',
    clear: k => k === 'partial' ? (skin.id === 'goodboy' ? 'Stopped where you said “leave it”' : 'STOPPED WHERE YOU SAID NO') : k === 'soft' ? L('answered') : k === 'fail' ? 'TRY AGAIN' : L('levelClear'),
    gems: n => (skin.id === 'goodboy' ? '🦴 ' : '💎 ') + n + ' ' + L('gems'),
    helper: (breed, desc) => (skin.id === 'goodboy' ? BREED_NAME[breed] + ': ' : 'Helper: ') + desc,
  };
  // Re-word and re-draw everything already in the chats after the theme changes.
  function reskinFeeds() {
    for (const x of sessions.values()) {
      const f = x.feed;
      // the speech bubble: swap the other theme's stock lines for this one's
      for (const k of ['doneSay', 'waitSay', 'hello']) for (const sk of Object.values(SKINS)) { const v = [].concat(sk.L[k])[0]; if (v && x.say && sk !== skin && x.say.startsWith(v)) x.say = L(k) + x.say.slice(v.length); }
      f.querySelectorAll('.msg-claude .who').forEach(el => { el.firstChild.textContent = W8.claudeWho(); });
      f.querySelectorAll('.msg-user .who').forEach(el => { el.textContent = W8.userWho(); });
      f.querySelectorAll('.avatar canvas').forEach(c => paintAvatar(c));
      f.querySelectorAll('.level-clear[data-kind] .lc-title').forEach(el => { el.textContent = W8.clear(el.parentElement.dataset.kind); });
      f.querySelectorAll('.lc-gems').forEach(el => { el.textContent = W8.gems(el.dataset.n); });
      f.querySelectorAll('.helper-head[data-breed]').forEach(el => {
        const ico = el.firstChild, b = el.dataset.breed;
        ico.replaceWith(skin.id === 'goodboy' ? h('img', { src: ART('p_' + b + '_walk'), alt: '', style: { height: '22px' } }) : h('span', {}, '🛸'));
        el.children[1].textContent = W8.helper(b, el.dataset.desc);
      });
      const w = f.querySelector('.welcome'); if (w) w.replaceWith(welcomeEl());
    }
  }
  function sysNote(s, text) { add(s, h('div', { class: 'sys-note' }, text)); }

  const ROLES = {
    cafe: ['☕ Café or shop', [
      ['🌐', 'Website for my business', 'Menu, photos, opening hours.', 'Make me a simple website for my café with a menu, a few photos and our opening hours. Keep it to plain HTML and CSS so it is easy to change.', '#7ee8c8'],
      ['📅', 'Weekly staff roster', 'A roster that opens in Excel.', 'Make a weekly staff roster as a CSV file I can open in Excel. Columns for each day, rows for each person, and a total hours column.', '#ffe08a'],
      ['📸', 'Instagram captions', 'Five posts for this week.', 'Write five friendly Instagram captions for my café this week, with emojis and three hashtags each. Save them in captions.md.', '#ff92b4'],
      ['🧾', 'Price list', 'A tidy, printable price list.', 'Make a printable one-page price list as an HTML page, with sections, prices and a cosy look.', '#ffb68e']]],
    office: ['💼 Office work', [
      ['🧪', 'Clickable prototype', 'A demo screen for stakeholders.', 'Build a clickable prototype of a simple dashboard for a stakeholder demo, as one HTML file. Use realistic fake data and make the buttons do something.', '#82c8ff'],
      ['📊', 'Clean a spreadsheet', 'Tidy a CSV and chart it.', 'I will drop a CSV file in. Clean it up (fix dates, remove duplicates, trim spaces), save cleaned.csv, then make a simple chart page from it.', '#ffe08a'],
      ['📝', 'Draft a one-pager', 'A PRD or proposal.', 'Draft a one-page product proposal in proposal.md with problem, goals, users, scope and success measures. Ask me three questions first.', '#b8a2ff'],
      ['🗒', 'Summarise notes', 'Turn notes into actions.', 'I will paste meeting notes. Summarise them into decisions, action items with owners, and open questions, and save it as summary.md.', '#7ee8c8']]],
    study: ['🎓 Study', [
      ['📚', 'Study guide', 'From my notes to a guide.', 'Turn the notes in this folder into a clear study guide with key ideas, examples and ten practice questions. Save it as study-guide.md.', '#b8a2ff'],
      ['🎮', 'Make a little game', 'Something fun to play.', 'Make a fun little browser game I can play with the arrow keys. Bright colours, a score, and a restart button.', '#ff92b4'],
      ['📈', 'Budget tracker', 'Money in, money out.', 'Make a simple budget tracker I can open in my browser. Keep everything in one HTML file and save my entries in the browser.', '#ffe08a'],
      ['🔍', 'Explain this folder', 'In plain English.', "Explain what's in this folder in plain English, like I'm new to coding. Then suggest three things we could improve.", '#82c8ff']]],
    code: ['🛠 Coding', [
      ['🧭', 'Map this codebase', 'Structure, entry points, risks.', 'Give me a map of this codebase: main parts, entry points, how data flows, and the three riskiest areas. Keep it under 40 lines.', '#82c8ff'],
      ['🧪', 'Add tests', 'For the most important code.', 'Find the most important untested code here and add focused tests for it. Run them and tell me the result.', '#7ee8c8'],
      ['🐛', 'Find a bug', 'Hunt the likeliest bug.', 'Look for the most likely real bug in this project, explain it, and propose a fix. Do not change anything until I say yes.', '#ff8a80'],
      ['🧹', 'Tidy and simplify', 'Small, safe clean-ups.', 'Suggest five small, safe clean-ups that make this code simpler. Show me the plan before changing anything.', '#ffb68e']]],
  };
  function welcomeEl() {
    let role = store.get('role', 'cafe');
    const grid = h('div', { class: 'starters' });
    const pick = h('div', { class: 'role-pick' });
    const draw = () => {
      pick.innerHTML = ''; grid.innerHTML = '';
      for (const [k, [label]] of Object.entries(ROLES)) pick.append(h('button', { type: 'button', class: k === role ? 'on' : '', onclick: () => { role = k; store.set('role', k); draw(); } }, label));
      grid.append(h('button', { class: 'starter', style: { '--sc': '#ffe08a' }, type: 'button', onclick: () => openModal('#teachModal') }, h('span', { class: 's-ico' }, '📝'), h('b', {}, 'Teach Claude about you'), h('small', {}, 'Notes Claude reads every time, so it gets you.')));
      for (const [ico, t, d, prompt, col] of ROLES[role][1]) grid.append(h('button', { class: 'starter', style: { '--sc': col }, type: 'button', onclick: () => fillPrompt(prompt) }, h('span', { class: 's-ico' }, ico), h('b', {}, t), h('small', {}, d)));
    };
    draw();
    return h('div', { class: 'welcome' }, h('h1', {}, skin.id === 'goodboy' ? 'WHAT SHALL WE FETCH?' : 'WHAT SHALL WE MAKE?'),
      h('p', {}, 'Pick what you do, then a starter, or type your own idea below. Claude does the work, you stay in charge, and Undo is always one click away.'), pick, grid);
  }
  function noSessionEl() {
    return h('div', { class: 'welcome' }, h('h1', {}, L('start')),
      h('p', {}, 'Pick a folder for Claude to work in. It can only change things inside it, and every step can be undone.'),
      h('button', { class: 'btn btn-go big-cta', type: 'button', onclick: () => openNew() }, L('startCta')));
  }
  function fillPrompt(text) { const p = $('#prompt'); p.value = text; autosize(); p.focus(); p.setSelectionRange(text.length, text.length); }

  /* ---------------- event handling ---------------- */
  let evT = 0; // when the event really happened (replays keep their own time)
  const now = () => evT || Date.now();
  function onEvent(ev) {
    evT = ev.t || 0;
    if (ev.kind === 'hello') { if (ev.data && ev.seq < lastSeq) { location.reload(); return; } live = true; setConn('on'); if (!sessions.size) setActive(null); resync(true); return; }
    if (ev.seq && ev.seq <= lastSeq) return;
    if (ev.seq) lastSeq = ev.seq;
    const d = ev.data || {};
    if (ev.sid && closedIds.has(ev.sid)) return;
    if (ev.kind === 'app') return onApp(ev.sid, d);
    if (ev.kind === 'claude') return onClaude(ensure(ev.sid), d);
  }

  function onApp(sid, d) {
    if (d.type === 'closed') { closedIds.add(sid); sessions.delete(sid); if (activeId === sid) setActive(sessions.keys().next().value || null); else renderBoard(); updateAttention(); return; }
    const s = ensure(sid, d.session);
    switch (d.type) {
      case 'started': s.stage = 'READY'; s.costBase += s.costRaw; s.costRaw = 0; break;
      case 'capabilities': s.caps = d.data || {}; loadEnv(s, true); loadExisting(s); break;
      case 'user_message': {
        const files = d.files || [];
        const att = files.length ? h('div', { class: 'att' }, ...files.map(f => imgCache.get(f.name) ? h('img', { src: imgCache.get(f.name), alt: f.name }) : h('span', {}, '📄 ' + f.name))) : null;
        add(s, h('div', { class: 'msg msg-user' }, h('span', { class: 'who' }, W8.userWho()), h('div', { class: 'say-box' }, d.text, att)));
        s.turnLabel = (d.text || 'Attachment').replace(/\s+/g, ' ').slice(0, 80); startTurn(s); break;
      }
      case 'idle': s.busy = false; break;
      case 'changes': {
        s.files = d.files || [];
        const lf = s.lastClear && !s.busy && s.lastClear.querySelector('.lc-files');
        if (lf) { const n = s.files.length; lf.textContent = n ? '📄 ' + n + ' file' + (n > 1 ? 's' : '') + ' changed' : ''; }
        onChanges(s); break;
      }
      case 'undone':
        s.files = []; s.selFile = null; s.previewPath = ''; s.todos = []; s.tasks = []; s.touched = []; s.redo = !!d.redo; loadExisting(s);
        sysNote(s, `↶ Undone. Your files are back to how they were before “${d.label}”.`);
        toast('Undone! Your files are back.', 'ok', s.redo ? { label: '↷ Redo', fn: () => redo() } : null); break;
      case 'redone': s.redo = false; sysNote(s, '↷ Redone. Claude’s changes are back.'); toast('Redone.', 'ok'); loadExisting(s); setTimeout(() => loadPreview(), 500); break;
      case 'terminal': toast('Opened in your terminal. Press “Bring it back here” when you are done.', 'ok'); break;
      case 'reclaimed': sysNote(s, 'Welcome back. This chat is running here again.'); break;
      case 'permission_answered': { const c = s.cards.get(d.requestId); if (c) markAnswered(c, d.allow); setTimeout(() => renderWidgets(['inbox']), 0); s.waiting = Math.max(0, s.waiting - 1); if (!d.allow) s.turnDenied++; if (!s.waiting && s.busy) s.stage = 'WORKING'; updateAttention(); break; }
      case 'exit':
        if (d.claudeMissing) { showSetup('missing'); break; }
        if (!s.info.inTerminal && d.code && d.code !== 0) {
          s.busy = false; s.waiting = 0;
          add(s, errorCard('Claude Code stopped', (d.stderr || '').trim().split('\n').slice(-4).join('\n') || 'It closed unexpectedly.', [['Restart it', 'btn-mint', () => api(`/api/session/${s.id}/reclaim`, {})]]));
          notify(s, 'error');
        }
        break;
      case 'error':
        if (d.code === 'claude_missing') { showSetup('missing'); break; }
        s.busy = false; add(s, errorCard('Something went wrong', d.message || 'Unknown problem', [])); notify(s, 'error'); break;
    }
    if (sid === activeId) renderAll(); else renderBoard();
  }

  function progressLine(s) {
    const line = h('button', { class: 'progress-line working', type: 'button', title: 'Show or hide the steps for this round' }, h('i', { class: 'pl-dot' }), h('span', { class: 'pl-txt' }, ''), h('span', { class: 'pl-more' }, 'show steps'));
    line.addEventListener('click', () => {
      const open = !line.classList.contains('open'); line.classList.toggle('open', open);
      line.querySelector('.pl-more').textContent = open ? 'hide steps' : 'show steps';
      for (let el = line.nextElementSibling; el && !el.classList.contains('progress-line'); el = el.nextElementSibling) el.classList.toggle('peek', open);
    });
    return line;
  }
  function updateProgress(s, finished) {
    const line = s.progress; if (!line) return;
    const n = s.turnTools + (s.turnHelpers || 0), who = skin.id === 'goodboy' ? 'Winston' : 'Claude';
    const helpers = s.turnHelpers ? ' · ' + s.turnHelpers + ' helper' + (s.turnHelpers > 1 ? 's' : '') : '';
    line.querySelector('.pl-txt').textContent = finished ? `✓ ${n} step${n === 1 ? '' : 's'}${helpers} · ${clock(now() - s.turnStart)}` : n ? `${who} is working… ${n} step${n === 1 ? '' : 's'} so far${helpers}` : `${who} is thinking…`;
    line.classList.toggle('working', !finished); line.classList.toggle('empty', !!finished && !n);
  }
  function startTurn(s) {
    s.busy = true; s.turnStart = now(); s.turnGems = 0; s.turnCostStart = s.cost; s.turnTools = 0; s.turnDenied = 0; s.alert = null; s.redo = false;
    s.stage = 'WORKING'; s.say = 'Thinking…'; s.turnHelpers = 0;
    s.progress = add(s, progressLine(s)); updateProgress(s);
    if (s.id === activeId) { World.clearHelpers(); World.setState('run'); renderWorld(); }
  }

  function onClaude(s, m) {
    const parent = m.parent_tool_use_id || null;
    switch (m.type) {
      case 'system':
        if (m.subtype === 'init') { s.init = m; s.initModel = m.model; }
        else if (m.subtype === 'status' && m.status === 'requesting') { if (!s.waiting) say(s, 'Thinking…'); }
        else if (m.subtype === 'api_retry') { if (m.error === 'authentication_failed' || m.error_status === 401) { if (m.attempt >= 2) showLogin(s); } else say(s, 'Connection hiccup, trying again…'); }
        else if (m.subtype === 'compact_boundary') { sysNote(s, skin.id === 'goodboy' ? '😴 Winston had a nap to make room in his tummy (memory tidied).' : '🧹 Claude tidied up its memory to make room.'); s.ctxBase = 0; s.ctxHist = []; }
        else if (/^hook_/.test(m.subtype || '')) { if (m.subtype !== 'hook_started') { s.hookLog.push({ event: m.hook_event || m.hook_event_name || 'hook', name: m.hook_name || '', ok: m.outcome ? m.outcome === 'success' : (m.exit_code == null || m.exit_code === 0), t: now() }); if (s.hookLog.length > 40) s.hookLog.shift(); if (s.id === activeId) renderWidgets(['hooks']); } }
        else if (m.subtype === 'task_started' && m.tool_use_id) { const a = s.agents.get(m.tool_use_id); if (a) a.status = 'working'; }
        break;
      case 'autocompact_state': if (m.value && m.value.effective_window) s.ctxWin = m.value.effective_window; break;
      case 'rate_limit_event': { const r = m.rate_limit_info || {}; if (r.rateLimitType) { s.rate[r.rateLimitType] = r; checkLimits(s); } break; }
      case 'stream_event': if (!parent) onStream(s, m.event || {}); break;
      case 'assistant': onAssistant(s, m, parent); break;
      case 'user': onToolResults(s, m, parent); break;
      case 'control_request': if (m.request && m.request.subtype === 'can_use_tool') askCard(s, m.request_id, m.request); break;
      case 'control_cancel_request': { const c = s.cards.get(m.request_id); if (c) { markAnswered(c, null); s.waiting = Math.max(0, s.waiting - 1); } break; }
      case 'result': onResult(s, m); break;
    }
    if (m.type === 'stream_event') return;
    if (s.id === activeId) scheduleRender('status', 'world', 'live', 'needs'); else scheduleRender('board');
  }
  function say(s, text) { s.say = text; if (s.id === activeId) renderWorld(); }

  function onStream(s, e) {
    if (e.type === 'message_start') s.liveMsg = e.message && e.message.id;
    else if (e.type === 'content_block_start') { if (e.content_block && e.content_block.type === 'thinking') showThinking(s, true); }
    else if (e.type === 'content_block_delta' && e.delta) {
      if (e.delta.type === 'text_delta') {
        showThinking(s, false);
        if (!s.live) s.live = { text: '', el: claudeBubble(s, '', true), msg: s.liveMsg };
        s.live.text += e.delta.text;
        if (!s.live.raf) { const lv = s.live; lv.raf = requestAnimationFrame(() => { lv.raf = 0; if (s.live === lv) setBubble(lv.el, lv.text, true); }); }
        if (s.id === activeId) scrollFeed();
        say(s, 'Writing a reply…');
      } else if (e.delta.type === 'thinking_delta') { showThinking(s, true); s.thinkChars += (e.delta.thinking || '').length; addArea(s, 'think', 'Thinking', (e.delta.thinking || '').length / 4); if (s.thinkingEl) s.thinkingEl.lastChild.textContent = ` thinking · ${kfmt(s.thinkChars / 4)} tok`; }
    }
  }
  function showThinking(s, on) {
    if (on && !s.thinkingEl) { s.thinkChars = 0; s.thinkStart = now(); s.thinkingEl = add(s, h('div', { class: 'thinking' }, h('i'), h('i'), h('i'), h('span', {}, ' thinking'))); say(s, skin.id === 'goodboy' ? 'Sniffing around…' : 'Thinking…'); }
    if (!on && s.thinkingEl) {
      const secs = Math.round((now() - s.thinkStart) / 1000);
      if (secs >= 2) s.thinkingEl.replaceWith(h('div', { class: 'thought-note' }, '💭 thought for ' + clock(secs * 1000) + (s.thinkChars ? ' · ~' + kfmt(s.thinkChars / 4) + ' tokens' : '')));
      else s.thinkingEl.remove();
      s.thinkingEl = null;
    }
  }

  // Token accounting: count each message once; split effort into areas (estimates).
  function addArea(s, key, label, tokens, item) {
    if (!tokens) return;
    const a = s.areas[key] || (s.areas[key] = { label, tokens: 0 }); a.tokens += tokens;
    if (item) s.items[item] = (s.items[item] || 0) + tokens;
  }
  function onAssistant(s, m, parent) {
    const msg = m.message || {}, content = Array.isArray(msg.content) ? msg.content : [];
    if (m.error === 'authentication_failed' || content.some(b => b.type === 'text' && /run \/login|not logged in|invalid api key/i.test(b.text || ''))) showLogin(s);
    if (!parent) s.lastMsgAt = now();
    if (msg.usage && msg.id && !s.msgSeen.has(msg.id)) {
      s.msgSeen.add(msg.id);
      const u = msg.usage, fresh = u.input_tokens || 0, cr = u.cache_read_input_tokens || 0, cw = u.cache_creation_input_tokens || 0, out = u.output_tokens || 0;
      if (!parent) {
        s.tk.fresh += fresh; s.tk.cacheRead += cr; s.tk.cacheWrite += cw; s.tk.out += out;
        const used = fresh + cr + cw;
        if (used) { if (!s.ctxBase) { s.ctxBase = used; addArea(s, 'setup', 'Setup (rules, tools, CLAUDE.md)', used); } s.ctxUsed = used; s.ctxHist.push(used); }
      } else {
        const a = s.agents.get(parent); if (a) a.tokens += fresh + cw + out; // shown in the helper sheet; the area counts what they bring back
      }
    }
    for (const b of content) {
      if (b.type === 'text') {
        if (parent) { const a = s.agents.get(parent); if (a && b.text.trim()) { a.log.push({ say: b.text.trim() }); renderSheetIfOpen(s, a); } const g = s.groups.get(parent); if (g && b.text.trim()) g.steps.append(h('div', { class: 'helper-say' }, '“' + b.text.trim().slice(0, 240) + (b.text.length > 240 ? '…' : '') + '”')); continue; }
        showThinking(s, false); addArea(s, 'reply', 'Claude’s replies', b.text.length / 4);
        if (s.live && (s.live.msg === msg.id || !s.live.done)) { setBubble(s.live.el, b.text, false); s.live = null; }
        else if (b.text.trim()) claudeBubble(s, b.text, false);
      } else if (b.type === 'tool_use') {
        showThinking(s, false);
        if (s.live) { setBubble(s.live.el, s.live.text, false); s.live = null; }
        onToolUse(s, b, parent);
      }
    }
  }

  function onToolUse(s, b, parent) {
    const name = b.name, input = b.input || {};
    if (name === 'TodoWrite') s.todos = (input.todos || []).map(t => ({ text: t.status === 'in_progress' ? (t.activeForm || t.content) : t.content, status: t.status }));
    if (name === 'TaskCreate') { s.tasks.push({ id: String(s.tasks.length + 1), text: input.subject, status: 'pending' }); s.todos = s.tasks.map(t => ({ ...t })); }
    if (name === 'TaskUpdate') { const t = s.tasks.find(x => x.id === String(input.taskId)); if (t) { if (input.status === 'deleted') s.tasks = s.tasks.filter(x => x !== t); else { t.status = input.status || t.status; if (input.subject) t.text = input.subject; } } s.todos = s.tasks.map(t => ({ ...t })); }
    if (name === 'AskUserQuestion' || name === 'ExitPlanMode') return;
    const dsc = describeTool(name, input), [color, tag] = GEM[dsc.kind] || GEM.misc;
    s.tally[dsc.kind] = (s.tally[dsc.kind] || 0) + 1; s.turnGems++;
    if (name === 'Agent' || name === 'Task') s.turnHelpers = (s.turnHelpers || 0) + 1; else s.turnTools++;
    if (!parent) { const last = s.feed.lastElementChild; if (last && last.classList.contains('msg-claude')) last.classList.add('interim'); }
    updateProgress(s);
    if (name === 'Write') addArea(s, 'make', GEM.make[2], String(input.content || '').length / 4, dsc.item);
    if (name === 'Edit' || name === 'MultiEdit') addArea(s, 'edit', GEM.edit[2], String(input.new_string || JSON.stringify(input.edits || '')).length / 4, dsc.item);
    if (name === 'Skill') { const sk = input.skill || input.name || input.command || 'skill'; s.skillsUsed[sk] = (s.skillsUsed[sk] || 0) + 1; s.skillsActive.add(sk); }
    if (s.id === activeId) World.gem(color);
    Sound.play('gem');
    say(s, dsc.text + '…');

    if (name === 'Agent' || name === 'Task') {
      const breed = breedFor(input.subagent_type, input.description);
      const steps = h('div', { class: 'helper-steps' });
      const av = h('img', { src: ART('p_' + breed + '_walk'), alt: '', style: { height: '22px' } });
      const head = h('div', { class: 'helper-head', title: 'Open this helper', 'data-breed': breed, 'data-desc': input.description || 'side quest' }, skin.id === 'goodboy' ? av : h('span', {}, '🛸'),
        h('span', {}, W8.helper(breed, input.description || 'side quest')), h('span', { class: 'open' }, 'open ›'), h('span', { class: 'hs' }, L('helpersOut').toUpperCase()));
      const el = h('div', { class: 'helper-group' }, head, steps);
      head.addEventListener('click', () => openSheet(s, b.id));
      s.groups.set(b.id, { el, steps });
      s.agents.set(b.id, { id: b.id, desc: input.description || 'Side quest', type: input.subagent_type || 'helper', prompt: input.prompt || '', status: 'working', steps: 0, log: [], start: now(), end: 0, tokens: 0, result: '', breed, bg: !!input.run_in_background });
      if (!parent) add(s, el);
      if (s.id === activeId) World.drone(b.id, { breed });
      return;
    }
    const row = h('div', { class: 'tool running', style: { '--gcol': color } }, h('i', { class: 'gem' }), h('span', { class: 'txt', title: dsc.text }, dsc.text), h('span', { class: 'rep' }), h('span', { class: 'tag', title: (GEM[dsc.kind] || GEM.misc)[2] }, tag), h('span', { class: 'dur' }), h('span', { class: 'st' }), h('button', { class: 'more', type: 'button', title: 'Show the details' }, '•••'));
    let detail = null;
    row.querySelector('.more').addEventListener('click', () => { if (detail) { detail.remove(); detail = null; return; } detail = h('div', { class: 'tool-detail' }, toolDetail(name, input)); row.after(detail); });
    const g = parent && s.groups.get(parent);
    const a = parent && s.agents.get(parent);
    if (a) { a.steps++; a.log.push({ text: dsc.text, kind: dsc.kind, id: b.id }); renderSheetIfOpen(s, a); }
    // Collapse repeats ("Updated the to-do list" ×3) into one row with a counter.
    const host = g ? g.steps : s.feed;
    const prev = host.lastElementChild;
    if (prev && prev.classList.contains('tool') && prev.querySelector('.txt').textContent === dsc.text) {
      prev._n = (prev._n || 1) + 1; prev.querySelector('.rep').textContent = '×' + prev._n;
      prev.classList.add('running'); prev.classList.remove('ok');
      s.tools.set(b.id, { row: prev, name, input, dsc, t0: now(), parent }); return;
    }
    if (g) { g.steps.append(row); if (s.id === activeId) scrollFeed(); } else add(s, row);
    s.tools.set(b.id, { row, name, input, dsc, t0: now(), parent });
  }

  function onToolResults(s, m) {
    const content = (m.message && Array.isArray(m.message.content)) ? m.message.content : [];
    for (const b of content) {
      if (b.type !== 'tool_result') continue;
      const text = Array.isArray(b.content) ? b.content.map(x => x.text || '').join('\n') : String(b.content || '');
      const t = s.tools.get(b.tool_use_id);
      if (t) {
        t.row.classList.remove('running'); t.row.classList.add(b.is_error ? 'err' : 'ok');
        const ms = now() - t.t0; if (ms > 400) t.row.querySelector('.dur').textContent = clock(ms);
        if (!t.parent) addArea(s, t.dsc.kind, GEM[t.dsc.kind][2], text.length / 4, t.dsc.item);
        if (!b.is_error && /^(Write|Edit|MultiEdit|NotebookEdit)$/.test(t.name)) notePage(s, t.input.file_path || t.input.notebook_path);
        if (t.name === 'Skill') { const sk = t.input.skill || t.input.name || t.input.command || 'skill'; s.skillsActive.delete(sk); addArea(s, 'app', GEM.app[2], 0, 'Skill ' + sk); }
      }
      const g = s.groups.get(b.tool_use_id), a = s.agents.get(b.tool_use_id);
      if (a) {
        const background = /running in the background|started in background|async/i.test(text) && a.bg;
        if (!background) { a.status = b.is_error ? 'failed' : 'done'; a.end = now(); a.result = text; addArea(s, 'help', 'Helpers (what they brought back)', text.length / 4, 'Helper: ' + a.desc); }
        if (g) { g.el.classList.toggle('done', !background); g.el.querySelector('.hs').textContent = background ? 'IN THE BACKGROUND' : b.is_error ? 'CAME BACK EARLY' : L('helperBack').toUpperCase(); }
        if (s.id === activeId && !background) World.droneDone(b.tool_use_id);
        renderSheetIfOpen(s, a);
      }
    }
  }

  function onResult(s, m) {
    showThinking(s, false);
    if (s.live) { setBubble(s.live.el, s.live.text, false); s.live = null; }
    for (const t of s.tools.values()) if (t.row.classList.contains('running')) { t.row.classList.remove('running'); t.row.classList.add('ok'); }
    updateProgress(s, true);
    s.skillsActive.clear();
    // The CLI's cost counter restarts at zero when Claude restarts; keep a running total.
    if (typeof m.total_cost_usd === 'number') { if (m.total_cost_usd + 1e-9 < s.costRaw) s.costBase += s.costRaw; s.costRaw = m.total_cost_usd; s.cost = s.costBase + s.costRaw; }
    const spent = Math.max(0, s.cost - (s.turnCostStart || 0));
    s.busy = false; s.turns++;
    const dur = m.duration_ms || (now() - s.turnStart); s.playMs += dur;
    if (m.is_error) {
      if (m.api_error_status === 401) { showLogin(s); s.stage = 'NEED LOGIN'; if (s.id === activeId) World.setState('error'); return; }
      const why = m.subtype === 'error_max_turns' ? 'Claude hit its step limit.' : m.subtype === 'error_during_execution' && /interrupt/i.test(m.result || '') ? 'Stopped, as you asked.' : (m.result || 'Something went wrong.');
      s.history.push({ label: s.turnLabel || 'Round ' + s.turns, dur, cost: spent, files: 0, tools: s.turnTools, kind: 'fail', t: Date.now() });
      add(s, h('div', { class: 'level-clear fail', 'data-kind': 'fail' }, h('div', { class: 'lc-title' }, W8.clear('fail')), h('div', { class: 'lc-stats' }, h('span', {}, String(why).slice(0, 160)))));
      s.stage = 'OOPS'; s.say = 'That did not work. Want to try again?';
      if (s.id === activeId) World.setState('error');
      notify(s, 'error'); return;
    }
    const nFiles = s.files.length, planUser = isPlanUser(s);
    const costTxt = planUser ? '' : '🪙 ' + money(spent);
    const stats = [h('span', {}, '⏱ ' + clock(dur)), s.turnGems ? h('span', { class: 'lc-gems', 'data-n': s.turnGems }, W8.gems(s.turnGems)) : null, costTxt ? h('span', {}, costTxt) : null, h('span', { class: 'lc-files' }, nFiles ? '📄 ' + nFiles + ' file' + (nFiles > 1 ? 's' : '') + ' changed' : '')];
    let kind = 'big';
    if (s.turnDenied) kind = 'partial'; else if (!s.turnTools && !s.turnHelpers && !nFiles) kind = 'soft';
    const title = W8.clear(kind);
    s.lastClear = add(s, h('div', { class: 'level-clear ' + (kind === 'big' ? '' : kind), 'data-kind': kind }, h('div', { class: 'lc-title' }, title), h('div', { class: 'lc-stats' }, ...stats)));
    s.stage = 'DONE'; s.say = kind === 'big' ? L('doneSay') : kind === 'partial' ? 'Your turn: what’s next?' : 'Your move.';
    if (kind === 'big') s.clears++;
    if (s.id === activeId && live) {
      World.setState(kind === 'partial' ? 'idle' : 'done');
      if (kind === 'big') {
        World.coins(Math.max(4, Math.min(24, s.turnGems * 2)));
        // Diesel's star: the first big finish of a chat, and after long jobs. Once per chat, even after a reload.
        const key = 'diesel:' + (s.info.claudeSessionId || s.id);
        if (!store.get(key, false) || dur > 60000) { store.set(key, true); setTimeout(() => World.dieselStar(), 900); }
      }
      setTimeout(() => { if (!s.busy && s.id === activeId) World.setState('idle'); }, 1800);
    }
    s.history.push({ label: s.turnLabel || 'Round ' + s.turns, dur, cost: spent, files: nFiles, tools: s.turnTools, kind, t: Date.now() });
    if (m.credential_expires_at) { const days = (new Date(m.credential_expires_at) - Date.now()) / 864e5; if (days < 10) toast(`Your Claude sign-in expires in ${Math.max(0, Math.round(days))} days. Sign in again soon to keep working.`, 'needs', null, 9000); }
    loadEnv(s); refreshStatusLine(s); loadExisting(s);
    notify(s, kind === 'partial' ? 'partial' : 'done', kind === 'soft' ? '' : nFiles ? nFiles + ' file' + (nFiles > 1 ? 's' : '') + ' changed' : '');
  }

  function onChanges(s) {
    if (s.id !== activeId) return;
    renderWidgets(['changes', 'preview', 'files']);
    const pages = previewables(s);
    if (pages.length && !s.previewPath && pages.some(p => /\.html?$/i.test(p))) {
      s.previewPath = pages.find(p => /\.html?$/i.test(p));
      renderWidgets();
      toast(skin.id === 'goodboy' ? 'Show and tell! Your page is ready.' : 'Your page is ready to preview.', 'ok', { label: 'See it big', fn: () => openViewer('preview') });
    } else if (s.previewPath) loadPreview(true);
  }
  // Remember pages Claude wrote or edited this chat. A rewrite with the same content
  // does not show up as a "change", but people still expect to see it in Show and tell.
  function relPath(cwd, f) { const n = x => String(x || '').replace(/\\/g, '/'); const c = n(cwd).replace(/\/+$/, ''), p = n(f); return p.toLowerCase().startsWith(c.toLowerCase() + '/') ? p.slice(c.length + 1) : /^([a-z]:)?\//i.test(p) ? '' : p; }
  function notePage(s, file) {
    const rel = relPath(s.info.cwd, file); if (!rel || !PREVIEWABLE.test(rel)) return;
    if (!s.touched.includes(rel)) s.touched.push(rel);
    if (s.id !== activeId) return;
    if (!s.previewPath && /\.html?$/i.test(rel)) {
      s.previewPath = rel; renderWidgets(['preview']);
      toast(skin.id === 'goodboy' ? 'Show and tell! Your page is ready.' : 'Your page is ready to preview.', 'ok', { label: 'See it big', fn: () => openViewer('preview') });
    } else if (rel === s.previewPath) setTimeout(() => loadPreview(), 300);
    else renderWidgets(['preview']);
  }
  // Pages already in the folder, so Show and tell has something to offer from the start.
  async function loadExisting(s) {
    if (DEMO || !s) return;
    const r = await api(`/api/session/${s.id}/files`);
    s.existing = ((r && r.files) || []).filter(f => !f.dir && PREVIEWABLE.test(f.path)).map(f => f.path).slice(0, 60);
    if (!s.previewPath) { const home = s.existing.find(p => /(^|\/)index\.html?$/i.test(p)) || s.existing.find(p => /\.html?$/i.test(p)); if (home) s.previewPath = home; }
    if (s.id === activeId) renderWidgets(['preview']);
  }
  const PREVIEWABLE = /\.(html?|md|csv|txt|png|jpe?g|gif|webp|svg)$/i;
  const previewables = s => s ? [...new Set([s.previewPath, ...s.files.filter(f => PREVIEWABLE.test(f.file) && f.status !== 'D').map(f => f.file), ...s.touched, ...s.existing].filter(Boolean))] : [];

  /* ---------------- ask cards (permissions, questions, plans) ---------------- */
  function askCard(s, requestId, req) {
    if (!s.waiting) { s.needSince = Date.now(); s.lastNag = Date.now(); }
    s.waiting++; s.stage = 'NEEDS YOU';
    const name = req.tool_name, input = req.input || {};
    const card = name === 'AskUserQuestion' ? questionCard(s, requestId, input) : name === 'ExitPlanMode' ? planCard(s, requestId, input) : permissionCard(s, requestId, name, input, req);
    card.classList.add('pending');
    s.cards.set(requestId, card); add(s, card);
    if (s.id === activeId) { World.setState('wait'); World.pauseGame(true); }
    renderWidgets(['inbox']);
    notify(s, 'needs', card.querySelector('h3') ? card.querySelector('h3').textContent.replace(/^!/, '').trim() : '');
  }
  function permissionCard(s, requestId, name, input, req) {
    const f = input.file_path || input.notebook_path || '';
    let icon = '🔧', title = `Claude wants to use ${name}`, what = req.description || '';
    if (name === 'Bash' || name === 'PowerShell') { icon = '⌨️'; title = 'Claude wants to run a command'; what = input.description ? 'Claude says this will: ' + input.description : 'Claude did not say what this does.'; }
    else if (name === 'Write') { icon = '📄'; title = `Claude wants to create ${base(f)}`; what = 'A new file (or a fresh copy) in your project. Undo can remove it.'; }
    else if (name === 'Edit' || name === 'MultiEdit') { icon = '✏️'; title = `Claude wants to change ${base(f)}`; what = 'It will edit part of this file. Undo can put it back.'; }
    else if (name === 'NotebookEdit') { icon = '📓'; title = `Claude wants to change ${base(f)}`; }
    else if (name === 'WebFetch') { icon = '🌐'; title = `Claude wants to visit ${hostOf(input.url)}`; what = input.prompt || ''; }
    else if (name === 'WebSearch') { icon = '🔎'; title = 'Claude wants to search the web'; what = input.query || ''; }
    else if (name.startsWith('mcp__')) { const [, srv, tool] = name.split('__'); icon = '🔌'; title = `Claude wants to use ${srv}`; what = String(tool || '').replace(/_/g, ' '); }
    if (req.title) title = req.title;
    const risks = riskOf(name, input, s.info.cwd), danger = risks.some(r => r[0] === 'w-red');
    const isCmd = name === 'Bash' || name === 'PowerShell';
    const det = h('div', { class: 'cmd' + (isCmd ? '' : ' hidden') }, toolDetail(name, input));
    const isFile = /^(Write|Edit|MultiEdit|NotebookEdit)$/.test(name), showWord = isFile ? 'Show code' : 'Show details', hideWord = isFile ? 'Hide code' : 'Hide details';
    const toggle = h('button', { class: 'details-toggle', type: 'button' }, isCmd ? hideWord : showWord);
    toggle.addEventListener('click', () => { det.classList.toggle('hidden'); toggle.textContent = det.classList.contains('hidden') ? showWord : hideWord; });
    const lines = t => String(t || '').split('\n').length;
    if (name === 'Write') { const first = String(input.content || '').split('\n').find(l => l.trim()) || ''; what += ` It is ${lines(input.content)} line${lines(input.content) === 1 ? '' : 's'} long${first ? ', starting with “' + first.trim().slice(0, 60) + (first.trim().length > 60 ? '…' : '') + '”' : ''}.`; }
    else if (name === 'Edit') what += ` It swaps ${lines(input.old_string)} line${lines(input.old_string) === 1 ? '' : 's'} for ${lines(input.new_string)} new one${lines(input.new_string) === 1 ? '' : 's'}.`;
    else if (name === 'MultiEdit') what += ` It makes ${(input.edits || []).length} small changes.`;
    const raw = [input.command, input.url, input.content, input.new_string, input.prompt].filter(Boolean).join('\n') || JSON.stringify(input);
    const secret = SECRET_RE.some(re => re.test(raw));
    if (secret) risks.push(['w-red', 'This looks like it contains a password or key. Answer just this once, so it is never saved into your settings.']);
    const sugg = secret ? [] : (Array.isArray(req.permission_suggestions) ? req.permission_suggestions : []);
    const where = sugg.some(x => x.destination === 'userSettings') ? 'in every project' : sugg.some(x => /projectSettings|localSettings/.test(x.destination || '')) ? 'in this project from now on' : 'for the rest of this chat';
    const answer = (allow, always) => api(`/api/session/${s.id}/permission`, { requestId, allow, always }).then(r => {
      if (DEMO && r.ok) { markAnswered(card, allow); s.waiting = Math.max(0, s.waiting - 1); if (!allow) s.turnDenied++; renderAll(); }
      if (always && allow) toast(`OK. Claude won’t ask about this again ${where}.`, 'ok');
    });
    const card = h('div', { class: 'card card-perm' + (danger ? ' danger' : '') },
      h('h3', {}, h('span', { class: 'bang' }, '!'), icon + ' ' + title),
      isCmd ? det : null,
      what ? h('p', {}, what) : null,
      ...risks.map(([c, t]) => h('div', { class: 'warn ' + c }, '⚠ ', t)),
      isCmd ? null : det, isCmd ? null : toggle,
      h('div', { class: 'actions' },
        h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-mint'), type: 'button', onclick: () => answer(true, false) }, danger ? 'Yes, I’m sure' : 'Yes, do it'),
        sugg.length && !danger ? h('button', { class: 'btn btn-outline-sky', type: 'button', onclick: () => answer(true, true), title: 'Don’t ask again ' + where }, 'Yes, and don’t ask again') : null,
        h('button', { class: 'btn btn-outline-rose', type: 'button', onclick: () => answer(false) }, skin.id === 'goodboy' ? 'No, leave it' : 'No')),
      sugg.length && !danger ? h('div', { class: 'always-note' }, '“Don’t ask again” applies ' + where + '.') : null,
      h('div', { class: 'verdict' }));
    say(s, L('waitSay') + ': ' + lowerFirst(title.replace(/^Claude wants to /, '')) + '?');
    return card;
  }
  function questionCard(s, requestId, input) {
    const qs = Array.isArray(input.questions) ? input.questions : [], answers = {};
    const card = h('div', { class: 'card card-plan' }, h('h3', {}, h('span', { class: 'bang' }, '?'), '💬 Claude has a question'));
    qs.forEach(q => {
      card.append(h('p', {}, h('b', {}, q.question)));
      const grid = h('div', { class: 'q-opts' });
      (q.options || []).forEach(o => {
        const btn = h('button', { class: 'q-opt', type: 'button' }, h('b', {}, o.label), o.description ? h('small', {}, o.description) : null);
        btn.addEventListener('click', () => {
          if (q.multiSelect) { btn.classList.toggle('sel'); answers[q.question] = [...grid.querySelectorAll('.q-opt.sel b')].map(x => x.textContent).join(', '); }
          else { grid.querySelectorAll('.q-opt').forEach(x => x.classList.remove('sel')); btn.classList.add('sel'); answers[q.question] = o.label; }
        });
        grid.append(btn);
      });
      const other = h('input', { class: 'q-other', placeholder: 'Or type your own answer…' });
      other.addEventListener('input', () => { if (other.value.trim()) { answers[q.question] = other.value.trim(); grid.querySelectorAll('.q-opt').forEach(x => x.classList.remove('sel')); } });
      card.append(grid, other);
    });
    const sendBtn = h('button', { class: 'btn btn-mint', type: 'button', onclick: () => api(`/api/session/${s.id}/permission`, { requestId, allow: true, updatedInput: { ...input, answers } }).then(r => { if (DEMO && r.ok) markAnswered(card, true); }) }, 'Send answer');
    card.append(h('div', { class: 'actions' }, sendBtn, h('button', { class: 'btn btn-outline-rose', type: 'button', onclick: () => api(`/api/session/${s.id}/permission`, { requestId, allow: false, message: 'The user skipped the question.' }) }, 'Skip')), h('div', { class: 'verdict' }));
    say(s, 'Claude has a question for you.');
    return card;
  }
  function planCard(s, requestId, input) {
    const go = mode => api(`/api/session/${s.id}/permission`, { requestId, allow: true }).then(() => { setMode(mode); if (DEMO) markAnswered(card, true); });
    const change = h('textarea', { placeholder: 'What should change in the plan?', class: 'hidden' });
    const sendChange = h('button', { class: 'btn btn-outline-rose hidden', type: 'button', onclick: () => api(`/api/session/${s.id}/permission`, { requestId, allow: false, message: 'Keep planning. The user wants these changes to the plan: ' + (change.value.trim() || 'not specified, ask them') }) }, 'Send my changes');
    const keep = h('button', { class: 'btn btn-outline-rose', type: 'button', onclick: () => { change.classList.remove('hidden'); sendChange.classList.remove('hidden'); keep.classList.add('hidden'); change.focus(); } }, 'Change the plan');
    const card = h('div', { class: 'card card-plan' },
      h('h3', {}, h('span', { class: 'bang' }, '🗺'), 'Here is the plan'),
      h('div', { class: 'plan-body md', html: md(input.plan || '') }),
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn-mint', type: 'button', onclick: () => go('acceptEdits') }, 'Build it (edit freely)'),
        h('button', { class: 'btn btn-outline-sky', type: 'button', onclick: () => go('default') }, 'Build it, ask me first'), keep),
      change, sendChange, h('div', { class: 'verdict' }));
    say(s, 'The plan is ready for you to check.');
    return card;
  }
  function markAnswered(card, allow) {
    card.classList.remove('pending'); card.classList.add('answered');
    const v = card.querySelector('.verdict');
    if (v) { v.textContent = allow === null ? 'Claude moved on' : allow ? '✓ You said yes' : '✕ You said no'; v.style.color = allow ? 'var(--ok)' : 'var(--bad)'; }
  }
  function errorCard(title, text, buttons) {
    return h('div', { class: 'card card-error' }, h('h3', {}, '⚠ ' + title), h('div', { class: 'cmd' }, text), h('div', { class: 'actions' }, ...buttons.map(([t, cls, fn]) => h('button', { class: 'btn ' + cls, type: 'button', onclick: fn }, t))));
  }
  function showLogin(s) {
    if (s.loginShown) return;
    s.loginShown = true; s.stage = 'NEED LOGIN';
    add(s, h('div', { class: 'card card-perm pending' }, h('h3', {}, h('span', { class: 'bang' }, '!'), '🔑 Sign in to Claude first'),
      h('p', {}, 'Claude Code needs you to sign in once. Click the button and a window opens. Pick your Claude subscription (or paste an API key), finish in your browser, then come back and press “I’m signed in”.'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn-mint', type: 'button', onclick: () => api('/api/login', {}).then(() => toast('A window opened. Type /login if it does not ask straight away.', 'ok')) }, 'Open sign in'),
        h('button', { class: 'btn btn-outline-sky', type: 'button', onclick: () => { s.loginShown = false; api(`/api/session/${s.id}/reclaim`, {}); toast('Restarting Claude…'); } }, 'I’m signed in'))));
  }
  function focusNeeds() {
    const s = S(activeId); if (!s) return;
    const c = [...s.cards.values()].find(x => x.classList.contains('pending'));
    if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); c.setAttribute('tabindex', '-1'); setTimeout(() => c.focus({ preventScroll: true }), 400); }
  }

  /* ---------------- account and plan ---------------- */
  function accountName(s) {
    const acc = s && s.caps && s.caps.account;
    if (!acc) return DEMO ? 'Demo player' : '…';
    const sub = acc.subscriptionType ? String(acc.subscriptionType) : '';
    const subName = sub ? (/^claude\b/i.test(sub) ? sub : 'Claude ' + cap(sub)) : '';
    if (acc.apiProvider && acc.apiProvider !== 'firstParty') return { bedrock: 'Amazon Bedrock', vertex: 'Google Vertex', foundry: 'Microsoft Foundry' }[acc.apiProvider] || cap(acc.apiProvider);
    if (acc.apiKeySource && acc.apiKeySource !== 'none') return 'API key';
    if (subName) return subName;
    if (acc.email || (acc.tokenSource && acc.tokenSource !== 'none')) return 'Claude account';
    return 'Not signed in';
  }
  // Small shared numbers: Claude Code version, how full memory is, how much of a limit is used.
  const ccVersion = s => s && s.caps && s.caps.claude_code_version ? String(s.caps.claude_code_version).split(' ')[0] : '';
  const ctxPct = s => s && s.ctxUsed ? Math.min(100, Math.round(s.ctxUsed / s.ctxWin * 100)) : 0;
  const pctOf = r => r && typeof r.utilization === 'number' ? Math.round(r.utilization * 100) : null;
  function isPlanUser(s) { const acc = s && s.caps && s.caps.account; return !!(acc && acc.subscriptionType && (!acc.apiProvider || acc.apiProvider === 'firstParty') && !(acc.apiKeySource && acc.apiKeySource !== 'none')); }
  const MODEL_NAMES = { opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku', fable: 'Fable' };
  // What "Default" really means: from the first message, or from the model list before that.
  function realModel(s) { if (!s) return ''; if (s.initModel) return s.initModel; const d = ((s.caps && s.caps.models) || []).find(m => m.value === 'default'); return d ? (d.resolvedModel || d.description || '') : ''; }
  function modelLabel(s) { return s.info.model ? prettyModel(s.info.model) : 'Default → ' + (prettyModel(realModel(s)) || '…'); }
  function prettyModel(id) { if (!id) return ''; const m = String(id).match(/(opus|sonnet|haiku|fable)[-_]?(\d+)?[-_.]?(\d+)?/i); return m ? MODEL_NAMES[m[1].toLowerCase()] + (m[2] ? ' ' + m[2] + (m[3] && m[3].length <= 2 ? '.' + m[3] : '') : '') : id; }

  /* ---------------- helpers for the newer blocks ---------------- */
  const MODE_NAMES = { default: 'Ask me first', acceptEdits: 'Edit freely', plan: 'Plan first', auto: 'Autopilot', dontAsk: 'Only what I allowed before', bypassPermissions: 'No limits' };
  const HOOK_NAMES = { SessionStart: 'when a chat starts', SessionEnd: 'when a chat ends', UserPromptSubmit: 'when you send a message', PreToolUse: 'before Claude uses a tool', PostToolUse: 'after a tool', Notification: 'when Claude notifies you', Stop: 'when Claude finishes', SubagentStop: 'when a helper finishes', PreCompact: 'before memory tidy-up', PermissionRequest: 'when Claude asks permission' };
  const DEFAULT_SL = '{model} · 📁 {dir} · 🌿 {branch} · 🧠 {context} · ⏳ {five} · 💰 {cost}';
  const SL_TOKENS = ['model', 'dir', 'branch', 'context', 'five', 'week', 'cost', 'mode', 'effort', 'time', 'cache'];
  const DEFAULT_PROMPTS = ['Explain what you just did in plain English.', 'Check your work for mistakes, then fix any you find.', 'Make it look nicer, with friendly colours.', 'Write a short README for this project.', 'What should we do next? Give me three options.'];
  function fillTemplate(tpl, s) {
    const pc = r => pctOf(r) == null ? '—' : pctOf(r) + '%';
    const v = { model: s.info.model ? prettyModel(s.info.model) : prettyModel(realModel(s)) || 'Default', dir: base(s.info.cwd), branch: (s.env && s.env.branch) || '—',
      context: ctxPct(s) + '%', five: pc(s.rate.five_hour), week: pc(s.rate.seven_day), cost: isPlanUser(s) ? 'plan' : money(s.cost),
      mode: MODE_NAMES[s.info.mode] || s.info.mode, effort: s.info.effort || 'auto', time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), cache: cacheNote(s) };
    return String(tpl).replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);
  }
  // Show the coloured text a terminal status line prints (ANSI colours) as HTML.
  function ansi(text) {
    const P16 = ['#2b2433', '#ff6b6b', '#5bd38a', '#ffd23f', '#5aa9e6', '#c77dff', '#4fd1c5', '#e6e6e6', '#6b6575', '#ff8a80', '#7ee8c8', '#ffe08a', '#82c8ff', '#d9b3ff', '#7fe9e0', '#ffffff'];
    const c256 = n => n < 16 ? P16[n] : n < 232 ? (n -= 16, '#' + [Math.floor(n / 36), Math.floor(n / 6) % 6, n % 6].map(x => (x ? x * 40 + 55 : 0).toString(16).padStart(2, '0')).join('')) : '#' + ((n - 232) * 10 + 8).toString(16).padStart(2, '0').repeat(3);
    let out = '', fg = null, bg = null, bold = false;
    const parts = String(text).split(/\x1b\[([0-9;]*)m/);
    for (let i = 0; i < parts.length; i++) {
      if (i % 2) {
        const codes = parts[i] === '' ? [0] : parts[i].split(';').map(Number);
        for (let k = 0; k < codes.length; k++) {
          const c = codes[k];
          if (c === 0) { fg = bg = null; bold = false; } else if (c === 1) bold = true; else if (c === 22) bold = false;
          else if (c >= 30 && c <= 37) fg = P16[c - 30]; else if (c >= 90 && c <= 97) fg = P16[c - 82]; else if (c === 39) fg = null;
          else if (c >= 40 && c <= 47) bg = P16[c - 40]; else if (c >= 100 && c <= 107) bg = P16[c - 92]; else if (c === 49) bg = null;
          else if ((c === 38 || c === 48) && codes[k + 1] === 5) { const col = c256(codes[k + 2]); if (c === 38) fg = col; else bg = col; k += 2; }
          else if ((c === 38 || c === 48) && codes[k + 1] === 2) { const col = 'rgb(' + codes.slice(k + 2, k + 5).join(',') + ')'; if (c === 38) fg = col; else bg = col; k += 4; }
        }
      } else if (parts[i]) {
        const st = (fg ? 'color:' + fg + ';' : '') + (bg ? 'background:' + bg + ';' : '') + (bold ? 'font-weight:700;' : '');
        out += st ? '<span style="' + st + '">' + esc(parts[i]) + '</span>' : esc(parts[i]);
      }
    }
    return out.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  }
  let slTimer = 0;
  function refreshStatusLine(s, now) {
    if (DEMO || !s || !(s.env && s.env.statusLine) || store.get('slMode', 'auto') === 'template') return;
    clearTimeout(slTimer);
    slTimer = setTimeout(async () => {
      const ver = ccVersion(s);
      const added = s.files.reduce((n, f) => n + (f.added || 0), 0), removed = s.files.reduce((n, f) => n + (f.removed || 0), 0);
      const r = await api(`/api/session/${s.id}/statusline`, { data: { modelId: s.info.model || s.initModel, modelName: prettyModel(s.info.model || s.initModel), version: ver, cost: s.cost, durationMs: s.playMs, added, removed, contextUsed: s.ctxUsed, contextSize: s.ctxWin, effort: s.info.effort, rate: Object.fromEntries(Object.entries(s.rate).filter(([, r]) => typeof r.utilization === 'number').map(([k, r]) => [k, { pct: Math.round(r.utilization * 100), resetsAt: r.resetsAt }])) } });
      if (r && (r.text != null || r.error)) { s.slText = r.text != null ? r.text : '⚠ ' + r.error; s.slErr = r.stderr || ''; if (s.id === activeId) renderWidgets(['statusline']); }
    }, now ? 10 : 1200);
  }
  // Only keep asking while Claude works; each finished round refreshes it anyway.
  setInterval(() => { const s = S(activeId); if (s && s.busy && widgetEls.statusline) refreshStatusLine(s, true); }, 15000);
  const envAt = new Map();
  async function loadEnv(s, force) {
    if (!s || DEMO) { if (s && DEMO && !s.env) { s.env = { branch: 'main', changed: 2, os: 'Windows 11', hooks: [{ event: 'Stop', matcher: '', command: 'notify.ps1', scope: 'You, every project', async: true }], settings: [], memory: [{ scope: 'This project', path: 'CLAUDE.md', exists: true, lines: 12 }], allow: ['Bash(npm test)'], deny: [] }; } return; }
    if (!force && Date.now() - (envAt.get(s.id) || 0) < 8000) return;
    envAt.set(s.id, Date.now());
    const r = await api(`/api/session/${s.id}/env`);
    if (r && !r.error) { s.env = r; if (s.id === activeId) { renderWidgets(['env', 'hooks', 'memory', 'statusline']); refreshStatusLine(s); } }
  }
  function allPending() { const out = []; for (const s of sessions.values()) for (const [id, card] of s.cards) if (card.classList.contains('pending')) out.push({ s, id, card }); return out; }
  // Anthropic's prompt cache keeps recent context warm for about 5 minutes.
  function cacheNote(s) { if (!s || !s.lastMsgAt) return 'cold'; const left = 300 - Math.round((Date.now() - s.lastMsgAt) / 1000); return left > 0 ? 'warm · ~' + Math.ceil(left / 60) + ' min left' : 'cooled down (next message costs more)'; }
  const versionLow = v => { const p = String(v).split('.').map(Number); return p[0] === 2 && p[1] === 1 && p[2] < 317; };

  /* ---------------- widgets ---------------- */
  const WIDGETS = {
    player: { cls: 'w-player', title: 'player', render(b, s) {
      const sub = accountName(s);
      b.append(h('div', { class: 'kv' }, h('span', { class: 'k' }, 'Signed in with'), h('span', { class: 'v', title: (s && s.caps && s.caps.account && s.caps.account.email) || '' }, sub)),
        h('div', { class: 'kv' }, h('span', { class: 'k' }, 'Project'), s ? h('button', { class: 'v linkish', type: 'button', title: 'Open ' + s.info.cwd, onclick: () => api(`/api/session/${s.id}/open-folder`, {}) }, base(s.info.cwd)) : h('span', { class: 'v' }, '—')),
        h('div', { class: 'kv' }, h('span', { class: 'k' }, 'Model'), h('span', { class: 'v' }, s ? modelLabel(s) : '—')),
        h('div', { class: 'kv' }, h('span', { class: 'k' }, 'Claude Code'), h('span', { class: 'v' }, ccVersion(s) || '—')));
    } },
    stats: { cls: 'w-stats', title: 'stats', render(b, s) {
      if (!s) return b.append(h('p', { class: 'empty' }, 'Start a project to see your stats.'));
      const plan = isPlanUser(s);
      b.append(h('div', { class: 'big-stats' },
        h('div', { class: 'stat' }, h('b', {}, s.turns), h('small', {}, 'rounds')),
        h('div', { class: 'stat' }, h('b', {}, clock(s.playMs + (s.busy ? Date.now() - s.turnStart : 0))), h('small', {}, 'Claude time')),
        h('div', { class: 'stat' }, h('b', {}, kfmt(s.tk.fresh + s.tk.cacheRead + s.tk.cacheWrite) + ' / ' + kfmt(s.tk.out)), h('small', {}, 'tokens in / out')),
        h('div', { class: 'stat', title: plan ? 'Covered by your plan. This is what it would cost on the API.' : 'What this session cost' }, h('b', {}, money(s.cost)), h('small', {}, plan ? 'worth (covered by plan)' : 'spent'))));
    } },
    quests: { cls: 'w-quests', title: 'quests', count: s => s && s.todos.length ? `${s.todos.filter(t => t.status === 'completed').length}/${s.todos.length}` : '', render(b, s) {
      const list = s ? s.todos : [];
      if (!list.length) return b.append(h('p', { class: 'empty' }, 'Claude’s to-do list shows up here while it works.'));
      b.append(h('ol', { class: 'quest-list' }, ...list.map(t => h('li', { class: 'quest ' + (t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'doing' : '') }, h('span', { class: 'box' }), h('span', { class: 't' }, t.text)))));
    } },
    saves: { cls: 'w-saves', title: 'saves', render(b, s) {
      const cps = s ? (s.info.checkpoints || []).slice().reverse() : [];
      const disabled = s && s.info.undo && s.info.undo.disabled;
      b.append(h('p', { class: 'empty' }, disabled || 'Every message makes a save point. Undo puts your files back.'));
      if (cps.length) b.append(h('ul', { class: 'save-list' }, ...cps.slice(0, 12).map(cp => h('li', { class: 'save' }, h('span', { class: 'lbl', title: cp.label }, cp.label, h('span', { class: 'time' }, ago(cp.t))),
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', disabled: s.busy, onclick: () => undoTo(cp) }, skin.id === 'goodboy' ? '🦴 Dig up' : '↶ Undo')))));
    } },
    changes: { cls: 'w-changes', title: 'changes', count: s => s && s.files.length ? String(s.files.length) : '', render(b, s) {
      const files = s ? s.files : [];
      if (!files.length) return b.append(h('p', { class: 'empty' }, s && s.touched.length ? `Claude saved ${s.touched.length} file${s.touched.length > 1 ? 's' : ''} (${s.touched.slice(0, 3).map(base).join(', ')}), but nothing in ${s.touched.length > 1 ? 'them' : 'it'} changed from before.` : 'Files Claude creates or changes appear here.'));
      const ul = h('ul', { class: 'file-list' });
      files.forEach((f, i) => {
        const kind = f.status === 'A' ? 'New file' : f.status === 'D' ? 'Deleted' : f.status === 'R' ? 'Renamed' : 'Changed';
        const li = h('li', { class: 'file' + (s.selFile === f.file ? ' sel' : ''), title: f.file },
          h('span', { class: 'rank' }, String(i + 1).padStart(2, '0')),
          h('span', { class: 'fn' }, base(f.file), h('small', { class: 'fs-' + (f.status || 'M') }, kind + (f.file.includes('/') ? ' · ' + f.file.split('/').slice(0, -1).join('/') : ''))),
          h('span', { class: 'fd' }, f.binary ? 'file' : [h('span', { class: 'plus' }, '+' + f.added), h('span', { class: 'minus' }, '−' + f.removed)]));
        li.addEventListener('click', () => { s.selFile = s.selFile === f.file ? null : f.file; renderWidgets(); if (s.selFile && document.body.classList.contains('expert-on')) showDiff(f.file); });
        ul.append(li);
      });
      b.append(ul);
      if (s.selFile) b.append(h('div', { class: 'diff-actions' },
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => openViewer('diff', s.selFile) }, '🔍 Show what changed'),
        PREVIEWABLE.test(s.selFile) ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => { s.previewPath = s.selFile; renderWidgets(); openViewer('preview'); } }, '👀 Preview it') : null),
        h('pre', { class: 'diff hidden', id: 'diffView' }));
    } },
    preview: { cls: 'w-preview', title: 'preview', render(b, s) {
      const pages = previewables(s);
      const sel = h('select', { 'aria-label': 'What to preview' }, h('option', { value: '' }, pages.length ? 'Pick a page…' : 'Nothing to show yet'), ...pages.map(p => h('option', { value: p }, p)));
      sel.value = (s && s.previewPath) || '';
      sel.addEventListener('change', () => { if (!s) return; s.previewPath = sel.value; renderWidgets(); });
      b.append(h('div', { class: 'preview-bar' }, sel,
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', title: 'Reload', onclick: () => loadPreview(true) }, '⟳'),
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', title: 'See it full size', onclick: () => openViewer('preview') }, '⤢')));
      const wrap = h('div', { class: 'preview-wrap' });
      if (!(s && s.previewPath)) wrap.append(h('div', { class: 'preview-empty' }, 'When Claude builds a page, a document or a picture, you can see it here.'));
      b.append(wrap);
      if (s && s.previewPath) fillPreview(wrap, s, s.previewPath);
    } },
    helpers: { cls: 'w-helpers', title: 'helpers', count: s => { const n = s ? [...s.agents.values()].filter(a => a.status === 'working').length : 0; return n ? n + ' out' : ''; }, render(b, s) {
      const list = s ? [...s.agents.values()].reverse() : [];
      if (!list.length) return b.append(h('p', { class: 'empty' }, skin.id === 'goodboy' ? 'When Claude sends the pack out on errands, they show up here. Click one to check on it.' : 'When Claude sends helpers on side quests, they show up here. Click one to check on it.'));
      b.append(h('div', { class: 'helper-list' }, ...list.map(a => {
        const el = h('button', { class: 'helper ' + a.status, type: 'button', onclick: () => openSheet(s, a.id) },
          skin.id === 'goodboy' ? h('img', { src: ART('p_' + a.breed + '_walk'), alt: '', style: { height: '24px', width: '34px', objectFit: 'contain' } }) : h('span', { style: { fontSize: '20px' } }, a.status === 'working' ? '🛸' : a.status === 'failed' ? '💥' : '✅'),
          h('span', {}, h('b', {}, (skin.id === 'goodboy' ? BREED_NAME[a.breed] + ' · ' : '') + a.desc), h('small', {}, `${a.type} · ${a.steps} step${a.steps === 1 ? '' : 's'} · ${clock((a.end || Date.now()) - a.start)}${a.tokens ? ' · ' + kfmt(a.tokens) + ' tok' : ''}`)),
          h('span', { class: 'hs' }, a.status === 'working' ? L('helpersOut') : a.status === 'failed' ? 'came back early' : 'done'));
        return el;
      })));
    } },
    skills: { cls: 'w-skills', title: 'skills', count: s => s && s.skillsActive.size ? s.skillsActive.size + ' active' : '', render(b, s) {
      if (!s) return b.append(h('p', { class: 'empty' }, 'Start a project to see your skills.'));
      const used = s.skillsUsed, active = s.skillsActive;
      const init = s.init || {};
      const all = [...new Set([...(init.skills || []), ...((s.env && s.env.skills) || []), ...Object.keys(used)])];
      const cmds = (s.caps && s.caps.commands) || [];
      const fromCmds = cmds.filter(c => /skill|plugin/i.test(String(c.source || c.type || '')) || (c.description || '').startsWith('(')).map(c => c.name);
      const avail = [...new Set([...all, ...fromCmds])].filter(n => !used[n] && !active.has(n));
      const chip = (n, cls) => h('span', { class: 'skill ' + cls, title: cls === 'active' ? 'Working right now' : cls === 'used' ? 'Used this session' : 'Ready to use. Type /' + n }, n, used[n] ? h('span', { class: 'n' }, '×' + used[n]) : null);
      if (active.size) b.append(h('div', { class: 'skill-group' }, 'Active now'), h('div', { class: 'skill-grid' }, ...[...active].map(n => chip(n, 'active'))));
      if (Object.keys(used).length) b.append(h('div', { class: 'skill-group' }, 'Used this session'), h('div', { class: 'skill-grid' }, ...Object.keys(used).filter(n => !active.has(n)).map(n => chip(n, 'used'))));
      b.append(h('div', { class: 'skill-group' }, 'Available'), avail.length ? h('div', { class: 'skill-grid' }, ...avail.slice(0, 40).map(n => chip(n, ''))) : h('p', { class: 'empty' }, 'Skills you install show up here. Type / to see every command.'));
      const mcp = init.mcp_servers || [];
      if (mcp.length) b.append(h('div', { class: 'skill-group' }, 'Connected apps'), ...mcp.map(m => h('div', { class: 'mcp ' + (m.status === 'connected' ? 'ok' : m.status === 'pending' ? 'wait' : 'bad'), title: m.status }, h('i'), m.name, h('small', { style: { color: 'var(--dim)', marginLeft: 'auto' } }, m.status))));
    } },
    tokens: { cls: 'w-tokens', title: 'tokens', render(b, s) {
      if (!s || !s.msgSeen.size) return b.append(h('p', { class: 'empty' }, 'Once Claude starts, this shows which parts of the work used the most effort, so you can trim them later.'));
      const COLS = { setup: '#9a92c8', read: '#82c8ff', make: '#7ee8c8', edit: '#ffb68e', run: '#ffe08a', find: '#b8a2ff', web: '#ff92b4', help: '#f0a24a', app: '#9fe3ff', plan: '#e8d27a', think: '#c9b6ff', reply: '#8fe3b4', misc: '#c9c0ef' };
      const areas = Object.entries(s.areas).filter(([, a]) => a.tokens > 1).sort((x, y) => y[1].tokens - x[1].tokens);
      const total = areas.reduce((n, [, a]) => n + a.tokens, 0) || 1;
      const tin = s.tk.fresh + s.tk.cacheRead + s.tk.cacheWrite, hit = tin ? Math.round(s.tk.cacheRead / tin * 100) : 0;
      b.append(h('div', { class: 'tk-total' }, h('b', {}, kfmt(tin + s.tk.out)), h('small', {}, 'tokens this session')),
        h('div', { class: 'tk-bar' }, ...areas.map(([k, a]) => h('i', { style: { width: (a.tokens / total * 100) + '%', background: COLS[k] || '#c9c0ef' }, title: `${a.label}: ~${kfmt(a.tokens)}` }))),
        h('div', { class: 'tk-rows' }, ...areas.slice(0, 7).map(([k, a]) => h('div', { class: 'tk-row' }, h('i', { style: { background: COLS[k] || '#c9c0ef' } }), h('span', {}, a.label), h('b', {}, '~' + kfmt(a.tokens) + ' · ' + Math.round(a.tokens / total * 100) + '%')))));
      const heavy = Object.entries(s.items).sort((x, y) => y[1] - x[1]).slice(0, 4);
      if (heavy.length) b.append(h('div', { class: 'tk-heavy' }, h('b', {}, 'Heaviest so far'), h('ol', {}, ...heavy.map(([n, v]) => h('li', {}, n + ' · ~' + kfmt(v))))));
      b.append(h('div', { class: 'tk-split' }, h('span', {}, h('b', {}, kfmt(s.tk.fresh + s.tk.cacheWrite)), ' new reading'), h('span', {}, h('b', {}, kfmt(s.tk.cacheRead)), ' re-read from cache'), h('span', {}, h('b', {}, kfmt(s.tk.out)), ' written')),
        h('div', { class: 'tk-cache' }, `♻ ${hit}% of what Claude read was re-read from its short-term cache, which is cheaper and faster. The areas above leave cache re-reads out.`),
        h('div', { class: 'tk-note' }, 'Areas are estimates worked out from what each step sent back.'));
    } },
    context: { cls: 'w-context', title: 'context', render(b, s, el) {
      if (!s || !s.ctxUsed) return b.append(h('p', { class: 'empty' }, 'Shows how full Claude’s memory of this chat is, and when it will tidy up.'));
      const win = s.ctxWin || 200000, used = Math.min(s.ctxUsed, win), setup = Math.min(s.ctxBase || 0, used), chat = used - setup;
      const pct = Math.round(used / win * 100);
      const hist = s.ctxHist, grow = hist.length > 1 ? Math.max(1, (hist[hist.length - 1] - hist[0]) / (hist.length - 1)) : 0;
      const left = grow >= 500 ? Math.max(0, Math.floor((win - used) / grow)) : null;
      el.classList.toggle('hot', pct > 80);
      b.append(h('div', { class: 'ctx-big' }, h('b', {}, pct + '%'), h('small', {}, `${kfmt(used)} of ${kfmt(win)}`)),
        h('div', { class: 'tank' }, h('i', { style: { width: (setup / win * 100) + '%', background: '#9a92c8' } }), h('i', { style: { width: (chat / win * 100) + '%', background: 'var(--mint)' } })),
        h('div', { class: 'tank-legend' }, h('span', { style: { '--c': '#9a92c8' } }, 'Setup ' + kfmt(setup)), h('span', { style: { '--c': 'var(--mint)' } }, 'This chat ' + kfmt(chat)), h('span', { style: { '--c': 'var(--inset)' } }, 'Free ' + kfmt(win - used))),
        h('div', { class: 'ctx-hint' }, pct > 80 ? (skin.id === 'goodboy' ? 'Winston’s tummy is nearly full. He will nap (tidy his memory) soon. You can type /compact to do it now.' : 'Nearly full. Claude will tidy its memory soon. Type /compact to do it now.') : left != null ? `Room for about ${left} more step${left === 1 ? '' : 's'} like the recent ones.` : 'Plenty of room.'));
    } },
    inbox: { cls: 'w-inbox', title: 'inbox', count: () => { const n = allPending().length; return n ? String(n) : ''; }, render(b) {
      const list = allPending();
      if (!list.length) return b.append(h('p', { class: 'empty' }, 'Nothing is waiting for you. When any project asks for a yes or no, it shows up here so you can answer without switching.'));
      for (const { s, id, card } of list) {
        const title = card.querySelector('h3') ? card.querySelector('h3').textContent.replace(/^[!?🗺]/, '').trim() : 'Claude needs you';
        const btns = [...card.querySelectorAll('.actions button')];
        b.append(h('div', { class: 'inbox-item' },
          h('div', { class: 'ii-head' }, h('b', {}, s.info.title || base(s.info.cwd)), h('small', {}, title)),
          h('div', { class: 'mini-btns' },
            ...btns.slice(0, 3).map(btn => h('button', { class: 'btn btn-small ' + (btn.classList.contains('btn-mint') ? 'btn-mint' : 'btn-ghost'), type: 'button', onclick: () => btn.click() }, btn.textContent)),
            h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => { setActive(s.id); focusNeeds(); } }, 'Open ›'))));
      }
    } },
    statusline: { cls: 'w-statusline', title: 'statusline', render(b, s) {
      const mode = store.get('slMode', 'auto'), tpl = store.get('slTpl', DEFAULT_SL);
      const out = h('div', { class: 'sl-out' });
      const env = s && s.env, mine = env && env.statusLine;
      const useMine = mine && mode !== 'template';
      if (!s) out.textContent = 'Start a project to see your status line.';
      else if (useMine) { if (s.slText != null) out.innerHTML = ansi(s.slText) || '<span style="opacity:.6">(your status line printed nothing)</span>'; else { out.textContent = 'Running your status line…'; refreshStatusLine(s, true); } }
      else out.innerHTML = esc(fillTemplate(tpl, s));
      b.append(out);
      if (useMine && s.slErr) b.append(h('div', { class: 'sl-err' }, '⚠ Your status line said: ' + s.slErr.slice(0, 200), /jq/i.test(s.slErr) ? h('div', {}, 'It needs a small program called jq. To install it, open PowerShell and type ', h('code', {}, 'winget install jqlang.jq'), ', then restart Easy Mode.') : null));
      const tools = h('div', { class: 'sl-tools' });
      if (mine) tools.append(h('label', {}, h('input', { type: 'checkbox', checked: useMine ? true : null, onchange: e => { store.set('slMode', e.target.checked ? 'auto' : 'template'); renderWidgets(['statusline']); } }), ' Use my Claude Code status line'), h('small', { title: mine.command }, '(' + mine.scope + ')'));
      if (!useMine) {
        const inp = h('input', { type: 'text', value: tpl, title: 'Your status line template', onchange: e => { store.set('slTpl', e.target.value || DEFAULT_SL); renderWidgets(['statusline']); } });
        tools.append(inp, ...SL_TOKENS.map(t => h('span', { class: 'tok', title: 'Add ' + t, onclick: () => { inp.value += ' {' + t + '}'; store.set('slTpl', inp.value); renderWidgets(['statusline']); } }, '{' + t + '}')));
        if (!mine) tools.append(h('small', {}, 'Tip: a statusLine command in your Claude Code settings shows here too.'));
      }
      b.append(tools);
    } },
    env: { cls: 'w-env', title: 'env', render(b, s) {
      if (!s) return b.append(h('p', { class: 'empty' }, 'Start a project to see where Claude is working.'));
      const e = s.env || {}, init = s.init || {};
      const row = (k, v, title) => h('div', { class: 'kv' }, h('span', { class: 'k' }, k), h('span', { class: 'v', title: title || String(v || '') }, v == null || v === '' ? '—' : v));
      const ver = ccVersion(s);
      b.append(row('Folder', base(s.info.cwd), s.info.cwd),
        row('Git branch', e.branch ? e.branch + (e.changed ? ` · ${e.changed} changed` : ' · clean') : 'not a git repo'),
        row('Model', modelLabel(s)),
        row('Effort', s.info.effort || 'auto'), row('Safety', MODE_NAMES[s.info.mode] || s.info.mode),
        row('Output style', (s.caps && s.caps.output_style) || e.outputStyle || 'default'),
        row('Connected apps', (init.mcp_servers || []).length ? (init.mcp_servers || []).map(m => m.name).join(', ') : 'none'),
        row('Allow rules', (e.allow || []).length + ' allow · ' + (e.deny || []).length + ' deny'),
        row('Prompt cache', cacheNote(s)),
        row('Claude Code', ver ? ver + (versionLow(ver) ? ' · please update' : '') : '—'),
        row('Computer', e.os || '—'), row('Session', s.info.claudeSessionId ? String(s.info.claudeSessionId).slice(0, 8) + '…' : 'new', s.info.claudeSessionId || ''));
      b.append(h('div', { class: 'mini-btns' }, h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => api(`/api/session/${s.id}/open-folder`, {}) }, '📁 Open folder'), h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => loadEnv(s, true) }, '⟳ Refresh')));
    } },
    hooks: { cls: 'w-hooks', title: 'hooks', count: s => s && s.env ? String((s.env.hooks || []).length) : '', render(b, s) {
      if (!s) return b.append(h('p', { class: 'empty' }, 'Hooks are little programs Claude Code runs at moments like “before a tool” or “when done”.'));
      const hooks = (s.env && s.env.hooks) || [];
      if (s.hookLog.length) { b.append(h('div', { class: 'hook-ev' }, 'Just ran')); for (const x of s.hookLog.slice(-6).reverse()) b.append(h('div', { class: 'hook-log' }, h('span', { class: x.ok === false ? 'bad' : 'ok' }, x.ok === false ? '✕' : '✓'), h('span', {}, x.event + (x.name ? ' · ' + x.name : '')), h('small', { style: { marginLeft: 'auto', color: 'var(--dim)' } }, ago(x.t)))); }
      if (!hooks.length) b.append(h('p', { class: 'empty' }, 'No hooks set up yet. Hooks run your own commands at moments like “before a tool” or “when Claude finishes”.'));
      const byEv = {}; hooks.forEach(x => (byEv[x.event] = byEv[x.event] || []).push(x));
      for (const [ev, list] of Object.entries(byEv)) { b.append(h('div', { class: 'hook-ev' }, HOOK_NAMES[ev] ? `${ev} · ${HOOK_NAMES[ev]}` : ev)); for (const x of list) b.append(h('div', { class: 'hook', title: x.command }, base(x.command.split(' ').pop()) || x.command, h('small', {}, (x.matcher ? 'when ' + x.matcher + ' · ' : '') + x.scope + (x.async ? ' · runs in background' : '')))); }
      const files = (s.env && s.env.settings) || [];
      b.append(h('div', { class: 'mini-btns' }, ...files.slice(0, 4).map(f => h('button', { class: 'btn btn-small btn-ghost', type: 'button', title: f.path, onclick: () => api(`/api/session/${s.id}/open-file`, { path: f.path }).then(r => r.error ? toast(r.error, 'err') : toast('Opened in Notepad. Start a new chat after saving so Claude picks it up.', 'ok')) }, '✎ ' + f.scope))));
    } },
    memory: { cls: 'w-memory', title: 'memory', render(b, s) {
      if (!s) return b.append(h('p', { class: 'empty' }, 'CLAUDE.md files are notes Claude reads every time.'));
      const mem = (s.env && s.env.memory) || [];
      for (const m of mem) b.append(h('div', { class: 'kv' }, h('span', { class: 'k' }, m.scope), h('button', { class: 'v linkish', type: 'button', title: m.path, onclick: () => api(`/api/session/${s.id}/open-file`, { path: m.path }).then(r => r.error ? toast(r.error, 'err') : toast('Opened in Notepad.', 'ok')) }, m.exists ? `${base(m.path)} · ${m.lines} lines` : '+ create')));
      b.append(h('div', { class: 'mini-btns' }, h('button', { class: 'btn btn-small btn-mint', type: 'button', onclick: () => openModal('#teachModal') }, '📝 Teach Claude about you'), h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => fillPrompt('/memory ') }, '/memory')));
    } },
    usage: { cls: 'w-usage', title: 'usage', render(b, s) {
      const g = (label, pct, note, col) => h('div', { class: 'gauge' }, h('div', { class: 'gl' }, h('span', {}, label), h('small', {}, note)), h('div', { class: 'gb' }, h('i', { style: { width: Math.max(2, pct || 0) + '%', background: pct > store.get('warnAt', 80) ? 'var(--coral)' : col } })));
      if (!s) return b.append(h('p', { class: 'empty' }, 'Your plan limits and memory, at a glance.'));
      const r5 = s.rate.five_hour, r7 = s.rate.seven_day;
      const pc = pctOf;
      const when = (r, o) => r && r.resetsAt ? 'refills ' + new Date(r.resetsAt * 1000).toLocaleString([], o) : '';
      const ctx = ctxPct(s);
      b.append(g('5-hour limit', pc(r5), (pc(r5) ?? '—') + '% · ' + when(r5, { hour: 'numeric', minute: '2-digit' }), 'var(--peach)'),
        g('Weekly limit', pc(r7), (pc(r7) ?? '—') + '% · ' + when(r7, { weekday: 'short', hour: 'numeric' }), 'var(--lilac)'),
        g('Memory (context)', ctx, ctx + '% of ' + kfmt(s.ctxWin), 'var(--mint)'));
      if (!r5 && !r7) b.append(h('p', { class: 'empty' }, 'Limits appear after your first message.'));
      const sel = h('select', { onchange: e => { store.set('warnAt', +e.target.value); renderWidgets(['usage']); } }, ...[50, 70, 80, 90, 95].map(v => h('option', { value: v, selected: store.get('warnAt', 80) === v ? true : null }, v + '%')));
      b.append(h('div', { class: 'sl-tools' }, 'Warn me when a limit passes ', sel));
    } },
    timeline: { cls: 'w-timeline', title: 'timeline', render(b, s) {
      const list = s ? s.history.slice().reverse() : [];
      if (!list.length) return b.append(h('p', { class: 'empty' }, 'Every round with Claude is listed here: what you asked, how long it took and what it changed.'));
      for (const x of list.slice(0, 30)) b.append(h('div', { class: 'tl-row' }, h('b', { title: x.label }, (x.kind === 'fail' ? '✕ ' : x.kind === 'partial' ? '◐ ' : '✓ ') + x.label), h('span', {}, clock(x.dur)), h('small', {}, `${new Date(x.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · ${x.tools} steps · ${x.files} files${x.cost && !isPlanUser(s) ? ' · ' + money(x.cost) : ''}`)));
    } },
    files: { cls: 'w-files', title: 'files', render(b, s) {
      if (!s) return b.append(h('p', { class: 'empty' }, 'Your project’s files.'));
      const box = h('div', { class: 'tree' }, 'Loading…'); b.append(box);
      if (DEMO) { box.textContent = ''; for (const f of ['index.html', 'style.css', 'cats/', 'cats/mochi.jpg']) box.append(h('div', {}, (f.endsWith('/') ? '📁 ' : '📄 ') + f)); return; }
      api(`/api/session/${s.id}/files`).then(r => {
        box.innerHTML = '';
        const files = (r && r.files) || [];
        if (!files.length) { box.append(h('p', { class: 'empty' }, 'This folder is empty so far.')); return; }
        for (const f of files.slice(0, 300)) box.append(h('div', { style: { paddingLeft: (f.depth * 14 + 4) + 'px' }, title: f.path, onclick: () => { if (f.dir) return; if (PREVIEWABLE.test(f.path)) { s.previewPath = f.path; renderWidgets(['preview']); openViewer('preview'); } else fillPrompt('Look at ' + f.path + ' and '); } }, (f.dir ? '📁 ' : '📄 ') + base(f.path)));
      });
    } },
    notes: { cls: 'w-notes', title: 'notes', render(b, s) {
      const key = 'notes:' + (s ? s.info.cwd : '_');
      const ta = h('textarea', { class: 'notes-area', placeholder: 'Jot things down for this project. Only you see these, they stay on this computer.' });
      ta.value = store.get(key, ''); ta.addEventListener('input', () => store.set(key, ta.value));
      b.append(ta);
    } },
    prompts: { cls: 'w-prompts', title: 'prompts', render(b) {
      const list = store.get('prompts', DEFAULT_PROMPTS);
      for (const [i, p] of list.entries()) b.append(h('div', { class: 'prompt-item', title: p, onclick: () => fillPrompt(p) }, h('span', {}, p), h('button', { type: 'button', title: 'Remove', onclick: e => { e.stopPropagation(); list.splice(i, 1); store.set('prompts', list); renderWidgets(['prompts']); } }, '✕')));
      b.append(h('div', { class: 'mini-btns' }, h('button', { class: 'btn btn-small btn-mint', type: 'button', onclick: () => { const t = $('#prompt').value.trim(); if (!t) return toast('Type a message first, then save it here.'); list.unshift(t); store.set('prompts', list.slice(0, 40)); renderWidgets(['prompts']); toast('Saved', 'ok'); } }, '+ Save what I typed')));
    } },
    agents: { cls: 'w-agents', title: 'agents', render(b, s) {
      const list = (s && s.caps && s.caps.agents) || [];
      if (!list.length) return b.append(h('p', { class: 'empty' }, 'Helper agents you can call by name show up here.'));
      for (const a of list) { const name = a.name || a.agentType || String(a); b.append(h('div', { class: 'agent-row' }, h('div', {}, h('b', {}, name), h('small', {}, String(a.description || '').slice(0, 140))), h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => fillPrompt(`Use the ${name} agent to `) }, 'Ask'))); }
    } },
    tally: { cls: 'w-tally', title: 'tally', render(b, s) {
      const entries = s ? Object.entries(s.tally).sort((a, b2) => b2[1] - a[1]) : [];
      if (!entries.length) return b.append(h('p', { class: 'empty' }, 'Every kind of step Claude takes is counted here.'));
      b.append(h('ul', { class: 'power-list' }, ...entries.map(([k, n]) => { const [c, , label] = GEM[k] || GEM.misc; return h('li', { class: 'power' }, h('i', { class: 'gem', style: { '--gc': c } }), h('span', {}, label), h('b', {}, '×' + n)); })));
    } },
  };
  const WIDGET_INFO = {
    chat: 'Messages and the message box', scene: 'The animated world', inbox: 'Every question waiting, in all projects', statusline: 'Your status line, or build one', env: 'Folder, git branch, model, versions',
    player: 'Account, project and model', stats: 'Rounds, time, tokens, cost', quests: 'Claude’s to-do list', saves: 'Save points for Undo', changes: 'Files Claude changed',
    preview: 'See pages, documents, pictures', helpers: 'Sub-agents, click to open', skills: 'Skills used and active now', tokens: 'Where the tokens go',
    context: 'How full the memory is', usage: '5-hour, weekly and memory gauges', hooks: 'Your hooks and what just ran', memory: 'CLAUDE.md files',
    timeline: 'Every round: time, steps, files', files: 'Browse the project', notes: 'Your own notes for this project', prompts: 'Saved prompts, one click', agents: 'Helper agents you can call', tally: 'Count of each kind of step',
  };
  const SIZES = { chat: [6, 14, 4, 8], scene: [6, 6, 3, 3], statusline: [6, 2, 3, 2], env: [3, 9, 2, 4], inbox: [3, 6, 2, 3] };
  const sizeOf = id => SIZES[id] || [3, 8, 2, 3];
  const P = (id, x, y, w, h) => ({ id, x, y, w, h });
  const PRESETS = {
    simple: { name: 'Simple', expert: false, detail: 'results', items: [P('scene', 0, 0, 8, 7), P('chat', 0, 7, 8, 17), P('quests', 8, 0, 4, 8), P('preview', 8, 8, 4, 10), P('changes', 8, 18, 4, 6)] },
    builder: { name: 'Builder', expert: false, detail: 'results', items: [P('chat', 0, 0, 5, 24), P('preview', 5, 0, 7, 16), P('scene', 5, 16, 4, 8), P('changes', 9, 16, 3, 8)] },
    power: { name: 'Power user', expert: true, detail: 'steps', items: [P('context', 0, 0, 3, 7), P('tokens', 0, 7, 3, 10), P('env', 0, 17, 3, 7), P('statusline', 3, 0, 6, 2), P('scene', 3, 2, 6, 5), P('chat', 3, 7, 6, 17), P('inbox', 9, 0, 3, 5), P('helpers', 9, 5, 3, 7), P('skills', 9, 12, 3, 6), P('hooks', 9, 18, 3, 6)] },
    focus: { name: 'Focus', expert: false, detail: 'results', items: [P('statusline', 2, 0, 8, 2), P('chat', 2, 2, 8, 22)] },
    show: { name: 'Showtime', expert: false, detail: 'steps', items: [P('scene', 0, 0, 8, 11), P('chat', 0, 11, 8, 13), P('helpers', 8, 0, 4, 8), P('skills', 8, 8, 4, 7), P('quests', 8, 15, 4, 9)] },
  };
  let layout = store.get('board', null) || { preset: 'simple', expert: false, bar: true, items: PRESETS.simple.items };
  const widgetEls = {};
  let grid = null;
  function makeBlock(id) {
    if (id === 'scene') { const el = h('section', { class: 'panel w-scene', 'data-w': id, 'data-label': 'Scene' }); el.append($('#stage')); return el; }
    if (id === 'chat') { const el = h('section', { class: 'panel w-chat', 'data-w': id, 'data-label': 'Chat' }); el.append($('#chatPart')); return el; }
    const W = WIDGETS[id]; if (!W) return null;
    const el = h('section', { class: 'panel ' + W.cls, 'data-w': id, 'data-label': L(W.title) },
      h('header', { class: 'ph' }, h('span', { class: 'pt' }, L(W.title)), h('span', { class: 'pc' }), h('button', { class: 'pm', type: 'button', title: 'Hide this block', onclick: () => hideBlock(id) }, '✕')),
      h('p', { class: 'psub' }, Lsub(W.title)), h('div', { class: 'pb' }));
    widgetEls[id] = el; return el;
  }
  function buildColumns() {
    for (const k in widgetEls) delete widgetEls[k];
    // put the scene and chat back in their holder before the board is rebuilt
    $('#scenePart').append($('#stage')); $('#parts').append($('#chatPart'));
    if (!layout.items.some(i => i.id === 'chat')) layout.items.push(P('chat', 0, 0, 6, 14));
    if (!grid) grid = window.ByteGrid.create($('#grid'), { onChange: items => { layout.items = items; layout.preset = 'custom'; store.set('board', layout); markPresets(); }, minSize: id => sizeOf(id).slice(2) });
    grid.set(layout.items, id => {
      const el = makeBlock(id); if (!el) return null;
      if (id !== 'chat') setTimeout(() => { const g = el.querySelector('.cell-grip'); if (g && !g.querySelector('.gx')) g.append(h('button', { class: 'gx', type: 'button', title: 'Hide this block', onpointerdown: e => e.stopPropagation(), onclick: e => { e.stopPropagation(); hideBlock(id); } }, '✕')); });
      return el;
    });
    document.body.classList.toggle('expert-on', !!layout.expert);
    document.body.classList.toggle('no-bar', layout.bar === false);
    applyDetail();
    stackForSmall();
    setTimeout(() => World.resize(), 260);
  }
  const detailOf = () => layout.detail || (layout.expert ? 'steps' : 'results');
  function applyDetail() {
    const calm = detailOf() === 'results';
    document.body.classList.toggle('calm', calm);
    const b = $('#detailBtn');
    if (b) { b.querySelector('.lbl').textContent = calm ? 'Just results' : 'Every step'; b.querySelector('.ico').textContent = calm ? '✨' : '🔎'; b.title = calm ? 'Showing just the results. Click to see every step Claude takes.' : 'Showing every step. Click to see just the results.'; b.setAttribute('aria-pressed', calm ? 'true' : 'false'); }
  }
  function setDetail(v) { layout.detail = v; store.set('board', layout); applyDetail(); toast(v === 'results' ? 'Just the results. Steps are tucked away, tap “show steps” to peek.' : 'Every step. You see everything Claude does.', 'ok'); scrollFeed(true); }
  function stackForSmall() { const small = matchMedia('(max-width: 820px)').matches; $('#grid').classList.toggle('stacked', small); document.body.classList.toggle('phone', small); if (grid) grid.layout(); setTab(store.get('tab', 'chat'), true); }
  // On a phone, one tab at a time: Chat, Scene, Lists (every other block) or Preview.
  function setTab(t, quiet) {
    const has = id => layout.items.some(i => i.id === id);
    if (t === 'preview' && !has('preview')) t = 'chat';
    if (t === 'scene' && !has('scene')) t = 'chat';
    store.set('tab', t); $('#grid').dataset.tab = t;
    $$('#phoneTabs button').forEach(b => { b.classList.toggle('on', b.dataset.tab === t); b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false'); b.hidden = (b.dataset.tab === 'preview' && !has('preview')) || (b.dataset.tab === 'scene' && !has('scene')); });
    if (!quiet) { scrollTo({ top: 0 }); if (t === 'scene') setTimeout(() => World.resize(), 60); if (t === 'chat') scrollFeed(true); }
  }
  addEventListener('resize', stackForSmall);
  function hideBlock(id) { if (id === 'chat') return; layout.items = layout.items.filter(i => i.id !== id); layout.preset = 'custom'; store.set('board', layout); buildColumns(); grid.compact(); renderAll(); renderAddMenu(); toast('Hidden. Bring it back with Customise → Add a block.', 'ok', { label: 'Bring back', fn: () => addBlock(id) }); }
  function addBlock(id) {
    if (layout.items.some(i => i.id === id)) return;
    const [w, hh] = sizeOf(id); const el = makeBlock(id); if (!el) return;
    if (id !== 'chat') { const x = h('button', { class: 'gx', type: 'button', title: 'Hide this block', onpointerdown: e => e.stopPropagation(), onclick: e => { e.stopPropagation(); hideBlock(id); } }, '✕'); setTimeout(() => { const g = el.querySelector('.cell-grip'); if (g) g.append(x); }); }
    grid.add(id, w, hh, el); layout.items = grid.get(); layout.preset = 'custom'; store.set('board', layout);
    renderWidgets(); renderAddMenu(); if (id === 'scene') setTimeout(() => World.resize(), 260);
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function renderWidgets(only) {
    const s = S(activeId);
    for (const [id, el] of Object.entries(widgetEls)) {
      if (only && !only.includes(id)) continue;
      const W = WIDGETS[id], body = el.querySelector('.pb');
      // Blocks with their own state (typing, scroll, an iframe) only redraw when what they show changes.
      const sig = SIGS[id] && SIGS[id](s);
      if (sig != null && body.dataset.sig === sig) continue;
      if (body.contains(document.activeElement) && /^(statusline|notes|prompts|usage)$/.test(id)) continue;
      body.innerHTML = '';
      el.querySelector('.pc').textContent = W.count ? W.count(s) : '';
      try { W.render(body, s, el); } catch (e) { console.error(id, e); }
      el.classList.toggle('is-empty', body.children.length === 1 && body.firstElementChild.classList.contains('empty'));
      if (sig != null) body.dataset.sig = sig;
    }
  }
  const sigPreview = s => s ? s.id + '|' + (s.previewPath || '') + '|' + previewables(s).join(',') : '';
  const SIGS = {
    preview: sigPreview,
    notes: s => s ? s.info.cwd : '_',
    files: s => s ? s.id + '|' + s.files.map(f => f.file + f.status).join(',') + '|' + s.touched.length : '_',
  };
  // Redraw at most once per frame, however many events arrive.
  const want = { status: false, world: false, live: false, needs: false, board: false };
  let rafQueued = false;
  function scheduleRender(...parts) {
    for (const p of parts) want[p] = true;
    if (rafQueued) return;
    rafQueued = true;
    requestAnimationFrame(() => {
      rafQueued = false;
      const w = { ...want }; for (const k in want) want[k] = false;
      if (w.status) renderStatus(); if (w.world) renderWorld(); if (w.live) renderLiveWidgets(); if (w.needs) renderNeedsBar(); if (w.board) renderBoard();
    });
  }
  const renderLiveWidgets = () => { renderWidgets(['quests', 'helpers', 'skills', 'tokens', 'context', 'stats', 'tally', 'player', 'usage', 'inbox', 'timeline']); const s = S(activeId); if (s && !store.get('slMode', 'auto').startsWith('t')) refreshStatusLine(s); else renderWidgets(['statusline']); };

  /* ---------------- preview: pages, documents, spreadsheets, pictures ---------------- */
  function previewUrl(s, p) { return `${PREVIEW_ORIGIN}/preview/${s.id}.${s.info.previewKey}/${p.split('/').map(encodeURIComponent).join('/')}`; }
  function fillPreview(wrap, s, p) {
    wrap.innerHTML = '';
    if (DEMO) { const f = h('iframe', { title: 'Preview', sandbox: 'allow-scripts allow-same-origin allow-forms' }); f.srcdoc = Demo.previewHtml(p); wrap.append(f); return; }
    if (!PREVIEW_ORIGIN) return;
    if (/\.html?$/i.test(p)) { wrap.append(h('iframe', { title: 'Preview', src: previewUrl(s, p), sandbox: 'allow-scripts allow-same-origin allow-forms' })); return; }
    const doc = h('div', { class: 'doc-view' }, 'Loading…'); wrap.append(doc);
    if (/\.(png|jpe?g|gif|webp|svg)$/i.test(p)) { doc.innerHTML = ''; doc.append(h('img', { src: previewUrl(s, p), alt: p })); return; }
    fetch(previewUrl(s, p)).then(r => r.text()).then(t => {
      if (/\.csv$/i.test(p)) {
        const rows = t.trim().split(/\r?\n/).slice(0, 300).map(l => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map(c => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')));
        doc.innerHTML = ''; doc.append(h('table', {}, h('thead', {}, h('tr', {}, ...rows[0].map(c => h('th', {}, c)))), h('tbody', {}, ...rows.slice(1).map(r => h('tr', {}, ...r.map(c => h('td', {}, c)))))));
      } else if (/\.md$/i.test(p)) doc.innerHTML = '<div class="md">' + md(t) + '</div>';
      else { doc.innerHTML = ''; doc.append(h('pre', { style: { whiteSpace: 'pre-wrap', margin: 0 } }, t.slice(0, 200000))); }
    }).catch(() => { doc.textContent = 'Could not load this file.'; });
  }
  function loadPreview() { const s = S(activeId); const w = widgetEls.preview && widgetEls.preview.querySelector('.preview-wrap'); if (s && w && s.previewPath) fillPreview(w, s, s.previewPath); }
  async function showDiff(file) {
    const s = S(activeId); if (!s) return;
    const r = await api(`/api/session/${s.id}/diff`, { file });
    const pre = $('#diffView'); if (!pre) return;
    paintDiff(pre, r.diff); pre.classList.remove('hidden');
  }
  function paintDiff(pre, diff) {
    pre.innerHTML = '';
    for (const l of String(diff || (DEMO ? 'The demo does not keep real files.' : 'No changes to show.')).split('\n').slice(0, 2000)) pre.append(h('span', { class: /^(\+\+\+|---|diff |index |new file|deleted file|similarity|rename )/.test(l) ? 'meta' : l.startsWith('@@') ? 'hunk' : l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : '' }, l || ' '));
  }
  function openViewer(kind, file) {
    const s = S(activeId); if (!s) return;
    const v = $('#viewer'), body = $('#viewerBody');
    body.innerHTML = ''; v.classList.remove('hidden');
    $('#viewerSeg').classList.toggle('hidden', kind !== 'preview');
    if (kind === 'preview') {
      $('#viewerTitle').textContent = s.previewPath || 'Preview';
      const wrap = h('div', { class: 'preview-wrap', style: { aspectRatio: 'auto', width: '100%', height: '100%', margin: 0 } }); body.append(wrap);
      if (s.previewPath) fillPreview(wrap, s, s.previewPath);
      $$('#viewerSeg button').forEach(b => { b.classList.toggle('on', b.dataset.w === '100%'); b.onclick = () => { $$('#viewerSeg button').forEach(x => x.classList.toggle('on', x === b)); wrap.style.width = b.dataset.w; }; });
      $('#viewerReload').onclick = () => fillPreview(wrap, s, s.previewPath);
    } else {
      $('#viewerTitle').textContent = 'What changed in ' + base(file);
      const pre = h('pre', { class: 'diff' }); body.append(pre);
      api(`/api/session/${s.id}/diff`, { file }).then(r => paintDiff(pre, r.diff));
      $('#viewerReload').onclick = () => api(`/api/session/${s.id}/diff`, { file }).then(r => paintDiff(pre, r.diff));
    }
  }

  /* ---------------- helper drill-in ---------------- */
  let sheetFor = null;
  function openSheet(s, agentId) { sheetFor = { sid: s.id, aid: agentId }; $('#helperSheet').classList.remove('hidden'); renderSheet(); }
  function renderSheetIfOpen(s, a) { if (sheetFor && sheetFor.sid === s.id && sheetFor.aid === a.id) renderSheet(); if (s.id === activeId) renderWidgets(['helpers']); }
  function renderSheet() {
    if (!sheetFor) return;
    const s = S(sheetFor.sid), a = s && s.agents.get(sheetFor.aid); if (!a) return;
    const av = $('#sheetAvatar');
    if (skin.id === 'goodboy') { const im = new Image(); im.onload = () => { av.width = im.width; av.height = im.height; av.getContext('2d').drawImage(im, 0, 0); }; im.src = ART('p_' + a.breed + (a.status === 'working' ? '_walk' : '_stick')); }
    else paintBot(av);
    $('#sheetCrumb').textContent = (s.info.title || 'Project') + ' › ' + (skin.id === 'goodboy' ? 'the pack' : 'helpers');
    $('#sheetTitle').textContent = (skin.id === 'goodboy' ? BREED_NAME[a.breed] + ': ' : '') + a.desc;
    $('#sheetMeta').innerHTML = '';
    $('#sheetMeta').append(h('span', {}, a.status === 'working' ? '● ' + L('helpersOut') : a.status === 'failed' ? '✕ came back early' : '✓ done'), h('span', {}, a.type), h('span', {}, a.steps + ' steps'), h('span', {}, clock((a.end || Date.now()) - a.start)), a.tokens ? h('span', {}, '~' + kfmt(a.tokens) + ' tokens') : null);
    const body = $('#sheetBody'); body.innerHTML = '';
    if (a.prompt) body.append(h('h4', {}, 'What it was asked'), h('div', { class: 'prompt-box md', html: md(a.prompt) }));
    body.append(h('h4', {}, 'What it did'));
    if (!a.log.length) body.append(h('p', { class: 'empty' }, 'Nothing yet…'));
    for (const e of a.log) {
      if (e.say) body.append(h('div', { class: 'helper-say' }, '“' + e.say.slice(0, 500) + '”'));
      else { const t = s.tools.get(e.id); const [c, tag] = GEM[e.kind] || GEM.misc; body.append(h('div', { class: 'tool ' + (t && t.row.classList.contains('running') ? 'running' : 'ok'), style: { '--gcol': c } }, h('i', { class: 'gem' }), h('span', { class: 'txt' }, e.text), h('span', { class: 'tag' }, tag), h('span', { class: 'st' }))); }
    }
    if (a.result) body.append(h('h4', {}, 'What it brought back'), h('div', { class: 'report-box md', html: md(a.result.slice(0, 6000)) }));
  }

  /* ---------------- usage rings ---------------- */
  function ring(pct, col, label, size = 26) {
    const r = size / 2 - 3, C = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct || 0));
    const hot = p >= store.get('warnAt', 80);
    return h('span', { class: 'ring' + (hot ? ' hot' : ''), html: `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg" style="stroke:${hot ? 'var(--coral)' : col}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p / 100)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg><b>${label}</b>` });
  }
  function renderRings() {
    const box = $('#usageRings'); if (!box) return;
    const s = S(activeId) || [...sessions.values()].find(x => x.rate && (x.rate.five_hour || x.rate.seven_day));
    const r5 = s && s.rate.five_hour, r7 = s && s.rate.seven_day, p5 = pctOf(r5), p7 = pctOf(r7);
    box.innerHTML = ''; box.classList.toggle('hidden', p5 == null && p7 == null);
    const when = (r, o) => r && r.resetsAt ? ', refills ' + new Date(r.resetsAt * 1000).toLocaleString([], o) : '';
    if (p5 != null) box.append(Object.assign(ring(p5, 'var(--peach)', '5h'), { title: `5-hour limit: ${p5}% used${when(r5, { hour: 'numeric', minute: '2-digit' })}` }));
    if (p7 != null) box.append(Object.assign(ring(p7, 'var(--lilac)', 'wk'), { title: `Weekly limit: ${p7}% used${when(r7, { weekday: 'short', hour: 'numeric' })}` }));
  }

  /* ---------------- board, status, composer, world ---------------- */
  function renderBoard() {
    const nav = $('#board'); nav.innerHTML = '';
    let i = 0;
    for (const s of sessions.values()) {
      i++;
      const st = stateOf(s);
      const label = stateLabel(s);
      const av = h('canvas'); paintAvatar(av);
      const card = h('button', { class: `sess s-${st}` + (s.id === activeId ? ' active' : ''), type: 'button', 'data-sid': s.id, title: s.info.cwd + (i <= 9 ? `  (Alt+${i})` : '') },
        av, h('span', { class: 'sn', title: 'Double-click to rename', ondblclick: e => { e.stopPropagation(); const n = prompt('Name this project', s.info.title || base(s.info.cwd)); if (n && n.trim()) { s.info.title = n.trim(); const names = store.get('names', {}); names[s.info.cwd] = s.info.title; store.set('names', names); renderBoard(); } } }, (store.get('names', {})[s.info.cwd]) || s.info.title || base(s.info.cwd)), h('span', { class: 'st' }, label),
        h('span', { class: 'sx', title: 'Close', role: 'button', onclick: e => { e.stopPropagation(); closeSession(s.id); } }, '✕'),
        s.waiting > 1 ? h('span', { class: 'badge' }, String(s.waiting)) : null,
        ctxPct(s) >= 50 ? Object.assign(ring(ctxPct(s), 'var(--mint)', '', 18), { className: 'ring card-ring', title: 'Memory ' + ctxPct(s) + '% full' }) : null);
      card.addEventListener('click', () => setActive(s.id));
      nav.append(card);
    }
    nav.append(h('button', { class: 'sess sess-new', type: 'button', onclick: () => openNew() }, L('newProject')));
  }

  function renderStatus() {
    const s = S(activeId);
    renderRings();
    const cp = ctxPct(s);
    $('#ctxBar').style.width = cp + '%'; $('#ctxPct').textContent = cp + '%';
    $('#ctxBar').parentElement.classList.toggle('hot', cp > 80);
    const rate = (key, bar, pct, wrap, reset) => {
      const r = s && s.rate[key];
      $(wrap).classList.toggle('hidden', !r); if (!r) return;
      const u = pctOf(r);
      $(bar).style.width = (u ?? 0) + '%'; $(pct).textContent = u == null ? (r.status === 'rejected' ? 'MAX' : 'OK') : u + '%';
      $(bar).parentElement.classList.toggle('hot', (u ?? 0) > 80 || r.status !== 'allowed');
      $(reset).textContent = r.resetsAt ? 'refills ' + new Date(r.resetsAt * 1000).toLocaleString([], key === 'five_hour' ? { hour: 'numeric', minute: '2-digit' } : { weekday: 'short' }) : '';
    };
    rate('five_hour', '#fiveBar', '#fivePct', '#fiveWrap', '#fiveReset');
    rate('seven_day', '#weekBar', '#weekPct', '#weekWrap', '#weekReset');
    const plan = isPlanUser(s);
    $('#hudCost').textContent = money(s ? s.cost : 0); $('#sbCost').textContent = money(s ? s.cost : 0);
    $('#sbCostNote').textContent = plan ? 'covered by your plan' : '';
    $('#hudCostWrap').classList.toggle('hidden', plan || !s); $('#sbCostWrap').classList.toggle('hidden', plan || !s);
    $('#hudCostWrap').title = plan ? 'Covered by your Claude plan. This is what it would cost on the API.' : 'What this session has cost';
    const modeSel = $('#modeSel'); modeSel.value = s ? s.info.mode || 'default' : 'default'; modeSel.disabled = !s;
    const caps = s && s.caps, models = caps && Array.isArray(caps.models) ? caps.models : [];
    const modelSel = $('#modelSel'), effSel = $('#effortSel');
    if (modelSel.dataset.sig !== JSON.stringify(models.map(m => m.value))) {
      modelSel.innerHTML = ''; modelSel.dataset.sig = JSON.stringify(models.map(m => m.value));
      if (!models.length) modelSel.append(h('option', { value: '' }, 'Default'));
      for (const m of models) modelSel.append(h('option', { value: m.value === 'default' ? '' : m.value, title: m.description || '' }, m.displayName || m.value));
    }
    modelSel.value = s && s.info.model ? s.info.model : ''; modelSel.disabled = !s;
    $('#modelReal').textContent = s && !s.info.model && realModel(s) ? '→ ' + prettyModel(realModel(s)) : '';
    const cur = models.find(m => (m.value === 'default' ? '' : m.value) === modelSel.value) || models[0];
    const levels = cur && cur.supportsEffort ? (cur.supportedEffortLevels || []) : [];
    if (effSel.dataset.sig !== levels.join()) { effSel.innerHTML = ''; effSel.dataset.sig = levels.join(); effSel.append(h('option', { value: '' }, 'Auto')); for (const l of levels) effSel.append(h('option', { value: l }, cap(l))); }
    effSel.value = s && s.info.effort ? s.info.effort : ''; effSel.disabled = !s || !levels.length;
    const autoOK = !cur || cur.supportsAutoMode !== false;
    const autoOpt = modeSel.querySelector('option[value=auto]'); if (autoOpt) autoOpt.hidden = !autoOK;
    $('#autoChoice').classList.toggle('hidden', !autoOK);
  }
  function renderComposer() {
    const s = S(activeId), busy = !!(s && s.busy);
    $('#stopBtn').classList.toggle('hidden', !busy);
    $('#prompt').placeholder = !s ? 'Start a new project first…' : s.waiting ? 'Answer the question above first, or type to tell Claude something else…' : busy ? L('working') + ' You can type your next message.' : L('placeholder');
    $('#undoBtn').disabled = !s || !(s.info.checkpoints || []).length || busy || !!(s.info.undo && s.info.undo.disabled);
    $('#termBtn').disabled = !s;
  }
  function renderSceneAsk(c) {
    const box = $('#sceneAsk'); if (!box) return;
    const inScene = layout.items.some(i => i.id === 'scene');
    box.classList.toggle('hidden', !c || !inScene);
    if (!c || !inScene) { box._card = null; return; }
    if (box._card === c) return;
    box._card = c; box.innerHTML = '';
    const btns = [...c.querySelectorAll('.actions button')];
    const keyFor = b => b.classList.contains('btn-mint') || b.classList.contains('btn-danger') ? 'Y' : b.classList.contains('btn-outline-sky') ? 'A' : b.classList.contains('btn-outline-rose') ? 'N' : '';
    const isQuestion = c.classList.contains('card-plan'); // questions and plans need reading, so open them
    box.append(h('b', {}, c.querySelector('h3').textContent.replace(/^[!?🗺]/, '').trim()),
      isQuestion ? h('div', { class: 'sa-row' }, h('button', { class: 'btn btn-small btn-mint', type: 'button', onclick: () => focusNeeds() }, 'Open it ›'))
        : h('div', { class: 'sa-row' }, ...btns.filter(b => keyFor(b)).map(b => h('button', { class: 'btn btn-small ' + [...b.classList].filter(x => /^btn-/.test(x)).join(' '), type: 'button', title: 'Key: ' + keyFor(b), onclick: () => b.click() }, h('kbd', {}, keyFor(b)), ' ', { Y: b.classList.contains('btn-danger') ? 'Yes, I’m sure' : 'Yes', A: 'Always', N: 'No' }[keyFor(b)])),
          h('button', { class: 'btn btn-small btn-ghost', type: 'button', title: 'Show the full question in the chat', onclick: () => focusNeeds() }, '…')));
  }
  function renderNeedsBar() {
    const s = S(activeId), bar = $('#needsBar');
    const nNeeds = allPending().length; const badge = $('#tabBadge'); if (badge) { badge.textContent = nNeeds ? String(nNeeds) : ''; badge.hidden = !nNeeds; }
    const c = s && [...s.cards.values()].find(x => x.classList.contains('pending'));
    bar.classList.toggle('hidden', !c);
    renderSceneAsk(c);
    if (c) { const t = L('waitSay') + ': ' + c.querySelector('h3').textContent.replace(/^[!?🗺]/, '').trim(); $('#needsText').textContent = t; $('#needsShort').textContent = c.querySelector('h3').textContent.replace(/^[!?🗺]/, '').replace(/^\S+\s/, '').replace(/^Claude wants to /, '').trim(); if ($('#srLive').textContent !== t) $('#srLive').textContent = t; }
  }
  function renderWorld() {
    const s = S(activeId);
    const st = stateOf(s);
    let chip = L('ready'), sayTxt = L('hello');
    if (s) {
      sayTxt = s.say || (skin.id === 'goodboy' ? 'Woof! Ready when you are.' : 'Ready when you are.');
      chip = stateLabel(s);
      World.setState(st === 'needs' ? 'wait' : st === 'working' ? 'run' : (st === 'error' || st === 'login') ? 'error' : World.state === 'done' ? 'done' : 'idle');
    } else World.setState('sleep');
    const hc = $('#hudStage'); hc.textContent = chip; hc.className = 'hud-chip' + (st === 'needs' ? ' needs' : st === 'done' ? ' done' : st === 'partial' ? ' partial' : '');
    const sayEl = $('#worldSay'); sayEl.textContent = sayTxt; sayEl.classList.toggle('wait', st === 'needs');
    // the waiting game: offer it while Claude works
    const playing = World.game && World.game.on;
    const pb = $('#playBtn'); pb.textContent = L('play'); pb.classList.toggle('hidden', !(s && s.busy && !s.waiting) || playing || !layout.items.some(i => i.id === 'scene'));
    if (playing) { World.pauseGame(st === 'needs'); $('#gameMsg').textContent = st === 'needs' ? L('paused') : World.game.over ? L('gameOver') : ''; }
    renderComposer();
  }
  // One gentle tick a second: only the time labels change, nothing is rebuilt.
  let tickN = 0;
  setInterval(() => {
    tickN++;
    for (const el of $$('#board .sess[data-sid]')) { const x = S(el.dataset.sid); if (x && x.busy) el.querySelector('.st').textContent = stateLabel(x); }
    const s = S(activeId);
    if (s && s.busy && !s.waiting) $('#hudStage').textContent = stateLabel(s);
    if (s && s.busy && tickN % 2 === 0) renderWidgets(['stats', 'helpers']);
    // Something waiting? Nudge again every so often (Settings: bell menu), and flash the tab title.
    const waiting = [...sessions.values()].filter(x => stateOf(x) === 'needs');
    const every = store.get('remind', 75);
    for (const x of waiting) if (live && every && Date.now() - (x.lastNag || 0) > every * 1000) { x.lastNag = Date.now(); Sound.play('wait'); }
    if (waiting.length && document.hidden) document.title = tickN % 2 ? '🔔 ' + (waiting[0].info.title || 'Claude') + ' needs you' : '(' + waiting.length + ') Easy Mode';
    else if (tickN % 2 === 0 && /^🔔/.test(document.title)) updateAttention();
  }, 1000);

  /* ---------------- actions ---------------- */
  async function sendPrompt() {
    const p = $('#prompt'), text = p.value.trim(), s = S(activeId);
    if (!s) { openNew(); return; }
    if (!text && !pending.length) return;
    if (text === '/' || (/^\/[\w:-]*$/.test(text) && slashItems.length && !(s.caps && (s.caps.commands || []).some(c => '/' + c.name === text)))) { updateSlash(true); return; }
    if (text === '/context') { const w = widgetEls.context; if (w) { w.scrollIntoView({ behavior: 'smooth' }); w.classList.add('hot'); setTimeout(() => w.classList.remove('hot'), 2000); } }
    const attachments = pending.map(a => ({ name: a.name, type: a.type, data: a.data }));
    pending.forEach(a => { if (a.url) imgCache.set(a.name, a.url); });
    if (text) { const past = store.get('sent', []).filter(x => x !== text); past.unshift(text); store.set('sent', past.slice(0, 60)); }
    histAt = -1; draft = '';
    pending = []; renderAttach(); p.value = ''; autosize(); hideSlash();
    unlockAudio();
    const r = await api(`/api/session/${s.id}/send`, { text, attachments });
    if (r && r.error) toast(r.error, 'err');
  }
  async function undoTo(cp) {
    const s = S(activeId); if (!s) return;
    const ok = await confirmBox(skin.id === 'goodboy' ? 'Dig up this bone?' : 'Undo to this save point?', `Your project files go back to how they were before “${cp.label}”. Anything Claude changed after that is rolled back. You can press Redo straight after if you change your mind.`, '↶ Yes, undo');
    if (!ok) return;
    const r = await api(`/api/session/${s.id}/undo`, { checkpoint: cp.id });
    if (r && r.error) toast(r.error, 'err'); else if (DEMO) { s.files = []; s.previewPath = ''; s.todos = []; renderAll(); }
  }
  async function redo() { const s = S(activeId); if (!s) return; const r = await api(`/api/session/${s.id}/redo`, {}); if (r && r.error) toast(r.error, 'err'); }
  function setMode(mode) {
    const s = S(activeId); if (!s) return;
    if (mode === 'bypassPermissions' && s.info.mode !== mode) {
      confirmBox('Turn on No limits?', 'Claude will do anything without asking, including deleting files and running any command. Only use this if you know what you are doing. Undo still works for files in this folder.', 'Turn it on').then(ok => { if (ok) { s.info.mode = mode; api(`/api/session/${s.id}/mode`, { mode }); } renderStatus(); });
      return;
    }
    s.info.mode = mode; api(`/api/session/${s.id}/mode`, { mode }); renderStatus();
    toast('Safety: ' + ({ default: 'Ask me first', acceptEdits: 'Edit freely', plan: 'Plan first', auto: 'Autopilot', dontAsk: 'Only what I allowed before', bypassPermissions: 'No limits' }[mode] || mode));
  }
  async function closeSession(id) {
    const s = S(id);
    if (s && s.busy) { const ok = await confirmBox('Close this project?', 'Claude is still working on it. Closing stops it.', 'Close it'); if (!ok) return; }
    const r = await api(`/api/session/${id}/close`, {});
    if (DEMO && r.ok) onApp(id, { type: 'closed' });
  }
  async function startSession(cwd, resume, trust) {
    const mode = (document.querySelector('input[name=safety]:checked') || {}).value || 'default';
    const r = await api('/api/session/start', { cwd, mode, resume, trust });
    if (r.needsTrust) return askTrust(cwd, resume, r.risks);
    if (r.error) { toast(r.error, 'err'); return; }
    closeModals();
    const ns = ensure(r.session.id, r.session);
    if (resume) { ns.welcomed = true; ns.feed.append(h('div', { class: 'sys-note' }, '▶ Continuing your last chat. Claude remembers it, even though the old messages are not shown here yet.')); }
    setActive(r.session.id); $('#prompt').focus();
  }
  // A folder (often one downloaded from the internet) can bring its own hooks, status line,
  // connected apps or settings that run programs. Show exactly what, and let the person choose.
  function askTrust(cwd, resume, risks) {
    const m = $('#setupModal'); $('#setupTitle').textContent = 'TRUST THIS FOLDER?';
    const body = $('#setupBody'); body.innerHTML = '';
    const list = (title, items) => items && items.length ? [h('h3', {}, title), h('div', { class: 'cmd' }, items.join('\n'))] : [];
    body.append(h('p', { class: 'modal-sub' }, base(cwd) + ' comes with its own settings that can run programs on your computer. Only trust folders you made yourself or got from someone you trust.'),
      ...list('Hooks it would run', risks.hooks), ...list('Its status line command', risks.statusLine ? [risks.statusLine] : []), ...list('Apps (MCP servers) it would start', risks.mcp), ...list('Settings it changes', risks.env),
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => m.classList.add('hidden') }, 'Cancel'),
        h('button', { class: 'btn btn-mint', type: 'button', onclick: () => { m.classList.add('hidden'); startSession(cwd, resume, false); } }, 'Start safely (ignore its settings)'),
        h('button', { class: 'btn btn-undo', type: 'button', onclick: () => { m.classList.add('hidden'); startSession(cwd, resume, true); } }, 'I trust it, start')));
    closeModals(); m.classList.remove('hidden');
  }
  async function openNew() {
    openModal('#newModal');
    const info = await api('/api/info');
    const ul = $('#recentList'); ul.innerHTML = '';
    const rec = (info && info.recentProjects) || [];
    $('#recentWrap').classList.toggle('hidden', !rec.length);
    const chats = (info && info.lastChats) || {};
    for (const p of rec) {
      const c = chats[p];
      ul.append(h('li', { class: 'recent-row' },
        h('button', { type: 'button', onclick: () => startSession(p), title: 'Start a fresh chat in ' + p }, h('b', {}, base(p)), h('small', {}, p)),
        c ? h('button', { type: 'button', class: 'cont', title: 'Pick up where you left off' + (c.label ? ': ' + c.label : ''), onclick: () => startSession(p, c.id) }, '▶ Continue') : null));
    }
  }

  /* ---------------- composer: attachments and slash commands ---------------- */
  let pending = [];
  function renderAttach() {
    const row = $('#attachRow'); row.innerHTML = ''; row.classList.toggle('hidden', !pending.length);
    pending.forEach((a, i) => row.append(h('span', { class: 'att-chip' }, a.url ? h('img', { src: a.url, alt: '' }) : h('span', {}, '📄'), h('span', { class: 'an' }, a.name), h('button', { type: 'button', title: 'Remove', onclick: () => { pending.splice(i, 1); renderAttach(); } }, '✕'))));
  }
  function addFiles(list) {
    for (const f of [...list].slice(0, 10)) {
      if (f.size > 20 * 1024 * 1024) { toast(`${f.name} is too big (20 MB max).`, 'err'); continue; }
      const rd = new FileReader();
      rd.onload = () => { pending.push({ name: f.name || 'pasted.png', type: f.type || 'application/octet-stream', data: String(rd.result).split(',')[1] || '', url: /^image\//.test(f.type) ? String(rd.result) : null }); renderAttach(); };
      rd.readAsDataURL(f);
    }
  }
  // Prompt history: Up and Down at the edges of the box, like a terminal.
  let histAt = -1, draft = '';
  function historyStep(dir) {
    const past = store.get('sent', []), p = $('#prompt');
    if (!past.length) return false;
    if (histAt === -1) draft = p.value;
    const next = Math.max(-1, Math.min(past.length - 1, histAt + dir));
    if (next === histAt) return false;
    histAt = next; p.value = histAt === -1 ? draft : past[histAt]; autosize();
    return true;
  }
  let slashSel = 0, slashItems = [];
  function updateSlash(force) {
    const p = $('#prompt'), s = S(activeId);
    const m = p.value.match(/^\/([\w:\-]*)$/);
    if (!m || !s) return hideSlash();
    const q = m[1].toLowerCase(), cmds = (s.caps && s.caps.commands) || [];
    const mine = new Set([...((s.env && s.env.skills) || []), ...((s.init && s.init.skills) || [])]);
    const isSkill = c => mine.has(c.name) || /skill|plugin|user|project/i.test(String(c.source || c.type || '')) || (c.description || '').startsWith('(');
    const hit = cmds.filter(c => c.name.toLowerCase().includes(q)).sort((a, b) => (a.name.toLowerCase().startsWith(q) ? 0 : 1) - (b.name.toLowerCase().startsWith(q) ? 0 : 1));
    slashItems = [...hit.filter(isSkill), ...hit.filter(c => !isSkill(c))];
    const pop = $('#slashPop');
    if (!slashItems.length) return hideSlash();
    slashSel = Math.min(slashSel, slashItems.length - 1);
    pop.innerHTML = '';
    let group = null;
    slashItems.forEach((c, i) => {
      const g = isSkill(c) ? 'Your skills and plugins' : 'Built-in commands';
      if (g !== group) { group = g; pop.append(h('div', { class: 'slash-group' }, g)); }
      const it = h('div', { class: 'slash-item' + (i === slashSel ? ' sel' : ''), role: 'option' }, h('b', {}, '/' + c.name), h('span', {}, c.description || ''), c.argumentHint ? h('em', {}, c.argumentHint) : null);
      it.addEventListener('mousedown', e => { e.preventDefault(); pickSlash(i); });
      pop.append(it);
    });
    pop.classList.remove('hidden');
    const sel = pop.querySelectorAll('.slash-item')[slashSel]; if (sel) sel.scrollIntoView({ block: 'nearest' });
    if (force) p.focus();
  }
  function hideSlash() { $('#slashPop').classList.add('hidden'); slashItems = []; slashSel = 0; }
  function pickSlash(i) { const c = slashItems[i]; if (!c) return; fillPrompt('/' + c.name + ' '); hideSlash(); }
  function autosize() { const p = $('#prompt'); p.style.height = 'auto'; p.style.height = Math.min(200, p.scrollHeight) + 'px'; }

  /* ---------------- modals, toasts ---------------- */
  function openModal(sel) { closeModals(); $(sel).classList.remove('hidden'); const f = $(sel).querySelector('input:not([type=radio]), textarea, button:not(.modal-x)'); if (f) setTimeout(() => f.focus(), 60); }
  function closeModals() { $$('.modal').forEach(m => { if (m.id !== 'setupModal' || !m.dataset.locked) m.classList.add('hidden'); }); }
  function toast(text, kind = '', action = null, ms = 3800) {
    if (!live) return;
    if (action && ms < 8000) ms = 8000;
    const t = h('div', { class: 'toast ' + kind }, h('span', {}, text), action ? h('button', { class: 'btn btn-small ' + (kind === 'needs' ? 'btn-undo' : 'btn-mint'), type: 'button', onclick: () => { action.fn(); t.remove(); } }, action.label) : null);
    $('#toasts').append(t);
    while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
    let timer; const go = () => { timer = setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, ms); };
    t.addEventListener('mouseenter', () => clearTimeout(timer)); t.addEventListener('mouseleave', () => { clearTimeout(timer); ms = 2500; go(); });
    go();
  }
  function confirmBox(title, text, okLabel) {
    return new Promise(res => {
      closeModals();
      const m = $('#setupModal'); $('#setupTitle').textContent = title.toUpperCase();
      const body = $('#setupBody'); body.innerHTML = '';
      const done = v => { m.classList.add('hidden'); res(v); };
      body.append(h('p', { class: 'modal-sub' }, text), h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => done(false) }, 'Cancel'), h('button', { class: 'btn btn-undo', type: 'button', onclick: () => done(true) }, okLabel)));
      m.classList.remove('hidden');
    });
  }
  function showSetup(kind) {
    const m = $('#setupModal'); $('#setupTitle').textContent = 'ONE MORE STEP';
    const body = $('#setupBody'); body.innerHTML = '';
    if (kind === 'missing') body.append(h('p', { class: 'modal-sub' }, 'Easy Mode uses the real Claude Code on your computer, and it is not installed yet.'),
      h('ol', { class: 'setup-steps' }, h('li', {}, 'Close this page and the Easy Mode window.'), h('li', { html: 'Double-click <code>Setup Easy Mode.bat</code> again. It installs Claude Code for you.' }), h('li', { html: 'Or open PowerShell and run <code>winget install Anthropic.ClaudeCode</code>, then start Easy Mode again.' })),
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => m.classList.add('hidden') }, 'Close')));
    m.classList.remove('hidden');
  }
  function setConn(state) { $('#connDot').className = 'dot ' + (state === 'on' ? 'on' : state === 'busy' ? 'busy' : 'off'); $('#connText').textContent = DEMO ? 'demo mode' : state === 'on' ? 'connected' : state === 'busy' ? 'connecting' : 'reconnecting…'; }

  /* ---------------- arrange mode ---------------- */
  function arrange(on) {
    grid.edit(on);
    $('#arrangeBar').classList.toggle('hidden', !on);
    $('#layoutBtn').classList.toggle('btn-mint', on);
    if (on) { markPresets(); renderAddMenu(); $('#expertToggle').checked = !!layout.expert; $('#barToggle').checked = layout.bar !== false; }
    else $('#addMenu').classList.add('hidden');
    requestAnimationFrame(() => { grid.layout(); World.resize(); });
  }
  function markPresets() {
    const row = $('#presetRow'); row.innerHTML = '';
    for (const [k, p] of Object.entries(PRESETS)) row.append(h('button', { type: 'button', class: layout.preset === k ? 'on' : '', title: 'Use the ' + p.name + ' layout', onclick: () => {
      layout = { ...layout, preset: k, base: k, expert: p.expert, detail: p.detail, items: JSON.parse(JSON.stringify(p.items)) }; store.set('board', layout); applyDetail();
      const editing = grid.editing; buildColumns(); grid.edit(editing); renderAll(); markPresets(); renderAddMenu(); $('#expertToggle').checked = !!layout.expert;
    } }, p.name));
  }
  function renderAddMenu() {
    const m = $('#addMenu'); m.innerHTML = '';
    const hidden = Object.keys(WIDGET_INFO).filter(id => !layout.items.some(i => i.id === id) && (WIDGETS[id] || id === 'scene'));
    if (!hidden.length) m.append(h('p', { class: 'empty', style: { padding: '6px 9px' } }, 'Every block is already on screen.'));
    for (const id of hidden) m.append(h('button', { type: 'button', onclick: () => addBlock(id) }, h('b', {}, id === 'scene' ? 'Scene' : L(WIDGETS[id].title)), h('small', {}, WIDGET_INFO[id])));
  }
  function saveLayout() { store.set('board', layout); const editing = grid && grid.editing; buildColumns(); if (editing) grid.edit(true); renderAll(); }
  /* ---------------- command palette (Ctrl+K): find any action, block, project or command ---------------- */
  function paletteItems(mode) {
    const s = S(activeId), items = [];
    const add = (group, label, hint, fn) => items.push({ group, label, hint, fn });
    const past = store.get('sent', []);
    if (mode === 'past') { for (const t of past) add('Things you sent before', t.replace(/\s+/g, ' ').slice(0, 120), '', () => fillPrompt(t)); return items; }
    for (const x of sessions.values()) add('Projects', (store.get('names', {})[x.info.cwd]) || x.info.title || base(x.info.cwd), stateOf(x), () => setActive(x.id));
    add('Actions', L('newProject').replace(/^\+\s*/, ''), 'start a project', () => openNew());
    add('Actions', 'Customise the screen', 'move, resize, add blocks', () => arrange(true));
    add('Actions', detailOf() === 'results' ? 'Show every step' : 'Show just the results', detailOf() === 'results' ? 'see everything Claude does' : 'hide the steps, keep the outcome', () => setDetail(detailOf() === 'results' ? 'steps' : 'results'));
    add('Actions', 'Switch theme', skin.id === 'goodboy' ? 'to Arcade Dusk' : 'to Good Boy Club', () => $('#skinBtn').click());
    add('Actions', 'Sounds and alerts', 'quiet, alerts only, everything, reminders', () => setTimeout(() => $('#soundBtn').click(), 30));
    add('Actions', 'Teach Claude about you', 'writes CLAUDE.md', () => openModal('#teachModal'));
    add('Actions', 'Keyboard shortcuts', 'show them all', () => openShortcuts());
    add('Actions', 'About Easy Mode', 'version and credits', () => openAbout());
    if (s) {
      add('Actions', 'Export this chat', 'save it as a Markdown file', () => exportChat(s));
      add('Actions', 'Open the project folder', base(s.info.cwd), () => api(`/api/session/${s.id}/open-folder`, {}));
      add('Actions', 'Open in the terminal', 'same chat, real terminal', () => $('#termBtn').click());
      if ((s.info.checkpoints || []).length && !s.busy) add('Actions', 'Undo the last round', 'puts your files back', () => $('#undoBtn').click());
      add('Actions', 'Tidy Claude’s memory now', '/compact', () => { fillPrompt('/compact'); sendPrompt(); });
      for (const [k, n] of Object.entries(MODE_NAMES)) add('Safety', n, k === s.info.mode ? 'current' : '', () => { $('#modeSel').value = k; setMode(k); });
      for (const m of ((s.caps && s.caps.models) || [])) add('Model', m.displayName || m.value, m.description || '', () => { $('#modelSel').value = m.value === 'default' ? '' : m.value; $('#modelSel').dispatchEvent(new Event('change')); });
      for (const c of ((s.caps && s.caps.commands) || [])) add('Commands and skills', '/' + c.name, c.description || '', () => fillPrompt('/' + c.name + ' '));
    }
    for (const id of Object.keys(WIDGET_INFO)) if (WIDGETS[id] || id === 'scene') { const on = layout.items.some(i => i.id === id); add('Blocks', (on ? 'Hide ' : 'Show ') + (id === 'scene' ? 'Scene' : L(WIDGETS[id].title)), WIDGET_INFO[id], () => on ? hideBlock(id) : addBlock(id)); }
    for (const [k, p] of Object.entries(PRESETS)) add('Layouts', p.name + ' layout', '', () => { layout = { ...layout, preset: k, base: k, expert: p.expert, detail: p.detail, items: JSON.parse(JSON.stringify(p.items)) }; saveLayout(); applyDetail(); });
    for (const t of past.slice(0, 15)) add('Things you sent before', t.replace(/\s+/g, ' ').slice(0, 120), 'Ctrl+R', () => fillPrompt(t));
    return items;
  }
  let palMode = '';
  function openPalette(mode) {
    palMode = mode || '';
    let box = $('#palette');
    if (!box) {
      box = h('div', { class: 'modal palette hidden', id: 'palette', role: 'dialog', 'aria-modal': 'true' },
        h('div', { class: 'modal-card pal-card' }, h('input', { id: 'palInput', placeholder: 'Type to find anything: a project, a block, a command, a model…', autocomplete: 'off' }), h('div', { class: 'pal-list', id: 'palList' })));
      document.body.append(box);
      box.addEventListener('click', e => { if (e.target === box) box.classList.add('hidden'); });
      let sel = 0, shown = [];
      const draw = () => {
        const q = $('#palInput').value.toLowerCase().trim(), list = $('#palList');
        shown = paletteItems(palMode).filter(i => !q || (i.label + ' ' + i.hint + ' ' + i.group).toLowerCase().includes(q)).slice(0, 60);
        sel = Math.min(sel, Math.max(0, shown.length - 1)); list.innerHTML = '';
        let g = null;
        shown.forEach((it, i) => {
          if (it.group !== g) { g = it.group; list.append(h('div', { class: 'slash-group' }, g)); }
          const row = h('div', { class: 'slash-item' + (i === sel ? ' sel' : '') }, h('b', {}, it.label), h('span', {}, it.hint || ''));
          row.addEventListener('mousedown', e => { e.preventDefault(); box.classList.add('hidden'); it.fn(); });
          list.append(row);
        });
        if (!shown.length) list.append(h('p', { class: 'empty', style: { padding: '8px' } }, 'Nothing matches. Try another word.'));
        const r = list.querySelectorAll('.slash-item')[sel]; if (r) r.scrollIntoView({ block: 'nearest' });
      };
      $('#palInput').addEventListener('input', () => { sel = 0; draw(); });
      $('#palInput').addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); draw(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
        else if (e.key === 'Enter') { e.preventDefault(); const it = shown[sel]; box.classList.add('hidden'); if (it) it.fn(); }
        else if (e.key === 'Escape') box.classList.add('hidden');
      });
      box._draw = draw;
    }
    closeModals(); box.classList.remove('hidden'); $('#palInput').value = ''; $('#palInput').placeholder = palMode === 'past' ? 'Search what you sent before…' : 'Type to find anything: a project, a block, a command, a model…'; box._draw(); setTimeout(() => $('#palInput').focus(), 30);
  }
  function openShortcuts() {
    const m = $('#setupModal'); $('#setupTitle').textContent = 'KEYBOARD SHORTCUTS';
    const body = $('#setupBody'); body.innerHTML = '';
    const rows = [['Ctrl+K', 'Find anything (projects, blocks, commands, models)'], ['Enter', 'Send your message'], ['Shift+Enter', 'New line'], ['↑ / ↓', 'Bring back what you sent before'], ['Ctrl+R', 'Search what you sent before'], ['/', 'Commands and skills'], ['Esc', 'Stop Claude, or close what is open'], ['Ctrl+Z', 'Undo Claude’s last changes (when the message box is empty)'], ['Alt+1 to 9', 'Jump to a project'], ['Alt+J', 'Jump to the project that needs you'], ['Y / N / A', 'Yes, No or Always, for the question over the scene'], ['Space', 'Jump, while playing the game'], ['?', 'This list']];
    body.append(h('div', { class: 'keys-grid' }, ...rows.map(([k, v]) => [h('span', { class: 'key' }, k), h('span', {}, v)])), h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => openAbout() }, 'About'), h('button', { class: 'btn btn-go', type: 'button', onclick: () => m.classList.add('hidden') }, 'Got it')));
    closeModals(); m.classList.remove('hidden');
  }
  function openAbout() {
    const m = $('#setupModal'); $('#setupTitle').textContent = 'ABOUT EASY MODE';
    const body = $('#setupBody'); body.innerHTML = '';
    body.append(h('p', { class: 'modal-sub' }, 'A friendly, colourful home for Claude Code. Version ' + (appVersion || '0.2') + '. Free and open source (MIT).'),
      h('p', {}, 'It runs the real Claude Code on your computer, so your plan, skills, hooks and settings all work as they do in the terminal. Not made by or affiliated with Anthropic.'),
      h('p', {}, 'Good Boy Club art (Winston, the pack and the park) by the project owner. Bit and the Arcade city are drawn in code. Fonts under the SIL Open Font License.'),
      h('p', { class: 'about-diesel' }, '🐾 In memory of Diesel, who watches over the park as a little star.'),
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-go', type: 'button', onclick: () => m.classList.add('hidden') }, 'Close')));
    closeModals(); m.classList.remove('hidden');
  }
  // Save the whole chat as a Markdown file the user can keep or share.
  function exportChat(s) {
    const lines = [`# ${s.info.title || base(s.info.cwd)}`, '', `Exported from Easy Mode on ${new Date().toLocaleString()}.`, ''];
    for (const el of s.feed.children) {
      if (el.classList.contains('msg-user')) lines.push('**You:** ' + el.querySelector('.say-box').textContent.trim(), '');
      else if (el.classList.contains('msg-claude')) lines.push('**Claude:** ' + (el.querySelector('.bubble')._text || el.textContent).trim(), '');
      else if (el.classList.contains('tool')) lines.push('- ' + el.querySelector('.txt').textContent + (el.querySelector('.rep').textContent ? ' ' + el.querySelector('.rep').textContent : ''));
      else if (el.classList.contains('level-clear')) lines.push('', '> ' + el.textContent.replace(/\s+/g, ' ').trim(), '');
    }
    const a = h('a', { href: URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown' })), download: (s.info.title || 'chat').replace(/[^\w\- ]+/g, '') + '.md' });
    document.body.append(a); a.click(); a.remove(); toast('Saved the chat to your Downloads.', 'ok');
  }
  // Tell people once when a usage limit passes the level they chose.
  const warned = new Set();
  function checkLimits(s) {
    const at = store.get('warnAt', 80);
    for (const [k, r] of Object.entries(s.rate || {})) {
      if (typeof r.utilization !== 'number') continue;
      const pct = Math.round(r.utilization * 100), key = k + '|' + (r.resetsAt || '') + '|' + at;
      if (pct >= at && !warned.has(key)) { warned.add(key); toast(`${k === 'five_hour' ? 'Your 5-hour limit' : 'Your weekly limit'} is at ${pct}%.` + (r.resetsAt ? ' It refills ' + new Date(r.resetsAt * 1000).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) + '.' : ''), 'needs', null, 9000); }
    }
  }

  /* ---------------- first run ---------------- */
  function openWelcome() {
    openModal('#welcomeModal');
    const pick = $('#skinPick'); pick.innerHTML = '';
    let chosen = store.get('skin', 'auto');
    const opts = [['goodboy', SKINS.goodboy], ['arcade', SKINS.arcade]];
    const draw = () => { pick.innerHTML = ''; for (const [id, sk] of opts) { const b = h('button', { type: 'button', class: 'skin-opt' + ((chosen === id || (chosen === 'auto' && document.documentElement.dataset.skin === id)) ? ' on' : ''), onclick: () => { chosen = id; applySkin(id); draw(); } }, h('img', { src: id === 'goodboy' ? ART('w_walk2') : '', alt: '', style: { height: '90px', display: id === 'goodboy' ? 'block' : 'none', margin: '8px auto 0' } }), id === 'arcade' ? (() => { const c = h('canvas', { style: { height: '90px', width: 'auto', margin: '8px auto 0', display: 'block' } }); paintBot(c); return c; })() : null, h('div', {}, h('b', {}, sk.name), h('small', {}, sk.desc))); pick.append(b); } };
    draw();
    $('#testSound').onclick = async () => {
      const btn = $('#testSound');
      const okNow = await audioReady();
      if (!okNow) { btn.textContent = '🔇 Sound is blocked, click again'; return; }
      // Play both sounds whatever is picked, so people can hear what they are choosing.
      const pack = SOUNDS[skin.id] || SOUNDS.arcade;
      btn.textContent = '♪ “All done” sound…'; pack.done();
      setTimeout(() => { btn.textContent = '♪ “Needs you” sound…'; pack.wait(); }, 1100);
      setTimeout(() => { btn.textContent = '▶ Play again'; }, 2200);
    };
    $('#welcomeGo').onclick = () => {
      unlockAudio();
      Sound.mode = (document.querySelector('input[name=alerts]:checked') || {}).value || 'alerts'; store.set('alerts', Sound.mode);
      store.set('welcomed', true);
      if (Sound.mode !== 'off' && typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().then(p => { notifyOK = p === 'granted'; });
      closeModals();
      if (!sessions.size) openNew();
    };
  }

  /* ---------------- wire up ---------------- */
  function wire() {
    setInterval(() => { paintAvatar($('#logoBot'), true); setTimeout(() => paintAvatar($('#logoBot'), false), 150); }, 3800);
    World.init($('#world'));
    try { new ResizeObserver(([e]) => $('#stage').classList.toggle('short', e.contentRect.height < 230)).observe($('#stage')); } catch { /* old browser */ }
    World.onScore = n => { $('#gameScore').textContent = n; };
    World.onGameOver = n => { const best = Math.max(n, store.get('best', 0)); store.set('best', best); $('#gameBest').textContent = 'best ' + best; $('#gameMsg').textContent = L('gameOver'); Sound.play('error'); };
    const startGame = () => { World.play(true); $('#gameHud').classList.remove('hidden'); $('#gameBest').textContent = 'best ' + store.get('best', 0); $('#gameMsg').textContent = L('gameHint'); unlockAudio(); renderWorld(); };
    const stopGame = () => { World.play(false); $('#gameHud').classList.add('hidden'); renderWorld(); };
    $('#playBtn').addEventListener('click', startGame);
    $('#gameQuit').addEventListener('click', stopGame);
    $('#world').addEventListener('click', () => { if (World.game && World.game.on) { World.jump(); Sound.play('jump'); } });

    $('#composer').addEventListener('submit', e => { e.preventDefault(); sendPrompt(); });
    const p = $('#prompt');
    p.addEventListener('input', () => { autosize(); updateSlash(); World.setTyping(); });
    p.addEventListener('blur', () => setTimeout(hideSlash, 120));
    p.addEventListener('keydown', e => {
      if (slashItems.length && !$('#slashPop').classList.contains('hidden')) {
        if (e.key === 'ArrowDown') { e.preventDefault(); slashSel = (slashSel + 1) % slashItems.length; updateSlash(); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); slashSel = (slashSel - 1 + slashItems.length) % slashItems.length; updateSlash(); return; }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); pickSlash(slashSel); return; }
        if (e.key === 'Escape') { hideSlash(); return; }
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendPrompt(); }
      const atTop = !p.value.slice(0, p.selectionStart).includes('\n'), atEnd = !p.value.slice(p.selectionEnd).includes('\n');
      if (e.key === 'ArrowUp' && atTop && !e.shiftKey && (histAt !== -1 || !p.value || p.selectionStart === 0) && historyStep(1)) { e.preventDefault(); return; }
      if (e.key === 'ArrowDown' && atEnd && histAt !== -1 && historyStep(-1)) { e.preventDefault(); return; }
      if (e.ctrlKey && e.key.toLowerCase() === 'r') { e.preventDefault(); openPalette('past'); }
    });
    p.addEventListener('paste', e => { const files = [...((e.clipboardData || {}).files || [])]; if (files.length) { e.preventDefault(); addFiles(files); } });
    $('#attachBtn').addEventListener('click', () => $('#fileInput').click());
    $('#fileInput').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
    let dragDepth = 0;
    addEventListener('dragenter', e => { if ([...(e.dataTransfer.types || [])].includes('Files')) { dragDepth++; $('#dropOverlay').classList.remove('hidden'); } });
    addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#dropOverlay').classList.add('hidden'); });
    addEventListener('dragover', e => e.preventDefault());
    addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; $('#dropOverlay').classList.add('hidden'); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });

    const stop = async () => {
      const s = S(activeId); if (!s || !s.busy) return;
      // Say no to anything still waiting first, or Claude sits on the question and never stops.
      for (const [requestId, card] of s.cards) if (card.classList.contains('pending')) await api(`/api/session/${s.id}/permission`, { requestId, allow: false, message: 'The user pressed Stop.' });
      api(`/api/session/${s.id}/interrupt`, {}); say(s, 'Stopping…');
      setTimeout(() => { if (s.say === 'Stopping…') say(s, s.busy ? 'Still finishing the last step…' : 'Stopped.'); }, 5000);
    };
    $('#stopBtn').addEventListener('click', stop);
    $('#undoBtn').addEventListener('click', () => { const s = S(activeId); const cps = s && s.info.checkpoints; if (cps && cps.length) undoTo(cps[cps.length - 1]); });
    $('#redoBtn').addEventListener('click', redo);
    $('#termBtn').addEventListener('click', async () => { const s = S(activeId); if (!s) return; const r = await api(`/api/session/${s.id}/terminal`, {}); if (r.error) toast(r.error, 'err'); });
    $('#reclaimBtn').addEventListener('click', () => { const s = S(activeId); if (s) api(`/api/session/${s.id}/reclaim`, {}); });
    $('#layoutBtn').addEventListener('click', () => arrange(!grid.editing));
    $('#arrangeDone').addEventListener('click', () => arrange(false));
    $$('#phoneTabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    $('#needsBar').addEventListener('click', () => { if (document.body.classList.contains('phone')) setTab('chat'); });
    $('#resetLayout').addEventListener('click', () => {
      const k = layout.base || 'simple', p = PRESETS[k];
      layout = { ...layout, preset: k, base: k, expert: p.expert, detail: p.detail, items: JSON.parse(JSON.stringify(p.items)) };
      saveLayout(); applyDetail(); markPresets(); renderAddMenu(); toast('Back to the ' + p.name + ' layout.', 'ok');
    });
    $('#addBlockBtn').addEventListener('click', () => { renderAddMenu(); $('#addMenu').classList.toggle('hidden'); });
    $('#barToggle').addEventListener('change', e => { layout.bar = e.target.checked; saveLayout(); });
    $('#skinBtn').addEventListener('click', () => { const next = skin.id === 'goodboy' ? 'arcade' : 'goodboy'; applySkin(next); toast('Theme: ' + SKINS[next].name, 'ok'); });
    const sb = $('#soundBtn');
    const paintSound = () => { sb.textContent = Sound.mode === 'off' ? '🔕' : Sound.mode === 'all' ? '🎵' : '🔔'; sb.title = 'Sounds: ' + ({ off: 'quiet', alerts: 'alerts only', all: 'everything' }[Sound.mode]) + ' (click for options)'; };
    paintSound();
    const bellMenu = h('div', { class: 'pop-menu hidden', id: 'bellMenu', role: 'menu' });
    document.body.append(bellMenu);
    const drawBell = () => {
      bellMenu.innerHTML = '';
      const opt = (mode, ico, title, sub) => h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': Sound.mode === mode ? 'true' : 'false', class: Sound.mode === mode ? 'on' : '', onclick: () => { Sound.mode = mode; store.set('alerts', mode); paintSound(); unlockAudio(); if (mode !== 'off') { const was = live; live = true; Sound.play('done'); live = was; } drawBell(); } }, h('span', { class: 'pm-ico' }, ico), h('span', {}, h('b', {}, title), h('small', {}, sub)));
      const every = store.get('remind', 75);
      bellMenu.append(h('div', { class: 'pm-head' }, 'Sounds'),
        opt('alerts', '🔔', 'Alerts only', 'When Claude is done or needs you'), opt('all', '🎵', 'Everything', 'Little sounds for every step too'), opt('off', '🔕', 'Quiet', 'No sounds. You still see it on screen'),
        h('div', { class: 'pm-head' }, 'While something waits for you'),
        h('label', { class: 'pm-check' }, h('input', { type: 'checkbox', checked: every ? true : null, onchange: e => { store.set('remind', e.target.checked ? 75 : 0); drawBell(); } }), ' Remind me again every minute or so'),
        typeof Notification !== 'undefined' && Notification.permission !== 'granted' ? h('button', { type: 'button', class: 'pm-link', onclick: () => Notification.requestPermission().then(p => { notifyOK = p === 'granted'; drawBell(); }) }, '🖥 Also show a Windows notification') : null);
    };
    sb.addEventListener('click', e => {
      e.stopPropagation();
      if (!bellMenu.classList.contains('hidden')) { bellMenu.classList.add('hidden'); return; }
      drawBell(); const r = sb.getBoundingClientRect();
      bellMenu.style.top = (r.bottom + 6) + 'px'; bellMenu.style.right = Math.max(8, innerWidth - r.right) + 'px';
      bellMenu.classList.remove('hidden'); sb.setAttribute('aria-expanded', 'true');
    });
    document.addEventListener('click', e => { if (!bellMenu.contains(e.target) && e.target !== sb) { bellMenu.classList.add('hidden'); sb.setAttribute('aria-expanded', 'false'); } });
    $('#needsBar').addEventListener('click', focusNeeds);
    $('#findBtn').addEventListener('click', () => openPalette());
    $('#detailBtn').addEventListener('click', () => setDetail(detailOf() === 'results' ? 'steps' : 'results'));

    $('#modeSel').addEventListener('change', e => setMode(e.target.value));
    $('#modelSel').addEventListener('change', e => { const s = S(activeId); if (!s) return; s.info.model = e.target.value || null; api(`/api/session/${s.id}/model`, { model: s.info.model, effort: s.info.effort }).then(r => toast(r.queued ? 'Model changes after this step' : 'Model changed')); renderStatus(); });
    $('#effortSel').addEventListener('change', e => { const s = S(activeId); if (!s) return; s.info.effort = e.target.value || null; api(`/api/session/${s.id}/model`, { model: s.info.model, effort: s.info.effort }).then(r => toast((r.queued ? 'Effort changes after this step: ' : 'Effort: ') + (s.info.effort || 'auto'))); });
    $('#expertToggle').addEventListener('change', e => { layout.expert = e.target.checked; store.set('board', layout); document.body.classList.toggle('expert-on', layout.expert); renderAll(); });

    $('#viewerClose').addEventListener('click', () => { $('#viewer').classList.add('hidden'); $('#viewerBody').innerHTML = ''; });
    $('#sheetClose').addEventListener('click', () => { sheetFor = null; $('#helperSheet').classList.add('hidden'); });
    $$('.modal [data-close]').forEach(b => b.addEventListener('click', closeModals));
    $$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m && m.id !== 'setupModal') closeModals(); }));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (!$('#viewer').classList.contains('hidden')) { $('#viewerClose').click(); return; }
        if (grid && grid.editing) { arrange(false); return; }
        if (sheetFor) { $('#sheetClose').click(); return; }
        if ($$('.modal:not(.hidden)').length) { closeModals(); return; }
        if (World.game && World.game.on) { stopGame(); return; }
        stop(); return;
      }
      if (e.code === 'Space' && World.game && World.game.on && document.activeElement !== $('#prompt')) { e.preventDefault(); World.jump(); Sound.play('jump'); }
      if (e.altKey && /^[1-9]$/.test(e.key)) { const s = [...sessions.values()][+e.key - 1]; if (s) { e.preventDefault(); setActive(s.id); } }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { const a = document.activeElement; const empty = a === $('#prompt') ? !a.value : !/INPUT|TEXTAREA|SELECT/.test(a.tagName); if (empty && !$('#undoBtn').disabled) { e.preventDefault(); $('#undoBtn').click(); return; } }
      if (e.key === '?' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); openShortcuts(); return; }
      // Y / N / A answer the question shown over the scene (not while typing)
      if (!e.ctrlKey && !e.metaKey && !e.altKey && /^[yna]$/i.test(e.key) && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && $('#sceneAsk') && !$('#sceneAsk').classList.contains('hidden')) {
        const b = [...$('#sceneAsk').querySelectorAll('button')].find(x => (x.querySelector('kbd') || {}).textContent === e.key.toUpperCase());
        if (b) { e.preventDefault(); b.click(); return; }
      }
      if (e.altKey && e.key.toLowerCase() === 'j') { const s = [...sessions.values()].find(x => stateOf(x) === 'needs'); if (s) { e.preventDefault(); setActive(s.id); focusNeeds(); } }
    });
    $('#pickFolderBtn').addEventListener('click', async () => { const r = await api('/api/pick-folder', {}); if (r && r.folder) startSession(r.folder); else toast('No folder picked. You can also paste a path below.'); });
    $('#makeFolderBtn').addEventListener('click', async () => { const name = $('#newName').value.trim() || 'my-project'; const r = await api('/api/make-folder', { name }); if (r && r.folder) startSession(r.folder); else toast(r.error || 'Could not make the folder', 'err'); });
    $('#newName').addEventListener('keydown', e => { if (e.key === 'Enter') $('#makeFolderBtn').click(); });
    $('#typedGo').addEventListener('click', () => { const v = $('#typedPath').value.trim().replace(/^"|"$/g, ''); if (v) startSession(v); });
    $('#typedPath').addEventListener('keydown', e => { if (e.key === 'Enter') $('#typedGo').click(); });
    $('#teachGo').addEventListener('click', () => {
      const s = S(activeId); if (!s) { closeModals(); openNew(); return; }
      const v = id => $(id).value.trim();
      const text = 'Please create (or update) a CLAUDE.md file in this project folder with short, friendly notes for you to read at the start of every session. Here is what I told you:\n' +
        `- What this project is: ${v('#tWhat') || 'not sure yet'}\n- Who it is for: ${v('#tWho') || 'me'}\n- How to talk to me: ${$('#tTone').value}\n- Rules: ${v('#tRules') || 'none yet'}\nKeep it under 30 lines.`;
      closeModals(); fillPrompt(text); sendPrompt();
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (store.get('skin', 'auto') === 'auto') applySkin('auto', false); });
  }

  /* ---------------- boot ---------------- */
  async function boot() {
    wire();
    applySkin(store.get('skin', 'auto'), false);
    setActive(null);
    if (DEMO) {
      const b = $('#demoBanner'); b.innerHTML = '<b>DEMO</b> You’re watching a pretend run. Install Easy Mode on your PC to use your own Claude.'; b.classList.remove('hidden');
      setConn('on'); Demo.start(onEvent, { toast });
      if (!store.get('welcomed', false)) setTimeout(openWelcome, 400);
      return;
    }
    setConn('busy');
    const info = await api('/api/info').catch(() => null);
    if (info && info.claudeFound === false) showSetup('missing');
    if (info && info.version) appVersion = info.version;
    if (info && info.previewPort) PREVIEW_ORIGIN = `${location.protocol}//${location.hostname}:${info.previewPort}`;
    if (info && info.practice) { const b = $('#demoBanner'); b.innerHTML = '<b>PRACTICE</b> This is a pretend Claude, so it acts out the same cat café build whatever you type. Nothing is sent to Claude and none of your plan is used.'; b.classList.remove('hidden'); }
    const es = new EventSource('/api/events?token=' + encodeURIComponent(TOKEN));
    es.onmessage = e => { try { onEvent(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    es.onerror = () => { setConn('off'); downSince = downSince || Date.now(); };
    es.onopen = () => { setConn('on'); downSince = 0; };
    if (!store.get('welcomed', false)) setTimeout(openWelcome, 500);
    else if (info && !info.sessions.length && !(info.recentProjects || []).length) setTimeout(() => { if (!sessions.size) openNew(); }, 600);
  }

  window.ByteApp = { onEvent, sessions, setActive, api };
  boot();
})();
