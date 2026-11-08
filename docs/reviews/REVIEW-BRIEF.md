# Byte Runner review brief (shared by all reviewers)

## What it is
Byte Runner (v0.1.0) is a free, open source, Windows-first, arcade-styled browser UI for the official Claude Code CLI.
A zero-dependency Node server (`server.js`) runs the real `claude` binary in stream-json mode per project tab and
streams events to a browser page (`public/index.html`, `public/app.js`, `public/style.css`, `public/world.js`).
Goal: keep everything good about the Claude Code CLI (skills, hooks, MCP, slash commands, models, effort, permission modes,
sub-agents, CLAUDE.md) and bring in the good parts of the Claude desktop app (no terminal, diffs, preview, attachments,
multiple sessions), so it beats BOTH for non-technical and technical users.

Project folder (READ ONLY for you, do not edit anything in it): `%USERPROFILE%\Projects\Byte Runner`
Full background: `%USERPROFILE%\Projects\Byte Runner\HANDOVER.md`

## Rules
- Do NOT edit, create or delete files in the project folder. You give feedback only.
- Do NOT use the real `claude` CLI to send prompts (it spends the owner's Claude Pro usage). Practice mode only.
- Keep all art original. No Pac-Man, its ghosts, pellet mazes, or any other known character or brand.
- Put screenshots and notes in your own folder (given in your task). Stop your own server when done.

## How to run your own copy (practice mode = pretend Claude, plays a scripted cat-cafe build whatever you type)
Start a server on YOUR port (run_in_background):
  cd "%USERPROFILE%/Projects/Byte Runner" && BYTE_RUNNER_PORT=<yourport> node tools/practice.js --no-open
Then open http://localhost:<yourport>/ in headless Edge with the harness:
  UI_SCRIPT=<your-scenario.js> node "<scratch>/ui.js" http://localhost:<yourport>/ <your-output-folder>
`ui.js` is in the scratch folder: %TEMP%\claude\9519414f725d5b3e\8dc6e8fa-3b53-425c-8230-513263ad02d5\scratchpad
A scenario is a CommonJS module `module.exports = async ({ js, shot, sleep, cmd }) => {...}`:
  js(expr) evaluates in the page, shot(name) saves <name>.png in the output folder (1600x1000), cmd() is raw DevTools protocol
  (e.g. cmd('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true}) for phone).
Examples in the scratch folder: say-hi.js (new project + send), stale.js. Look at screenshots with the Read tool.
Useful selectors: #newName + #makeFolderBtn (new project), #prompt + #sendBtn (send), permission cards appear in #feed
(buttons inside them), .side-tab[data-tab=changes|preview|helpers|powerups], #modeSel, #modelSel, #effortSel, #undoBtn.
Set env FAKE_FAST=1 on the server to make the pretend Claude instant; leave it off to watch motion in real time.
There is also a single-file web demo at `dist/byte-runner-demo.html` (open via file:/// URL).

## The owner's verdict so far
- "The graphics are just not enough to blow anyone's mind away. And motions are also not up to the mark."
- Visually it is far below two reference samples (described below). Must be top quality and fun.
- When bored, users should be able to PLAY A GAME while Claude works.
- The app must tell you when something is DONE or something is WAITING for you, in any session, with something visual AND a sound.
- Users don't know what's possible, so let them CUSTOMISE THEIR VIEW: choose what they see across the screen instead of one fixed layout.
- The owner personally wants to see: context window usage; which skills have been used so far and which are active right now;
  where token usage is going (which areas are token heavy, to optimise later); sub-agents, and be able to drill into one and check on it;
  notifications when done/needs me, and easy tracking across several sessions.

## The reference samples (images the owner showed; built by someone else, do NOT copy them, beat them)
Instagram "Claude Code skins" by a creator. Six themes, one layout idea: the Claude Code session as a dense, framed, retro
cabinet UI. Arcade theme details: deep black/navy screen, every panel framed by a thick bright blue double border with a dotted
"marquee" rule; top bar = "PLAYER 1 · CLAUDE / Claude Code v2.1.282 / Opus 5.5 · Claude Max · ~/mochi" + big ARCADE logo +
"1UP · PLAYING new game" + "2UP · FREE no saved game" + "INSERT COIN + NEW GAME" button. Left column: "STAGE SELECT 2/2" (task list
with icons and ticks), "GAME STATS" (rounds 3, play time 51s, tokens in/out 232k / 2.6k, coins in $0.33 equivalent cost).
Centre: transcript where the user prompt is a framed "PLAYER 1 SAYS" box, tool activity lines ("fetched anthropic.com · 8 rows"),
and Claude's answer rendered RICHLY as an inline bar chart comparing benchmarks (two series, labelled rows, values), plus "STAGE
CLEAR · 25s · $0.19" and "CPU THINKS 440 TOK" with a progress strip. Right: "GHOSTS OUT · 0" (sub-agents panel with sprites, "ALL HOME"),
"HIGH SCORES · FILES" (rank, file name cat.js, +7 -0 score = lines changed). Bottom composer "INSERT MESSAGE write to Claude…" with
key hints chips (start, new line, pause, moves, items) and a QUEUE button. Bottom status bar crammed with labelled meters: CPU (model),
DIFFICULTY (effort HIGH), GAME MODE (ASK FIRST), CONTEXT with dotted bar and %, AUTO-EATEN (auto-compact), 5 HOURS lives (+ refill time),
WEEK level (74%, refill Tue), SCORE · THIS SESSION $0.33. Other themes: paper notebook/"tributary" sketch, a green-field RPG "adventure"
with castle, a candy-coloured "order up" cafe/blender theme with "the recipe", "the pour", "the crew", a cosy beige "slow" theme with
analog dials, and an isometric pixel room. Takeaways: density of genuinely useful info, every number labelled in-theme, rich rendered
output (charts/tables), strong framing, multiple switchable skins.

## Current state (screenshot available at <scratch>/03-after-hi.png and now-desktop.png)
Soft modern dark-purple app with pixel accents: top bar (logo, project tabs, Undo, Terminal, sound), left (PLAYER 1, QUEST LOG,
SAVE POINTS), centre (animated pixel city canvas with a robot "Bit", feed of messages/tool rows, composer), right tabs (CHANGES,
PREVIEW, HELPERS, POWER-UPS), status bar (SAFETY, MODEL, EFFORT, MEMORY, 5 HOURS, WEEK).

## What the real CLI exposes (so you know what data is available)
Handshake `initialize` returns: commands (109 incl. user skills), agents (10), models (13, with effort levels), account
(email, subscriptionType e.g. "Claude Pro", apiProvider), output styles, fast_mode_state, current_permission_mode.
Stream events: system/init (tools, mcp_servers, skills, slash_commands, model, cwd), stream_event deltas (text, thinking, tool input),
assistant messages with per-message usage (input, output, cache read, cache creation tokens), tool_use/tool_result incl. Skill tool
and Agent/Task tool (sub-agent steps carry parent_tool_use_id), can_use_tool permission requests (incl. AskUserQuestion, ExitPlanMode),
result (cost_usd, duration, num_turns, usage, modelUsage per model), rate_limit_event (five_hour / seven_day utilization + resetsAt),
autocompact_state (effective window), compact boundaries, task notifications.

## Deliver
A report (markdown, max ~900 words) saved to your output folder AND returned as your final message, with:
1. Top 10 findings, ranked by value to users, each tagged WOW / USABILITY / EASE / VALUE, with effort S/M/L.
2. Bugs or broken things you hit (with steps).
3. What would make you choose this over the Claude Code CLI and over the Claude desktop app, and what would stop you.
Be concrete (which panel, what it should show, how it should move). No vague advice.
