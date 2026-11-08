#!/usr/bin/env node
/*
 * EASY MODE
 * A friendly, colourful home for Claude Code.
 *
 * This small server runs the REAL Claude Code CLI on your computer in its
 * stream-json mode and shows everything in a browser page. Because it is the
 * official CLI doing the work, your own login (Claude subscription, API key,
 * Bedrock and so on), your skills, hooks, MCP servers and CLAUDE.md files all
 * work exactly as they do in the terminal.
 *
 * No npm packages needed. Node 18 or newer.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

const VERSION = '0.2.0';
const PORT = Number(process.env.BYTE_RUNNER_PORT || 4317);
const HOST = '127.0.0.1';
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const CLAUDE_CMD = process.env.CLAUDE_PATH || 'claude';
const PUBLIC_DIR = path.join(__dirname, process.env.BYTE_RUNNER_UI || 'public');
const TOKEN = crypto.randomBytes(24).toString('hex');

const CONFIG_DIR = IS_WIN
  ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'EasyModeClaudeCode')
  : path.join(os.homedir(), '.easy-mode-claude-code');
// Earlier versions were called Byte Runner. Move their settings and save points across once.
const OLD_CONFIG_DIR = IS_WIN ? path.join(path.dirname(CONFIG_DIR), 'ByteRunner') : path.join(os.homedir(), '.byte-runner');
try { if (!fs.existsSync(CONFIG_DIR) && fs.existsSync(OLD_CONFIG_DIR)) fs.renameSync(OLD_CONFIG_DIR, CONFIG_DIR); } catch { /* keep going with a fresh folder */ }
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const SNAP_ROOT = path.join(CONFIG_DIR, 'savepoints');
fs.mkdirSync(SNAP_ROOT, { recursive: true });

const MODES = ['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions'];

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return { recentProjects: [] }; }
}
function saveConfig(cfg) {
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2)); } catch { /* ignore */ }
}
let config = loadConfig();

function rememberProject(cwd) {
  config.recentProjects = [cwd, ...(config.recentProjects || []).filter(p => p !== cwd)].slice(0, 12);
  saveConfig(config);
}

function run(cmd, args, opts = {}) {
  return new Promise(resolve => {
    execFile(cmd, args, { timeout: 30000, maxBuffer: 32 * 1024 * 1024, windowsHide: true, ...opts },
      (err, stdout, stderr) => resolve({ ok: !err, code: err ? err.code : 0, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });
}

// On Windows "claude" may be claude.exe or claude.cmd, so we go through cmd.exe.
// Node's normal argument escaping (\") is not understood by cmd.exe, which breaks
// paths with spaces, so we build the command line ourselves and pass it verbatim.
function cmdQuote(a) {
  a = String(a);
  return /^[\w\-.:\/\\=@+,]+$/.test(a) ? a : '"' + a.replace(/"/g, '""') + '"';
}
// CLAUDE_CMD is used as-is (it may already hold its own quotes, e.g. node "C:\x y\fake.js").
function claudeLine(args) { return [CLAUDE_CMD, ...args.map(cmdQuote)].join(' '); }
function spawnClaude(args, opts = {}) {
  if (!IS_WIN) return spawn(CLAUDE_CMD, args, opts);
  return spawn('cmd.exe', ['/d /s /c "' + claudeLine(args) + '"'], { ...opts, windowsVerbatimArguments: true });
}
function runClaude(args, opts = {}) {
  if (!IS_WIN) return run(CLAUDE_CMD, args, opts);
  return run('cmd.exe', ['/d /s /c "' + claudeLine(args) + '"'], { ...opts, windowsVerbatimArguments: true });
}
// End a process and everything it started. On Windows proc.kill() only ends the
// cmd.exe wrapper and can leave claude.exe running, so use taskkill /T.
function killTree(proc) {
  if (!proc || proc.exitCode !== null) return;
  if (IS_WIN && proc.pid) {
    execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true }, () => {});
  } else { try { proc.kill(); } catch { /* */ } }
}

function sha(s) { return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16); }

function isInside(base, target) {
  const rel = path.relative(base, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// Folders that are far too big or risky to treat as a project.
function isRiskyFolder(dir) {
  const d = path.resolve(dir);
  const home = path.resolve(os.homedir());
  if (d === home) return true;
  if (d === path.parse(d).root) return true;
  if (IS_WIN && /^[a-z]:\\(windows|program files|program files \(x86\))(\\|$)/i.test(d)) return true;
  if (!IS_WIN && ['/usr', '/etc', '/bin', '/System', '/Library', '/var'].some(p => d === p || d.startsWith(p + '/'))) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* Save points (Undo)                                                  */
/* A hidden git store per project, kept in the app folder, so we never */
/* touch the project's own .git.                                       */
/* ------------------------------------------------------------------ */

class SavePoints {
  constructor(cwd) {
    this.cwd = cwd;
    this.dir = path.join(SNAP_ROOT, sha(path.resolve(cwd)) + '.git');
    this.ready = null;
    this.disabled = isRiskyFolder(cwd) ? 'This folder is too big to keep save points for. Pick a project folder instead.' : null;
  }
  git(args, timeout = 60000) {
    return run('git', [`--git-dir=${this.dir}`, `--work-tree=${this.cwd}`, '-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false',
      '-c', 'core.longpaths=true', '-c', 'core.quotepath=false', '-c', 'user.name=Easy Mode', '-c', 'user.email=savepoint@easy-mode.local',
      '-c', 'commit.gpgsign=false', ...args], { cwd: this.cwd, timeout });
  }
  async init() {
    if (this.disabled) return false;
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const v = await run('git', ['--version']);
      if (!v.ok) { this.disabled = 'Install Git to turn on Undo.'; return false; }
      if (!fs.existsSync(path.join(this.dir, 'HEAD'))) {
        const r = await run('git', ['init', '-q', '--bare', this.dir]);
        if (!r.ok) { this.disabled = 'Could not set up save points.'; return false; }
        fs.mkdirSync(path.join(this.dir, 'info'), { recursive: true });
        fs.writeFileSync(path.join(this.dir, 'info', 'exclude'), [
          '.git/', 'node_modules/', '.venv/', 'venv/', '__pycache__/', '.next/', '.cache/', '.turbo/',
          '*.log', '.DS_Store', 'Thumbs.db', '.byte-runner/', '.easy-mode/', '.env', '.env.*'].join('\n') + '\n');
      }
      return true;
    })();
    return this.ready;
  }
  async snapshot(label) {
    if (!(await this.init())) return null;
    const add = await this.git(['add', '-A', '--', '.'], 45000);
    if (!add.ok) { this.disabled = 'This folder is too big for save points (it took too long).'; return null; }
    const c = await this.git(['commit', '-q', '--allow-empty', '--no-verify', '-m', label.slice(0, 200)]);
    if (!c.ok) return null;
    const h = await this.git(['rev-parse', 'HEAD']);
    return h.ok ? h.stdout.trim() : null;
  }
  async changesSince(commit) {
    if (!commit || this.disabled) return [];
    await this.git(['add', '-A', '--', '.'], 45000);
    const r = await this.git(['diff', '--cached', '--numstat', '-M', commit]);
    if (!r.ok) return [];
    const st = await this.git(['diff', '--cached', '--name-status', '-M', commit]);
    const status = {};
    st.stdout.split('\n').filter(Boolean).forEach(l => { const p = l.split('\t'); status[p[p.length - 1]] = p[0][0]; });
    return r.stdout.split('\n').filter(Boolean).map(l => {
      const [a, d, ...rest] = l.split('\t');
      const file = rest.join('\t').replace(/^.*=> /, '').replace(/[{}]/g, '');
      return { file, added: a === '-' ? 0 : Number(a), removed: d === '-' ? 0 : Number(d), binary: a === '-', status: status[file] || 'M' };
    });
  }
  async diff(commit, file) {
    if (!commit || this.disabled) return '';
    await this.git(['add', '-A', '--', '.'], 45000);
    const args = ['diff', '--cached', '-M', '--no-color', '--unified=3', commit];
    if (file) args.push('--', file);
    const r = await this.git(args);
    return r.stdout.slice(0, 400000);
  }
  async restore(commit) {
    if (!(await this.init())) return { ok: false, error: this.disabled };
    const before = await this.snapshot('Before undo');
    const r = await this.git(['reset', '-q', '--hard', commit]);
    return r.ok ? { ok: true, redo: before } : { ok: false, error: r.stderr.trim() || 'Undo failed' };
  }
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

const sessions = new Map(); // id -> Session
const clients = new Set();  // SSE responses
let eventSeq = 0;

function broadcast(sid, kind, data) {
  const s = sessions.get(sid);
  // A closed chat can still have a late timer or exit message. Say nothing more about it, apart from "closed".
  if (sid && !s && !(kind === 'app' && data && data.type === 'closed')) return;
  const ev = { seq: ++eventSeq, sid, kind, t: Date.now(), data };
  // Keep a replay log for page reloads, without the many small streaming pieces or giant results.
  if (s && !(kind === 'claude' && data && data.type === 'stream_event')) {
    if (JSON.stringify(ev).length < 256 * 1024) { s.log.push(ev); if (s.log.length > 3000) s.log.splice(0, s.log.length - 3000); }
  }
  const line = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of clients) { try { res.write(line); } catch { /* ignore */ } }
}

class Session {
  constructor({ cwd, mode, model, effort, resume, title, safeSettings }) {
    this.id = crypto.randomBytes(6).toString('hex');
    this.cwd = path.resolve(cwd);
    this.mode = MODES.includes(mode) ? mode : 'default';
    this.model = model || null;
    this.effort = effort || null;
    this.claudeSessionId = resume || null;
    this.title = title || path.basename(this.cwd);
    this.proc = null;
    this.buf = '';
    this.log = [];
    this.status = 'starting';
    this.pending = new Map(); // control request id -> request
    this.ctlWaiters = new Map();
    this.savepoints = new SavePoints(this.cwd);
    this.checkpoints = []; // {id, label, commit, t}
    this.trusted = !safeSettings;
    this.turnCommit = null;
    this.inTerminal = false;
    this.busy = false;
    this.changeTimer = null;
  }

  // The secret part of this chat's preview address, so other pages cannot guess it.
  previewKey() { return sha(TOKEN + this.id); }
  info() {
    return {
      id: this.id, cwd: this.cwd, title: this.title, mode: this.mode, model: this.model, effort: this.effort,
      claudeSessionId: this.claudeSessionId, status: this.status, inTerminal: this.inTerminal, busy: this.busy,
      checkpoints: this.checkpoints, previewKey: this.previewKey(), undo: this.savepoints.disabled ? { disabled: this.savepoints.disabled } : { disabled: null },
    };
  }

  emitApp(type, extra = {}) { broadcast(this.id, 'app', { type, ...extra, session: this.info() }); }

  start() {
    const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
      '--include-partial-messages', '--include-hook-events', '--permission-prompt-tool', 'stdio', '--permission-mode', this.mode];
    if (this.model) args.push('--model', this.model);
    if (this.effort) args.push('--effort', this.effort);
    if (this.claudeSessionId) args.push('--resume', this.claudeSessionId);
    // Folder not trusted: ignore the project's own settings (hooks, status line, env).
    if (!this.trusted) args.push('--setting-sources', 'user');

    const env = { ...process.env, CLAUDE_CODE_ENTRYPOINT: process.env.CLAUDE_CODE_ENTRYPOINT || 'sdk-ts' };
    try {
      this.proc = spawnClaude(args, { cwd: this.cwd, env, windowsHide: true });
    } catch (e) {
      this.status = 'error';
      this.emitApp('error', { message: 'Could not start Claude Code: ' + e.message, code: 'spawn_failed' });
      return;
    }
    this.status = 'running';
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', chunk => this.onStdout(chunk));
    this.proc.stderr.setEncoding('utf8');
    let errBuf = '';
    this.proc.stderr.on('data', d => { errBuf += d; if (errBuf.length > 8000) errBuf = errBuf.slice(-8000); });
    this.proc.on('error', e => {
      this.status = 'error';
      const notFound = e.code === 'ENOENT';
      this.emitApp('error', { message: notFound ? 'Claude Code is not installed yet.' : e.message, code: notFound ? 'claude_missing' : 'proc_error' });
    });
    this.proc.on('exit', code => {
      const wasTerminal = this.inTerminal;
      this.proc = null;
      this.busy = false;
      if (!wasTerminal) this.status = code === 0 ? 'stopped' : 'crashed';
      const notFound = IS_WIN && /is not recognized|not recognised/i.test(errBuf);
      this.emitApp('exit', { code, stderr: errBuf.slice(-2000), claudeMissing: notFound });
    });
    // Ask the CLI for its commands, models, agents and login info.
    this.control({ subtype: 'initialize', hooks: null }).then(r => {
      if (r && r.subtype === 'success') broadcast(this.id, 'app', { type: 'capabilities', data: r.response, session: this.info() });
    });
    this.emitApp('started');
  }

  write(obj) {
    if (!this.proc || !this.proc.stdin.writable) return false;
    this.proc.stdin.write(JSON.stringify(obj) + '\n');
    return true;
  }

  control(request, timeout = 20000) {
    const request_id = 'br_' + crypto.randomBytes(5).toString('hex');
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.ctlWaiters.delete(request_id); resolve(null); }, timeout);
      this.ctlWaiters.set(request_id, r => { clearTimeout(timer); resolve(r); });
      if (!this.write({ type: 'control_request', request_id, request })) { clearTimeout(timer); this.ctlWaiters.delete(request_id); resolve(null); }
    });
  }

  onStdout(chunk) {
    this.buf += chunk;
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { broadcast(this.id, 'app', { type: 'raw', line: line.slice(0, 2000) }); continue; }
      this.onMessage(msg);
    }
  }

  onMessage(msg) {
    if (msg.type === 'control_response') {
      const w = this.ctlWaiters.get(msg.response && msg.response.request_id);
      if (w) { this.ctlWaiters.delete(msg.response.request_id); w(msg.response); }
      return;
    }
    if (msg.type === 'control_request') {
      const req = msg.request || {};
      if (req.subtype === 'can_use_tool') {
        this.pending.set(msg.request_id, req);
        broadcast(this.id, 'claude', msg);
      } else {
        // We do not register hooks or in-process MCP servers, so politely decline anything else.
        this.write({ type: 'control_response', response: { subtype: 'error', request_id: msg.request_id, error: 'Not supported by Easy Mode' } });
      }
      return;
    }
    if (msg.type === 'control_cancel_request') {
      this.pending.delete(msg.request_id);
      broadcast(this.id, 'claude', msg);
      return;
    }
    if (msg.type === 'system' && msg.subtype === 'init' && msg.session_id) {
      this.claudeSessionId = msg.session_id;
    }
    if (msg.type === 'assistant' || msg.type === 'user') {
      // File-changing tools finished: refresh the live change list soon.
      const c = msg.message && msg.message.content;
      if (Array.isArray(c) && c.some(b => b.type === 'tool_result')) this.scheduleChanges();
    }
    if (msg.type === 'result') {
      this.busy = false;
      if (this.queued) { const q = this.queued; this.queued = null; setTimeout(() => this.restart(q), 50); }
      if (msg.session_id) this.claudeSessionId = msg.session_id;
      if (this.claudeSessionId) {
        config.lastChats = config.lastChats || {};
        config.lastChats[this.cwd] = { id: this.claudeSessionId, t: Date.now(), label: this.firstPrompt || '' };
        saveConfig(config);
      }
      broadcast(this.id, 'claude', msg);
      this.scheduleChanges(50);
      this.emitApp('idle');
      return;
    }
    broadcast(this.id, 'claude', msg);
  }

  scheduleChanges(delay = 1200) {
    clearTimeout(this.changeTimer);
    this.changeTimer = setTimeout(async () => {
      if (!this.turnCommit) return;
      const files = await this.savepoints.changesSince(this.turnCommit);
      broadcast(this.id, 'app', { type: 'changes', since: this.turnCommit, files });
    }, delay);
  }

  async send(text, attachments = []) {
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; this.start(); }
    else if (!this.proc) this.start();
    const content = [];
    const notes = [];
    for (const a of attachments.slice(0, 10)) {
      if (!a || !a.data) continue;
      const type = String(a.type || '');
      if (/^image\/(png|jpeg|gif|webp)$/.test(type)) {
        content.push({ type: 'image', source: { type: 'base64', media_type: type, data: a.data } });
      } else if (type === 'application/pdf') {
        content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.data } });
      } else {
        // Any other file gets saved into the project so Claude can open it.
        const dir = path.join(this.cwd, 'attachments');
        fs.mkdirSync(dir, { recursive: true });
        let safe = path.basename(String(a.name || 'file')).replace(/[^\w.\- ]+/g, '_').replace(/^[.\s]+/, '') || 'file';
        if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(safe)) safe = '_' + safe;
        let dest = path.join(dir, safe), n = 2;
        while (fs.existsSync(dest)) dest = path.join(dir, safe.replace(/(\.[^.]*)?$/, ` (${n++})$1`));
        safe = path.basename(dest);
        fs.writeFileSync(dest, Buffer.from(a.data, 'base64'));
        notes.push(`attachments/${safe}`);
      }
    }
    let full = String(text || '');
    if (notes.length) full += `\n\n(I attached these files to the project: ${notes.join(', ')})`;
    content.unshift({ type: 'text', text: full || '(see attachment)' });
    if (this.pendingNote) { content.unshift({ type: 'text', text: this.pendingNote }); this.pendingNote = null; }

    // Save point before Claude touches anything.
    const label = (text || 'Attachment').replace(/\s+/g, ' ').slice(0, 80);
    if (!this.firstPrompt) this.firstPrompt = label;
    const commit = await this.savepoints.snapshot('Before: ' + label);
    if (commit) {
      const cp = { id: crypto.randomBytes(4).toString('hex'), label, commit, t: Date.now() };
      this.checkpoints.push(cp);
      if (this.checkpoints.length > 60) this.checkpoints.shift();
      this.turnCommit = commit;
    }
    this.busy = true;
    broadcast(this.id, 'app', { type: 'user_message', text: String(text || ''), files: attachments.filter(Boolean).map(a => ({ name: a.name, type: a.type })) });
    this.emitApp('checkpoint');
    const ok = this.write({ type: 'user', message: { role: 'user', content }, parent_tool_use_id: null, session_id: this.claudeSessionId || '' });
    if (!ok) { this.busy = false; this.emitApp('error', { message: 'Claude Code is not running. Try again in a moment.', code: 'not_running' }); }
    return ok;
  }

  answerPermission(requestId, decision) {
    const req = this.pending.get(requestId);
    if (!req) return false;
    this.pending.delete(requestId);
    let response;
    if (decision.allow) {
      response = { behavior: 'allow', updatedInput: decision.updatedInput || req.input || {}, toolUseID: req.tool_use_id };
      if (decision.always && Array.isArray(req.permission_suggestions)) response.updatedPermissions = req.permission_suggestions;
    } else {
      response = { behavior: 'deny', message: decision.message || 'The user said no. Ask them what they would like instead.', toolUseID: req.tool_use_id };
    }
    this.write({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } });
    broadcast(this.id, 'app', { type: 'permission_answered', requestId, allow: !!decision.allow });
    return true;
  }

  stop() {
    clearTimeout(this.restartTimer); this.restartTimer = null;
    if (this.proc) { try { this.proc.stdin.end(); } catch { /* */ } const p = this.proc; setTimeout(() => killTree(p), 1500); }
  }

  restart(changes = {}) {
    Object.assign(this, changes);
    const old = this.proc;
    if (old) {
      old.removeAllListeners('exit');
      old.on('exit', () => {});
      try { old.stdin.end(); } catch { /* */ }
      setTimeout(() => killTree(old), 800);
      this.proc = null;
    }
    this.busy = false;
    clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => { this.restartTimer = null; if (!this.proc) this.start(); }, 300);
  }
}

/* ------------------------------------------------------------------ */
/* Opening things on the user's computer                               */
/* ------------------------------------------------------------------ */

function openTerminal(cwd, claudeArgs) {
  const cmd = claudeLine(claudeArgs);
  if (IS_WIN) {
    // Prefer Windows Terminal, fall back to a classic console window.
    // Built by hand and passed verbatim so folders with spaces survive.
    // Windows Terminal re-splits nested quotes, so write the command into a tiny launcher
    // file and hand the terminal just that one path.
    const launcher = path.join(CONFIG_DIR, 'open-claude-' + crypto.randomBytes(3).toString('hex') + '.cmd');
    fs.writeFileSync(launcher, ['@echo off', 'title Claude Code', `cd /d "${cwd.replace(/%/g, '%%')}"`, cmd.replace(/[\r\n]/g, ' ').replace(/%/g, '%%'), ''].join('\r\n'));
    setTimeout(() => { try { fs.unlinkSync(launcher); } catch { /* */ } }, 60000);
    const dir = '"' + cwd.replace(/\\$/, '') + '"';
    const wt = spawn('wt.exe', [`-d ${dir} cmd.exe /k "${launcher}"`], { detached: true, stdio: 'ignore', windowsHide: false, windowsVerbatimArguments: true });
    wt.on('error', () => {
      spawn('cmd.exe', [`/d /c start "Claude Code" /d ${dir} cmd.exe /k "${launcher}"`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
    });
    wt.unref();
  } else if (IS_MAC) {
    const script = `tell application "Terminal" to do script "cd ${JSON.stringify(cwd).slice(1, -1)} && ${cmd}"`;
    spawn('osascript', ['-e', script, '-e', 'tell application "Terminal" to activate'], { detached: true, stdio: 'ignore' }).unref();
  } else {
    const t = spawn('x-terminal-emulator', ['-e', `bash -lc 'cd "${cwd}" && ${cmd}; exec bash'`], { detached: true, stdio: 'ignore' });
    t.on('error', () => {});
    t.unref();
  }
}

function openBrowser(url) {
  if (IS_WIN) spawn('cmd.exe', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
  else if (IS_MAC) spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  else { const p = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }); p.on('error', () => {}); p.unref(); }
}

async function pickFolder() {
  if (IS_WIN) {
    const ps = [
      'Add-Type -AssemblyName System.Windows.Forms;',
      '$f = New-Object System.Windows.Forms.FolderBrowserDialog;',
      '$f.Description = "Pick a project folder for Claude";',
      '$f.ShowNewFolderButton = $true;',
      '$t = New-Object System.Windows.Forms.Form; $t.TopMost = $true;',
      'if ($f.ShowDialog($t) -eq "OK") { Write-Output $f.SelectedPath }'].join(' ');
    const r = await run('powershell.exe', ['-NoProfile', '-STA', '-Command', ps], { timeout: 600000 });
    return r.stdout.trim() || null;
  }
  if (IS_MAC) {
    const r = await run('osascript', ['-e', 'POSIX path of (choose folder with prompt "Pick a project folder for Claude")'], { timeout: 600000 });
    return r.stdout.trim().replace(/\/$/, '') || null;
  }
  const r = await run('zenity', ['--file-selection', '--directory', '--title=Pick a project folder for Claude'], { timeout: 600000 });
  return r.ok ? r.stdout.trim() || null : null;
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.pdf': 'application/pdf',
};

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req, limit = 40 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const parts = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('Too big')); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { resolve(parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// Only the page we served (which knows the secret token) may control Claude.
const OUR_ORIGINS = () => [`http://${HOST}:${PORT}`, `http://localhost:${PORT}`];
// Refuse any other host name, which blocks "DNS rebinding" tricks from websites.
function goodHost(req, port) { const hst = String(req.headers.host || '').toLowerCase(); return hst === `127.0.0.1:${port}` || hst === `localhost:${port}`; }
function authorised(req, url) {
  const token = req.headers['x-br-token'] || (url.pathname === '/api/events' ? url.searchParams.get('token') : null);
  if (token !== TOKEN) return false;
  const origin = req.headers.origin;
  if (origin && !OUR_ORIGINS().includes(origin)) return false;
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  // Anything that changes something must be a POST from our own page.
  if (req.method !== 'GET' && !origin) return false;
  return true;
}
const READ_ONLY = new Set(['env', 'files', 'diff']);
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
function clean(b) {
  if (b.model != null && b.model !== '' && !/^[\w.\-\[\]]{1,80}$/.test(String(b.model))) return 'That model name looks wrong.';
  if (b.effort != null && b.effort !== '' && !EFFORTS.includes(String(b.effort))) return 'That effort level looks wrong.';
  if (b.mode != null && !MODES.includes(String(b.mode))) return 'Unknown mode';
  if (b.resume != null && b.resume !== '' && !/^[0-9a-f-]{8,64}$/i.test(String(b.resume))) return 'That chat id looks wrong.';
  return null;
}

/* ------------------------------------------------------------------ */
/* Environment, settings, hooks and the user's own status line          */
/* ------------------------------------------------------------------ */

const CLAUDE_HOME = path.join(os.homedir(), '.claude');
function readJSON(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
function settingsFiles(cwd) {
  return [
    { scope: 'You, every project', path: path.join(CLAUDE_HOME, 'settings.json') },
    { scope: 'You, every project (private)', path: path.join(CLAUDE_HOME, 'settings.local.json') },
    { scope: 'This project (shared)', path: path.join(cwd, '.claude', 'settings.json') },
    { scope: 'This project (just you)', path: path.join(cwd, '.claude', 'settings.local.json') },
  ].map(x => ({ ...x, exists: fs.existsSync(x.path) }));
}
// What a project folder would run by itself (cloned repos can ship these).
function projectRisks(cwd) {
  const out = { hooks: [], statusLine: null, mcp: [], env: [], files: [] };
  for (const f of [path.join(cwd, '.claude', 'settings.json'), path.join(cwd, '.claude', 'settings.local.json')]) {
    if (!fs.existsSync(f)) continue;
    const j = readJSON(f) || {};
    for (const [event, groups] of Object.entries(j.hooks || {})) for (const grp of groups || []) for (const hk of grp.hooks || []) out.hooks.push(event + ': ' + [hk.command, ...(hk.args || [])].filter(Boolean).join(' '));
    if (j.statusLine && j.statusLine.command) out.statusLine = j.statusLine.command;
    out.env.push(...Object.keys(j.env || {}));
    out.files.push(f);
  }
  const mcp = readJSON(path.join(cwd, '.mcp.json'));
  if (mcp && mcp.mcpServers) { out.mcp = Object.entries(mcp.mcpServers).map(([n, v]) => n + ': ' + [v.command, ...(v.args || [])].filter(Boolean).join(' ')); out.files.push(path.join(cwd, '.mcp.json')); }
  out.any = !!(out.hooks.length || out.statusLine || out.mcp.length || out.env.length);
  out.hash = sha(out.files.map(f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } }).join('\0'));
  return out;
}
const isTrusted = (cwd, r) => !r.any || ((config.trusted || {})[path.resolve(cwd).toLowerCase()] === r.hash);
function trust(cwd, r) { config.trusted = config.trusted || {}; config.trusted[path.resolve(cwd).toLowerCase()] = r.hash; saveConfig(config); }

async function envInfo(s) {
  const cwd = s.cwd;
  const files = settingsFiles(cwd);
  const hooks = [], allow = [], deny = [];
  let statusLine = null, outputStyle = null;
  for (const f of files) {
    if (!f.exists) continue;
    const j = readJSON(f.path) || {};
    for (const [event, groups] of Object.entries(j.hooks || {})) for (const grp of groups || []) for (const hk of grp.hooks || []) {
      hooks.push({ event, matcher: grp.matcher || '', command: [hk.command, ...(hk.args || [])].filter(Boolean).join(' '), type: hk.type || 'command', async: !!hk.async, scope: f.scope });
    }
    if (j.statusLine && j.statusLine.command && (!/project/i.test(f.scope) || s.trusted)) statusLine = { command: j.statusLine.command, scope: f.scope, padding: j.statusLine.padding || 0 };
    if (j.outputStyle) outputStyle = j.outputStyle;
    if (j.permissions) { allow.push(...(j.permissions.allow || [])); deny.push(...(j.permissions.deny || [])); }
  }
  const memory = [
    { scope: 'You, every project', path: path.join(CLAUDE_HOME, 'CLAUDE.md') },
    { scope: 'This project', path: path.join(cwd, 'CLAUDE.md') },
    { scope: 'This project (just you)', path: path.join(cwd, 'CLAUDE.local.md') },
  ].map(m => { let lines = 0; try { lines = fs.readFileSync(m.path, 'utf8').split('\n').length; } catch { /* missing */ } return { ...m, exists: lines > 0, lines }; });
  const safeGit = ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=' + (IS_WIN ? 'NUL' : '/dev/null'), '-c', 'protocol.allow=never', '-C', cwd];
  const g = await run('git', [...safeGit, 'rev-parse', '--abbrev-ref', 'HEAD'], { timeout: 4000 });
  const st = g.ok ? await run('git', [...safeGit, 'status', '--porcelain'], { timeout: 6000 }) : null;
  const skillDirs = [path.join(CLAUDE_HOME, 'skills'), path.join(cwd, '.claude', 'skills')];
  const skills = [];
  for (const d of skillDirs) { try { for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) skills.push(e.name); } catch { /* none */ } }
  return {
    skills, cwd, branch: g.ok ? g.stdout.trim() : null, changed: st && st.ok ? st.stdout.split('\n').filter(Boolean).length : null,
    os: `${os.type()} ${os.release()}`, node: process.version, app: VERSION,
    settings: files, hooks, statusLine, outputStyle, allow, deny, memory,
  };
}
function gitBash() {
  if (!IS_WIN) return 'bash';
  const c = [process.env.CLAUDE_CODE_GIT_BASH_PATH, 'C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe'].filter(Boolean);
  return c.find(p => fs.existsSync(p)) || 'bash';
}
// Run the user's own Claude Code status line command with the same JSON it gets in the terminal.
const statusCache = new Map();
async function runStatusLine(s, data) {
  // A fresh answer from the last 1.5s is reused before doing any work (envInfo runs git).
  const prev = statusCache.get(s.id);
  if (prev && Date.now() - prev.t < 1500) return prev.out;
  const env = await envInfo(s);
  if (!env.statusLine) return { configured: false };
  const slug = s.cwd.replace(/[^a-zA-Z0-9]/g, '-');
  const input = {
    hook_event_name: 'Status', session_id: s.claudeSessionId || '', cwd: s.cwd,
    transcript_path: s.claudeSessionId ? path.join(CLAUDE_HOME, 'projects', slug, s.claudeSessionId + '.jsonl') : '',
    model: { id: data.modelId || s.model || '', display_name: data.modelName || s.model || 'Default' },
    workspace: { current_dir: s.cwd, project_dir: s.cwd },
    version: data.version || '', output_style: { name: env.outputStyle || 'default' },
    cost: { total_cost_usd: data.cost || 0, total_duration_ms: data.durationMs || 0, total_api_duration_ms: data.apiMs || 0, total_lines_added: data.added || 0, total_lines_removed: data.removed || 0 },
    exceeds_200k_tokens: (data.contextUsed || 0) > 200000,
    context_window: {
      total_input_tokens: data.tokensIn || 0, total_output_tokens: data.tokensOut || 0, context_window_size: data.contextSize || 0,
      current_usage: data.contextUsed || 0,
      used_percentage: data.contextSize ? Math.round((data.contextUsed || 0) / data.contextSize * 100) : 0,
      remaining_percentage: data.contextSize ? 100 - Math.round((data.contextUsed || 0) / data.contextSize * 100) : 100,
    },
    rate_limits: Object.fromEntries(['five_hour', 'seven_day'].filter(k => data.rate && data.rate[k]).map(k => [k, { used_percentage: data.rate[k].pct, resets_at: data.rate[k].resetsAt || null }])),
    effort: { level: data.effort || 'auto' }, workspace_added_dirs: [],
  };
  const out = await new Promise(resolve => {
    let stdout = '', done = false;
    const finish = r => { if (!done) { done = true; resolve(r); } };
    let p;
    try { p = spawn(gitBash(), ['-c', env.statusLine.command], { cwd: s.cwd, windowsHide: true, env: { ...process.env } }); }
    catch (e) { return finish({ configured: true, error: e.message }); }
    const timer = setTimeout(() => { killTree(p); finish({ configured: true, error: 'The status line took too long.' }); }, 4000);
    let stderr = '';
    p.stdout.on('data', d => { stdout += d; if (stdout.length > 20000) stdout = stdout.slice(0, 20000); });
    p.stderr.on('data', d => { stderr = (stderr + d).slice(-600); });
    p.on('error', e => { clearTimeout(timer); finish({ configured: true, error: e.message }); });
    p.on('close', () => { clearTimeout(timer); finish({ configured: true, text: stdout.replace(/\s+$/, ''), stderr: stderr.trim().split('\n').slice(-3).join('\n'), command: env.statusLine.command }); });
    p.stdin.end(JSON.stringify(input));
  });
  statusCache.set(s.id, { t: Date.now(), out });
  return out;
}

// "claude --version" is slow on Windows, so remember the answer for a minute.
let claudeStatusCache = null;
async function claudeStatus() {
  if (claudeStatusCache && Date.now() - claudeStatusCache.t < 60000) return claudeStatusCache.out;
  const out = await claudeStatusFresh();
  claudeStatusCache = { t: Date.now(), out };
  return out;
}
async function claudeStatusFresh() {
  const v = await runClaude(['--version'], { timeout: 20000 });
  const g = await run('git', ['--version']);
  return { claudeFound: v.ok, claudeVersion: v.ok ? v.stdout.trim() : null, gitFound: g.ok };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const p = url.pathname;
  if (!goodHost(req, PORT)) return send(res, 421, 'Wrong host', MIME['.txt']);
  try {
    // Static app
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8').replace('__BR_TOKEN__', TOKEN);
      return send(res, 200, html, MIME['.html']);
    }
    if (req.method === 'GET' && p.startsWith('/static/')) {
      const f = path.join(PUBLIC_DIR, decodeURIComponent(p.slice(8)));
      if (!isInside(PUBLIC_DIR, f) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(res, 404, { error: 'Not found' });
      return send(res, 200, fs.readFileSync(f), MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', { 'Cache-Control': 'max-age=60' });
    }

    if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (!p.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
    if (!authorised(req, url)) return send(res, 403, { error: 'Not allowed' });
    return await handleApi(req, res, url, p);
  } catch (e) {
    return send(res, 500, { error: e.message || String(e) });
  }
});

/* Preview lives on its OWN port (a different web origin). A page Claude builds,
 * or any HTML file in a cloned project, then cannot read the app's secret token
 * or call the API, even though the preview frame allows scripts. */
const previewServer = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  if (!goodHost(req, previewPort)) return send(res, 421, 'Wrong host', MIME['.txt']);
  try {
    // Preview of files Claude builds: /preview/<session>.<key>/<path>
    if (req.method === 'GET' && p.startsWith('/preview/')) {
      const [, , slot, ...rest] = p.split('/');
      const [sid, key] = String(slot).split('.');
      const s = sessions.get(sid);
      if (!s || key !== s.previewKey()) return send(res, 404, 'Not found', MIME['.txt']);
      const parts = decodeURIComponent(rest.join('/')).split(/[\\/]/).filter(Boolean);
      // No hidden files or folders (.env, .git, .claude …) and no "..".
      if (parts.some(x => x.startsWith('.'))) return send(res, 403, 'Not shown in preview', MIME['.txt']);
      let f = path.join(s.cwd, ...parts);
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      if (!fs.existsSync(f)) return send(res, 404, 'Not found yet', MIME['.txt']);
      // Follow shortcuts and junctions, then make sure the real file is still inside the project.
      let real; try { real = fs.realpathSync(f); } catch { return send(res, 404, 'Not found', MIME['.txt']); }
      if (!isInside(fs.realpathSync(s.cwd), real)) return send(res, 403, 'Outside the project', MIME['.txt']);
      f = real;
      let body = fs.readFileSync(f);
      const ext = path.extname(f).toLowerCase();
      // Keep the preview key on relative links inside HTML pages.
      if (ext === '.html') {
        const relDir = path.relative(s.cwd, path.dirname(f)).split(path.sep).join('/');
        body = Buffer.from(body.toString('utf8').replace(/<head([^>]*)>/i, `<head$1><base href="/preview/${slot}/${relDir ? relDir + '/' : ''}">`));
      }
      return send(res, 200, body, MIME[ext] || 'text/plain; charset=utf-8', {
        // Pages may load pictures and styles from the web, but may only talk back to this preview.
        'Content-Security-Policy': `default-src 'self' 'unsafe-inline' data: blob: https:; connect-src 'self'; form-action 'self'; frame-ancestors http://localhost:${PORT} http://${HOST}:${PORT}`,
        ...([`http://localhost:${PORT}`, `http://${HOST}:${PORT}`].includes(req.headers.origin) ? { 'Access-Control-Allow-Origin': req.headers.origin, Vary: 'Origin' } : {}),
      });
    }
    return send(res, 404, 'Not found', MIME['.txt']);
  } catch (e) {
    return send(res, 500, 'Preview error', MIME['.txt']);
  }
});
let previewPort = 0;
previewServer.listen(0, HOST, () => { previewPort = previewServer.address().port; });

async function handleApi(req, res, url, p) {
  {
    if (req.method === 'GET' && p === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(': hello\n\n');
      // Replay history so a refreshed page catches up.
      const all = [...sessions.values()].flatMap(s => s.log).sort((a, b) => a.seq - b.seq);
      for (const ev of all) res.write(`data: ${JSON.stringify(ev)}\n\n`);
      res.write(`data: ${JSON.stringify({ seq: eventSeq, kind: 'hello', data: { replayed: all.length } })}\n\n`);
      clients.add(res);
      const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* */ } }, 20000);
      req.on('close', () => { clients.delete(res); clearInterval(ping); });
      return;
    }

    if (req.method === 'GET' && p === '/api/info') {
      const st = await claudeStatus();
      return send(res, 200, {
        version: VERSION, platform: process.platform, home: os.homedir(), ...st, previewPort,
        practice: !!process.env.BYTE_RUNNER_PRACTICE,
        recentProjects: (config.recentProjects || []).filter(d => fs.existsSync(d)), lastChats: config.lastChats || {},
        sessions: [...sessions.values()].map(s => s.info()),
      });
    }

    if (req.method === 'POST' && p === '/api/pick-folder') {
      return send(res, 200, { folder: await pickFolder() });
    }

    if (req.method === 'POST' && p === '/api/make-folder') {
      const body = await readBody(req);
      const base = path.join(os.homedir(), 'Easy Mode Projects');
      const name = String(body.name || 'my-project').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'my-project';
      let dir = path.join(base, name); let n = 2;
      while (fs.existsSync(dir)) dir = path.join(base, `${name} ${n++}`);
      fs.mkdirSync(dir, { recursive: true });
      return send(res, 200, { folder: dir });
    }

    if (req.method === 'POST' && p === '/api/login') {
      openTerminal(os.homedir(), []);
      return send(res, 200, { ok: true });
    }


    if (req.method === 'POST' && p === '/api/session/start') {
      const body = await readBody(req);
      const cwd = String(body.cwd || '');
      if (!cwd || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) return send(res, 400, { error: 'That folder does not exist.' });
      const risks = projectRisks(cwd);
      if (body.trust === true && risks.any) trust(cwd, risks);
      const trusted = isTrusted(cwd, risks);
      if (!trusted && body.trust !== false) return send(res, 200, { needsTrust: true, risks: { hooks: risks.hooks, statusLine: risks.statusLine, mcp: risks.mcp, env: risks.env } });
      const bad = clean(body);
      if (bad) return send(res, 400, { error: bad });
      const s = new Session({ cwd, mode: body.mode, model: body.model, effort: body.effort, resume: body.resume, title: body.title, safeSettings: !trusted });
      sessions.set(s.id, s);
      rememberProject(s.cwd);
      s.start();
      return send(res, 200, { session: s.info() });
    }

    const m = p.match(/^\/api\/session\/([a-f0-9]+)\/([a-z-]+)$/);
    if (m) {
      const s = sessions.get(m[1]);
      if (!s) return send(res, 404, { error: 'Session not found' });
      const action = m[2];
      if (req.method !== 'POST' && !READ_ONLY.has(action)) return send(res, 405, { error: 'Use POST' });
      const body = req.method === 'POST' ? await readBody(req, action === 'send' ? 25 * 1024 * 1024 : 1024 * 1024) : {};

      if (action === 'send') { const ok = await s.send(body.text, body.attachments); return send(res, ok ? 200 : 409, { ok }); }
      if (action === 'permission') return send(res, 200, { ok: s.answerPermission(String(body.requestId), body) });
      if (action === 'interrupt') { const r = await s.control({ subtype: 'interrupt' }, 8000); return send(res, 200, { ok: !!r }); }
      if (action === 'mode') {
        const mode = String(body.mode);
        if (!MODES.includes(mode)) return send(res, 400, { error: 'Unknown mode' });
        const r = await s.control({ subtype: 'set_permission_mode', mode }, 8000);
        if (r && r.subtype === 'success') { s.mode = mode; s.emitApp('settings'); return send(res, 200, { ok: true }); }
        if (s.busy) { s.queued = { ...(s.queued || {}), mode }; return send(res, 200, { ok: true, queued: true }); }
        s.restart({ mode }); return send(res, 200, { ok: true, restarted: true });
      }
      if (action === 'model') {
        const bad = clean(body); if (bad) return send(res, 400, { error: bad });
        const model = body.model ? String(body.model) : null;
        const effort = body.effort ? String(body.effort) : s.effort;
        if (effort !== s.effort) { if (s.busy) { s.queued = { ...(s.queued || {}), model, effort }; return send(res, 200, { ok: true, queued: true }); } s.restart({ model, effort }); return send(res, 200, { ok: true, restarted: true }); }
        const r = await s.control({ subtype: 'set_model', model: model || 'default' }, 8000);
        if (r && r.subtype === 'success') { s.model = model; s.emitApp('settings'); return send(res, 200, { ok: true }); }
        if (s.busy) { s.queued = { ...(s.queued || {}), model }; return send(res, 200, { ok: true, queued: true }); }
        s.restart({ model }); return send(res, 200, { ok: true, restarted: true });
      }
      if (action === 'undo') {
        const cp = s.checkpoints.find(c => c.id === body.checkpoint);
        if (!cp) return send(res, 404, { error: 'Save point not found' });
        if (s.busy) return send(res, 409, { error: 'Wait for Claude to finish first.' });
        const r = await s.savepoints.restore(cp.commit);
        if (r.ok) {
          s.checkpoints = s.checkpoints.filter(c => c.t < cp.t);
          s.turnCommit = cp.commit;
          s.redoCommit = r.redo || null;
          s.emitApp('undone', { label: cp.label, redo: !!r.redo });
          // Tell Claude with the next message, so it does not assume its edits are still there.
          s.pendingNote = `(Note from the Easy Mode app: I pressed Undo, so the project files were rolled back to how they were before "${cp.label}". Files may differ from what you remember, so check before editing.)`;
        }
        return send(res, r.ok ? 200 : 500, r);
      }
      if (action === 'redo') {
        if (!s.redoCommit) return send(res, 404, { error: 'Nothing to redo.' });
        if (s.busy) return send(res, 409, { error: 'Wait for Claude to finish first.' });
        const r = await s.savepoints.restore(s.redoCommit);
        if (r.ok) { s.redoCommit = null; s.emitApp('redone'); s.scheduleChanges(50); s.pendingNote = '(Note from the Easy Mode app: I pressed Redo, so the files Claude changed are back. Check them before editing.)'; }
        return send(res, r.ok ? 200 : 500, r);
      }
      if (action === 'diff') return send(res, 200, { diff: await s.savepoints.diff(s.turnCommit, body.file || url.searchParams.get('file')) });
      if (action === 'terminal') {
        if (s.busy) return send(res, 409, { error: 'Claude is still working. Wait for it to finish, or press Stop, then open the terminal.' });
        // Hand the very same conversation to a real terminal.
        if (!s.claudeSessionId) return send(res, 409, { error: 'Send one message first, then you can open it in the terminal.' });
        s.inTerminal = true; s.status = 'terminal';
        s.stop();
        openTerminal(s.cwd, ['--resume', s.claudeSessionId, '--permission-mode', s.mode, ...(s.model ? ['--model', s.model] : []), ...(s.effort ? ['--effort', s.effort] : [])]);
        s.emitApp('terminal');
        return send(res, 200, { ok: true });
      }
      if (action === 'reclaim') {
        s.inTerminal = false;
        s.restart({});
        s.emitApp('reclaimed');
        return send(res, 200, { ok: true });
      }
      if (action === 'open-folder') {
        if (IS_WIN) spawn('explorer.exe', [s.cwd], { detached: true, stdio: 'ignore' }).unref();
        else openBrowser(s.cwd);
        return send(res, 200, { ok: true });
      }
      if (action === 'close') {
        clearTimeout(s.changeTimer); s.stop(); sessions.delete(s.id);
        broadcast(s.id, 'app', { type: 'closed' });
        return send(res, 200, { ok: true });
      }
      if (action === 'env') return send(res, 200, { ...(await envInfo(s)), trusted: s.trusted, risks: projectRisks(s.cwd) });
      if (action === 'statusline') return send(res, 200, await runStatusLine(s, body.data || {}));
      if (action === 'open-file') {
        // Only files we listed ourselves (settings and CLAUDE.md), opened in the user's editor.
        const env = await envInfo(s), ok = [...env.settings.map(x => x.path), ...env.memory.map(x => x.path)];
        const f = String(body.path || '');
        if (!ok.includes(f)) return send(res, 403, { error: 'Not allowed' });
        if (!fs.existsSync(f)) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, f.endsWith('.json') ? '{\n}\n' : '# Notes for Claude\n'); }
        if (IS_WIN) spawn('notepad.exe', [f], { detached: true, stdio: 'ignore' }).unref(); else openBrowser(f);
        return send(res, 200, { ok: true });
      }
      if (action === 'files') {
        const out = [];
        const walk = (dir, depth) => {
          if (out.length > 400 || depth > 4) return;
          let items = [];
          try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
          for (const it of items.sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name))) {
            if (it.name.startsWith('.') || ['node_modules', '__pycache__', 'venv', '.venv', 'dist', 'build'].includes(it.name)) continue;
            const full = path.join(dir, it.name);
            out.push({ path: path.relative(s.cwd, full).split(path.sep).join('/'), dir: it.isDirectory(), depth });
            if (it.isDirectory()) walk(full, depth + 1);
          }
        };
        walk(s.cwd, 0);
        return send(res, 200, { files: out });
      }
      return send(res, 404, { error: 'Unknown action' });
    }

    return send(res, 404, { error: 'Not found' });
  }
}

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.log(`\n  Easy Mode already seems to be running. Opening it in your browser...\n`);
    openBrowser(`http://localhost:${PORT}`);
    setTimeout(() => process.exit(0), 500);
  } else { console.error(e); process.exit(1); }
});

server.listen(PORT, HOST, async () => {
  const url = `http://localhost:${PORT}`;
  console.log('');
  console.log('  ██████  EASY MODE for Claude Code  v' + VERSION);
  console.log('  ██  ██  A friendly home for Claude Code');
  console.log('  ██████');
  console.log('');
  console.log('  Open ' + url + ' (it should open by itself)');
  console.log('  Keep this window open while you use it. Close it to quit.');
  console.log('');
  if (!process.argv.includes('--no-open')) openBrowser(url);
});

function shutdown() {
  for (const s of sessions.values()) { const p = s.proc; try { p && p.stdin.end(); } catch { /* */ } setTimeout(() => killTree(p), 400); }
  setTimeout(() => process.exit(0), 900);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown); // Windows: the console window was closed
