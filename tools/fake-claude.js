#!/usr/bin/env node
/*
 * A pretend Claude Code that speaks the same stream-json protocol.
 * Used for testing Byte Runner without a login, and for recording the demo.
 * Usage: set CLAUDE_PATH="node tools/fake-claude.js" (or point at this file).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.319 (Claude Code, pretend)'); process.exit(0); }
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
let mode = flag('--permission-mode') || 'default';
let model = flag('--model') || 'claude-opus-5-5';
const sessionId = flag('--resume') || crypto.randomUUID();
const out = o => process.stdout.write(JSON.stringify({ ...o, session_id: sessionId, uuid: crypto.randomUUID() }) + '\n');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fast = process.env.FAKE_FAST === '1';
const wait = ms => sleep(fast ? 5 : ms);

const waiters = new Map();
let interrupted = false;
let cost = 0;
let turn = 0;

function control(request) {
  const request_id = 'cli_' + crypto.randomBytes(4).toString('hex');
  process.stdout.write(JSON.stringify({ type: 'control_request', request_id, request }) + '\n');
  return new Promise(r => waiters.set(request_id, r));
}

async function streamText(text, parent = null) {
  const id = 'msg_' + crypto.randomBytes(6).toString('hex');
  out({ type: 'stream_event', parent_tool_use_id: parent, event: { type: 'message_start', message: { id, model } } });
  out({ type: 'stream_event', parent_tool_use_id: parent, event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } });
  const words = text.split(/(\s+)/);
  for (let i = 0; i < words.length; i += 3) {
    if (interrupted) break;
    out({ type: 'stream_event', parent_tool_use_id: parent, event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: words.slice(i, i + 3).join('') } } });
    await wait(45);
  }
  out({ type: 'stream_event', parent_tool_use_id: parent, event: { type: 'content_block_stop', index: 0 } });
  out({ type: 'assistant', parent_tool_use_id: parent, message: { id, model, role: 'assistant', content: [{ type: 'text', text }],
    usage: { input_tokens: 2100 + turn * 900, cache_read_input_tokens: 18000 + turn * 4000, cache_creation_input_tokens: 1200, output_tokens: 300 } } });
}

async function useTool(name, input, resultText, { parent = null, ask = false, doIt } = {}) {
  const id = 'toolu_' + crypto.randomBytes(6).toString('hex');
  out({ type: 'assistant', parent_tool_use_id: parent, message: { id: 'msg_' + id, model, role: 'assistant', content: [{ type: 'tool_use', id, name, input }],
    usage: { input_tokens: 2400 + turn * 900, cache_read_input_tokens: 19000 + turn * 4000, cache_creation_input_tokens: 800, output_tokens: 180 } } });
  let finalInput = input;
  if (ask) {
    const r = await control({ subtype: 'can_use_tool', tool_name: name, input, tool_use_id: id,
      permission_suggestions: [{ type: 'addRules', rules: [{ toolName: name }], behavior: 'allow', destination: 'session' }] });
    const resp = r && r.response && r.response.response;
    if (!resp || resp.behavior !== 'allow') {
      out({ type: 'user', parent_tool_use_id: parent, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content: (resp && resp.message) || 'Denied' }] } });
      return { id, denied: true };
    }
    finalInput = resp.updatedInput || input;
  }
  await wait(500);
  if (doIt) doIt(finalInput);
  const text = typeof resultText === 'function' ? resultText(finalInput) : resultText;
  out({ type: 'user', parent_tool_use_id: parent, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: text }] }, tool_use_result: {} });
  return { id, input: finalInput };
}

const needsAsk = tool => {
  if (mode === 'bypassPermissions') return false;
  if (mode === 'plan') return false;
  if (mode === 'acceptEdits') return tool === 'Bash';
  return ['Bash', 'Write', 'Edit'].includes(tool);
};

const CAFE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Whisker & Bean</title><link rel="stylesheet" href="style.css"></head>
<body><header><h1>Whisker &amp; Bean</h1><p>Coffee, cake and twelve very sleepy cats.</p></header>
<main><section class="card"><h2>Today's cats</h2><ul><li>Mochi, napping</li><li>Biscuit, judging you</li><li>Pepper, wants your muffin</li></ul></section>
<section class="card"><h2>Opening hours</h2><p>Every day, 8am to 6pm</p></section></main></body></html>
`;
const CAFE_CSS = `body{margin:0;font-family:system-ui;background:#fff7ee;color:#3b2a24}
header{padding:60px 24px;text-align:center;background:linear-gradient(135deg,#ffcfa8,#ffd9e4)}
h1{font-size:44px;margin:0}main{display:grid;gap:18px;padding:24px;max-width:720px;margin:auto}
.card{background:white;border-radius:18px;padding:20px;box-shadow:0 8px 24px #f3cdb8}
`;

async function handleTurn(text, cwd) {
  turn++;
  interrupted = false;
  out({ type: 'system', subtype: 'status', status: 'requesting' });
  await wait(600);
  out({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', utilization: 0.12 + turn * 0.04, resetsAt: Math.floor(Date.now() / 1000) + 3 * 3600 } });
  out({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: 0.31 + turn * 0.01, resetsAt: Math.floor(Date.now() / 1000) + 4 * 86400 } });

  if (/undo|note from the app/i.test(text)) { await finish('Got it.'); return; }

  if (mode === 'plan') {
    await streamText("Let me look around first so the plan fits what's already here.");
    await useTool('Glob', { pattern: '**/*' }, 'No files found');
    const plan = '## Plan\n1. Create **index.html** with a header, cat list and opening hours\n2. Add **style.css** with warm, soft colours\n3. Open it in the preview so you can see it';
    const r = await control({ subtype: 'can_use_tool', tool_name: 'ExitPlanMode', input: { plan }, tool_use_id: 'toolu_plan' + turn });
    const ok = r && r.response && r.response.response && r.response.response.behavior === 'allow';
    await finish(ok ? 'Plan approved. Switch to a building mode and say "go" when ready.' : 'No problem, tell me what to change in the plan.');
    return;
  }

  await streamText("Ooh, a cat café website! I'll set up a simple page with a cosy look. Here's my game plan.");
  await useTool('TodoWrite', { todos: [
    { content: 'Check what is in the folder', status: 'in_progress', activeForm: 'Checking the folder' },
    { content: 'Research what cat café sites usually show', status: 'pending', activeForm: 'Researching cat café sites' },
    { content: 'Build the home page', status: 'pending', activeForm: 'Building the home page' },
    { content: 'Add warm, friendly styling', status: 'pending', activeForm: 'Adding styling' }] }, 'Todos updated');
  await useTool('Glob', { pattern: '**/*' }, 'No files found');
  await useTool('TodoWrite', { todos: [
    { content: 'Check what is in the folder', status: 'completed', activeForm: 'Checking the folder' },
    { content: 'Research what cat café sites usually show', status: 'in_progress', activeForm: 'Researching cat café sites' },
    { content: 'Build the home page', status: 'pending', activeForm: 'Building the home page' },
    { content: 'Add warm, friendly styling', status: 'pending', activeForm: 'Adding styling' }] }, 'Todos updated');
  const agent = await (async () => {
    const id = 'toolu_agent' + turn;
    out({ type: 'assistant', parent_tool_use_id: null, message: { id: 'msg_' + id, model, role: 'assistant', content: [{ type: 'tool_use', id, name: 'Agent', input: { description: 'Research cat café websites', prompt: 'Find what cat café websites usually include', subagent_type: 'general-purpose' } }] } });
    out({ type: 'system', subtype: 'task_started', task_id: 'task_' + turn, tool_use_id: id, description: 'Research cat café websites' });
    await useTool('WebSearch', { query: 'cat cafe website ideas' }, 'Results: menus, cat profiles, booking, house rules', { parent: id });
    await wait(400);
    await useTool('WebFetch', { url: 'https://example.com/cat-cafes', prompt: 'What do they show?' }, 'Cat profiles and opening hours are the most common.', { parent: id });
    await streamText('Most cat café sites show the cats with names, opening hours and a booking button.', id);
    out({ type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'Cat profiles, hours and booking are the big three.' }] } });
    out({ type: 'system', subtype: 'task_notification', task_id: 'task_' + turn, status: 'completed', summary: 'Found what cat café sites show' });
  })();
  void agent;
  await useTool('TodoWrite', { todos: [
    { content: 'Check what is in the folder', status: 'completed', activeForm: 'Checking the folder' },
    { content: 'Research what cat café sites usually show', status: 'completed', activeForm: 'Researching cat café sites' },
    { content: 'Build the home page', status: 'in_progress', activeForm: 'Building the home page' },
    { content: 'Add warm, friendly styling', status: 'pending', activeForm: 'Adding styling' }] }, 'Todos updated');
  await useTool('Write', { file_path: path.join(cwd, 'index.html'), content: CAFE_HTML }, 'File created successfully', {
    ask: needsAsk('Write'), doIt: () => fs.writeFileSync(path.join(cwd, 'index.html'), CAFE_HTML) });
  await useTool('Write', { file_path: path.join(cwd, 'style.css'), content: CAFE_CSS }, 'File created successfully', {
    ask: needsAsk('Write'), doIt: () => fs.writeFileSync(path.join(cwd, 'style.css'), CAFE_CSS) });
  await useTool('Bash', { command: 'dir', description: 'List the files in the project folder' }, 'index.html  style.css', { ask: needsAsk('Bash') });
  await useTool('TodoWrite', { todos: [
    { content: 'Check what is in the folder', status: 'completed', activeForm: 'Checking the folder' },
    { content: 'Research what cat café sites usually show', status: 'completed', activeForm: 'Researching cat café sites' },
    { content: 'Build the home page', status: 'completed', activeForm: 'Building the home page' },
    { content: 'Add warm, friendly styling', status: 'completed', activeForm: 'Adding styling' }] }, 'Todos updated');
  await finish("Done! Your café site is ready with a peachy header, the cat list and opening hours. Open **index.html** in the preview to see it. Want me to add a booking button next?");
}

async function finish(text) {
  await streamText(text);
  cost += 0.11 + Math.random() * 0.08;
  out({ type: 'result', subtype: 'success', is_error: false, num_turns: 6, duration_ms: 21000, duration_api_ms: 15000, total_cost_usd: Number(cost.toFixed(4)),
    result: text, usage: { input_tokens: 9000, output_tokens: 1800, cache_read_input_tokens: 42000 }, permission_denials: [] });
}

const rl = readline.createInterface({ input: process.stdin });
let queue = Promise.resolve();
let started = false;
rl.on('line', line => {
  let msg; try { msg = JSON.parse(line); } catch { return; }
  if (msg.type === 'control_response') {
    const w = waiters.get(msg.response.request_id);
    if (w) { waiters.delete(msg.response.request_id); w(msg); }
    return;
  }
  if (msg.type === 'control_request') {
    const r = msg.request;
    let response = {};
    if (r.subtype === 'initialize') {
      response = {
        commands: [{ name: 'compact', description: 'Shrink the conversation to free up space' }, { name: 'review', description: 'Review the code changes' },
          { name: 'init', description: 'Write a CLAUDE.md about this project' }, { name: 'cafe-menu', description: '(my skill) Write a café menu in house style' }],
        agents: [{ name: 'general-purpose', description: 'General helper' }],
        models: [
          { value: 'default', displayName: 'Default (recommended)', description: 'Opus 5.5', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'] },
          { value: 'sonnet', displayName: 'Sonnet', description: 'Sonnet 5.5, fast and capable', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high'] },
          { value: 'haiku', displayName: 'Haiku', description: 'Haiku 5.5, quickest', supportsEffort: false }],
        account: process.env.FAKE_LOGGED_OUT ? { apiProvider: 'firstParty' } : { email: 'practice@example.com', subscriptionType: 'Practice (pretend)', apiProvider: 'firstParty' },
        claude_code_version: '2.1.319 (pretend)', current_permission_mode: mode, output_style: 'default',
      };
      if (!started) { started = true; setTimeout(() => {
        process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', cwd: process.cwd(), session_id: sessionId, model, permissionMode: mode, tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Agent', 'TodoWrite'], mcp_servers: [], slash_commands: ['compact', 'review', 'init'], apiKeySource: 'none', claude_code_version: '2.1.319' }) + '\n');
        process.stdout.write(JSON.stringify({ type: 'autocompact_state', value: { enabled: true, effective_window: 980000 } }) + '\n');
      }, 50); }
    } else if (r.subtype === 'set_permission_mode') { mode = r.mode; }
    else if (r.subtype === 'set_model') { model = r.model; }
    else if (r.subtype === 'interrupt') { interrupted = true; }
    process.stdout.write(JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: msg.request_id, response } }) + '\n');
    return;
  }
  if (msg.type === 'user') {
    const text = (msg.message.content.find(b => b.type === 'text') || {}).text || '';
    if (process.env.FAKE_LOGGED_OUT) {
      queue = queue.then(() => {
        out({ type: 'assistant', error: 'authentication_failed', message: { role: 'assistant', model: '<synthetic>', content: [{ type: 'text', text: 'Not logged in · Please run /login' }] } });
        out({ type: 'result', subtype: 'success', is_error: true, api_error_status: 401, result: 'Not logged in', total_cost_usd: 0, num_turns: 1, duration_ms: 100 });
      });
      return;
    }
    queue = queue.then(() => handleTurn(text, process.cwd()));
  }
});
rl.on('close', () => setTimeout(() => process.exit(0), 100));
