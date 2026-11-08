# Easy Mode v0.2 review brief (shared by all reviewers)

Easy Mode is a free, Windows-first browser UI for the official Claude Code CLI. A zero-dependency Node server (`server.js`) runs the real `claude` binary in stream-json mode for each project and streams events to a browser page. Its goal is to beat both the Claude Code CLI and the Claude desktop app on usability and configurability, for non-technical and technical users alike.

Project folder: `%USERPROFILE%\Projects\Easy Mode`. It is READ ONLY for you, so do not edit, create or delete anything in it.
The new UI under review is in `public-next/`:
- `index.html`, `style.css`
- `app.js`: the main logic, about 1,600 lines
- `grid.js`: the drag and resize board
- `world.js`: pixel and cartoon scenes and the mini-game
- `skins.js`: themes, words and sounds
- `art/`: sprites cut from owner-supplied art

The server is `server.js`. Background is in `HANDOVER.md`, the plan is in `docs/PLAN-v0.2.md` and the current state is in `docs/RESUME.md`.

## Rules
- Practice mode only, which uses a pretend Claude. Never send prompts to the real `claude` CLI, because that spends the owner's Claude Pro usage.
- Never touch real user files outside the scratch folder you are given. Never kill processes you did not start.
- Stop any server you start when you are done.

## How to run your own copy
Start a server in the background, then drive headless Edge with the harness:

  cd "%USERPROFILE%/Projects/Easy Mode" && BYTE_RUNNER_UI=public-next BYTE_RUNNER_PORT=<yourport> FAKE_FAST=1 node tools/practice.js --no-open
  UI_SCRIPT=<your-scenario.js> node tools/dev/ui.js http://localhost:<yourport>/ <your-output-folder>

To watch the motion in real time, leave FAKE_FAST off.

A scenario is `module.exports = async ({ js, shot, sleep, cmd }) => {...}`:
- `js(expr)` evaluates code in the page.
- `shot(name)` saves a 1600x1000 PNG.
- `cmd` is the raw DevTools protocol. For example, `cmd('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true})`. To reload, use `cmd('Page.reload', {})`, not `location.reload()` inside `js()`.

`tools/dev/tour.js` is a full example walkthrough (welcome, new project, send, approve). Run it with SKIN=goodboy|arcade and PRESET=simple|power|focus|show|builder. Look at your screenshots with the Read tool.

Key UI:
- `#welcomeGo` (first run), `#newName` + `#makeFolderBtn`, `#prompt` + `#sendBtn`.
- Permission cards are `.card.pending` with buttons.
- `#layoutBtn` is Customise. It turns on arrange mode with presets, "+ Add a block", drag by the `.cell-grip` bar and resize by `.cell-resize`.
- Ctrl+K opens the palette. `?` shows shortcuts. 🎨 switches theme. 🔔 sets sound mode.
- The board has blocks: chat, scene, inbox, statusline, env, hooks, memory, usage, timeline, files, notes, prompts, agents, player, stats, quests, saves, changes, preview, helpers, skills, tokens, context and tally.

## Deliver
Return a report of at most ~800 words as your final message (the harness may block writing report files):
1. Findings ranked by severity or value, each with concrete evidence (a file and line, or steps and a screenshot name) and a concrete fix.
2. What is good and should be kept.
No vague advice.
