# Easy Mode · Handover

Everything you (or Claude Code on your PC) need to pick this project up and keep going.

Last updated 8 November 2026 (evening). Version 0.2.0.

---

## 1. The idea in one paragraph

Easy Mode is a free, open source, colourful home for **Claude Code**. It runs the official `claude` CLI on your own computer and shows everything in a fun arcade-style browser screen. The goal is to give people the **best of both** the Claude Code CLI and the Claude desktop app, and to remove the things that make non-technical people give up on the terminal. It is Windows-first, because most beginners are on Windows and most tools ignore them.

## 2. Why we are building it (research summary)

People don't quit Claude Code because it's hard. They quit because the terminal feels hostile.

- **Setup breaks them first.** Node versions, PATH problems and Windows quirks stop people within five minutes.
- **Fear of breaking things.** The most common worry is "I am afraid I am going to break something", and the terminal has no undo button.
- **Permission prompts feel scary.** People read them "like a legal document", or switch them off completely, which is risky.
- **The blank screen.** People freeze and don't know what to type.
- **Small annoyances.** Pasting images is a hassle, and juggling lots of projects is clunky.

**What already exists.** There are GUI apps for Claude Code. opcode (formerly Claudia) has about 22k stars but no public commits since October 2025. CloudCLI and Nimbalyst also exist, and Anthropic's own desktop app targets non-terminal users. None of them is Windows-first, skinnable and focused on beginners, with Undo and plain English permissions.

**Sources**
- https://www.lava.so/blog/why-serious-ai-work-happens-in-a-terminal
- https://michaelcrist.substack.com/p/claude-code
- https://crystl.dev/compare/claude-code-guis/
- https://blog.laozhang.ai/en/posts/claude-code-desktop-vs-terminal

## 3. The subscription rule (important)

Anthropic does **not** allow third-party apps to log in with a Claude subscription, or to route requests through Free, Pro or Max credentials. They enforce it on their servers, starting January 2026, and they made it explicit in their docs in February 2026.

**How Easy Mode stays on the right side of this.** It never touches logins or tokens. It starts the official `claude` program on the user's own machine, and that program signs in the normal way. So subscriptions, API keys and Bedrock all work, with no auth code of ours. Re-read https://code.claude.com/docs/en/legal-and-compliance before any public launch, because this area keeps changing.

**Never add** OAuth flows, token extraction, or a hosted version that runs Claude for other people.

## 4. Design decisions

- **Original art only.** The user wanted a Pac-Man style. Pac-Man and its ghosts are protected characters, so we made an original arcade world instead. Bit is a small mint robot who runs through a sunset pixel city. Tool use drops gems, helpers are drones, cost is coins, and finished turns get a LEVEL CLEAR banner. **Do not add Pac-Man, its ghosts, mazes with pellets, or any other known character or brand.**
- **Inspiration, not a copy.** The idea came from Instagram creator kem_glitch's Claude Code "skins". We deliberately did not copy his designs.
- **Colours.** "Arcade Dusk" palette. It's colourful but easy on the eyes, with no pure black or white.

| Name | Hex | Used for |
|---|---|---|
| bg-0 | #15122c | page background |
| bg-1 / bg-2 / bg-3 | #1c1840 / #241f4f / #2e285f | panels and cards |
| ink | #efeaff | main text |
| mint | #7ee8c8 | go, success, create |
| sky | #82c8ff | reading, helpers |
| lilac | #b8a2ff | search, focus |
| peach | #ffb68e | edits |
| butter | #ffe08a | undo, run, waiting |
| rose | #ff92b4 | web, stop |
| coral | #ff8a80 | danger |

- **Fonts.** Press Start 2P for small labels only, Nunito for reading, JetBrains Mono for code. All are bundled locally (SIL OFL).
- **Plain English everywhere.** Safety modes are called "Ask me first", "Edit freely", "Plan first", "Autopilot", and "Only pre-approved" or "No limits" under expert modes.
- **Zero npm dependencies** in the server, so setup is just Node.

## 5. What's built (v0.1.0)

**From the desktop app**
- No terminal needed
- Live list of changed files with a colour diff
- Preview pane for web pages Claude builds
- Drag, drop or paste images, PDFs and other files
- Project tabs (several sessions at once)
- Quest log (Claude's to-do list), helper (sub-agent) panel, plan approval card

**From the CLI**
- The real `claude` binary, so skills, hooks, MCP servers, CLAUDE.md and slash commands work
- Slash command palette filled from the CLI's real command list, including the user's own skills
- Every model and effort level from the CLI, and every permission mode
- Subscription, API key and Bedrock logins
- **Terminal** button opens the same chat in Windows Terminal with `claude --resume`, and **Bring it back here** returns it

**New things neither has**
- **Undo** with a save point before every message
- Plain English permission cards, with red and amber warnings for deleting, installing, system changes and paths outside the project
- "Always allow this" (uses the CLI's own permission suggestions)
- Starter cards, and "Teach Claude about you", which writes a CLAUDE.md
- Animated pixel world, sounds (off by default), memory, 5-hour and weekly usage meters
- "Continue" on recent projects to resume the last chat
- One-click Windows setup with a desktop shortcut
- Practice mode with a pretend Claude, and a demo mode for the web

## 5b. What's new in v0.2.0

- **Two themes.** Good Boy Club (cartoon park drawn from the owner's art in `public/art/`, cut by `tools/dev/art-cut.js`) and Arcade Dusk (pixel city). Theme words and sounds live in `public/skins.js`. Switching mid-chat re-words old messages too.
- **Free-form board** (`public/grid.js`). 12 columns, blocks never overlap, gaps close up, springy snap, auto-scroll while dragging, arrow keys move and Shift+arrows resize, phone ↑/↓ buttons, Reset to the layout's preset. Presets are Simple, Builder, Power user, Focus and Showtime.
- **24 blocks**, including Inbox (every waiting question), Status line (runs the real `statusLine` command through Git Bash, shows its errors with a jq tip), Env, Hooks, Memory, Usage, Timeline, Files, Notes, Prompts, Agents, Tokens and Context.
- **Just results / Every step.** `body.calm` hides tool rows, helpers, thinking, answered cards and Claude's in-between chatter, and shows one progress line per round that can reveal its steps.
- **Session states** ready, working, needs, done, partial (you said no to something), error, login, terminal. Alerts per project: sound, toast with Jump, OS notification, favicon badge, title flash, and a reminder every ~75s while something waits (bell menu).
- **Answer anywhere.** Chat card, needs bar, a card over the scene (Y / N / A keys), and the Inbox.
- **Phone tabs** (Chat, Scene, Lists, Preview), icon-only Stop and Go under 480px.
- Usage rings, Ctrl+K finder, prompt history (Up and Ctrl+R), Ctrl+Z undo, chat export, Redo, plain-English permission summaries with code behind "Show code", Diesel's star (once per chat and after long jobs).
- **Trust gate** for folders that bring their own hooks, status line, MCP servers or env. Untrusted folders start with `--setting-sources user`. Trust is keyed by a hash of those files, so a change asks again.

**Online demo** (private to you until you share it)
https://claude.ai/artifact/2SmKNE7wS1Q6FDXKpZjuUs

## 6. How it works

```
Browser page  <->  server.js on 127.0.0.1:4317  <->  claude -p (stream-json in and out)
```

One `claude` process runs per project tab, started like this.

```
claude -p --input-format stream-json --output-format stream-json --verbose
       --include-partial-messages --permission-prompt-tool stdio
       --permission-mode <mode> [--model m] [--effort e] [--resume id]
```

On Windows it goes through `cmd.exe /d /s /c`, because `claude` may be a `.cmd` or an `.exe`.

**Protocol notes.** These were checked against Claude Code 2.1.319 and the Agent SDK source.

| What | Message |
|---|---|
| Handshake | We send `control_request` with subtype `initialize`. The reply has `commands`, `agents`, `models` (with `supportedEffortLevels`), `account` (`tokenSource`, `apiKeySource`) and `claude_code_version` |
| Send a message | `{"type":"user","message":{"role":"user","content":[...]}}`. Images go in as `image` blocks and PDFs as `document` blocks, both base64 |
| Permission asked | CLI sends `control_request` with subtype `can_use_tool` (`tool_name`, `input`, `tool_use_id`, `permission_suggestions`) |
| Answer allow | `control_response` with `response.response` = `{behavior:"allow", updatedInput, toolUseID, updatedPermissions?}` |
| Answer deny | `{behavior:"deny", message, toolUseID}` |
| Claude asks a question | Arrives as `can_use_tool` for `AskUserQuestion`. Answer by allowing with `updatedInput.answers` = `{ "<question text>": "<label>" }` |
| Plan approval | Arrives as `can_use_tool` for `ExitPlanMode`, and `input.plan` is markdown |
| Live controls | `interrupt`, `set_permission_mode`, `set_model` control requests. Effort has no live control, so we restart with `--resume` |
| Usage meters | `rate_limit_event`, where `rate_limit_info.rateLimitType` is `five_hour` or `seven_day` and `utilization` is 0 to 1 |
| Memory size | `autocompact_state.value.effective_window`, plus usage on assistant messages |
| Not signed in | Assistant message with `error: "authentication_failed"`, or a result with `api_error_status: 401` |
| Helpers | `Agent` or `Task` tool use. Their steps carry `parent_tool_use_id` |

**Save points (Undo).** There is a hidden bare git store per project in `%APPDATA%\EasyModeClaudeCode\savepoints\<hash>.git`, used with `--git-dir` and `--work-tree`, so the project's own `.git` is never touched. It respects `.gitignore` and also skips `node_modules`, `.venv` and similar. It sets `core.autocrlf=false` so Windows line endings don't change. Undo saves the current state first, then runs `git reset --hard <savepoint>`. It refuses the home folder, drive roots and system folders. The next message to Claude gets a short note saying files were rolled back.

**Security.** It listens on 127.0.0.1 only and checks the Host header. Every action needs the per-launch token, a POST and our own Origin (GET is allowed only for env, files and diff; the token in the query string only for /api/events). Folders with their own hooks, status line, MCP or env need "I trust it". The preview runs on its own port with a per-session key, refuses dot-paths and junctions that lead outside, and sends `connect-src 'self'`. git runs with fsmonitor and hooks switched off. `tools/dev/attack-check.js` re-runs 19 attacks against a throwaway server.

## 7. Files

| File | What it does |
|---|---|
| `server.js` | Bridge to Claude Code, sessions, save points, preview, folder picker, terminal hand-off |
| `public/index.html` | Layout of the whole interface |
| `public/style.css` | The Arcade Dusk skin, responsive down to phones |
| `public/app.js` | Turns Claude Code events into the screen. Tool wording, permission cards, panels, composer |
| `public/grid.js` | The free-form board of blocks |
| `public/skins.js` | Theme words (the `L()` lexicon) and WebAudio sounds |
| `public/world.js` | Both scenes. Arcade is pixel art in code; Good Boy Club draws the cartoon art and falls back to Arcade if it fails |
| `public/art/` | Good Boy Club sprites (owner's Higgsfield art) |
| `public-next/` | Working copy of the UI. Run it with `BYTE_RUNNER_UI=public-next` |
| `backups/public-v0.1/` | The old v0.1 UI, kept just in case |
| `public/demo.js` | Pretend session for the online demo |
| `public/fonts/` | Bundled fonts |
| `tools/fake-claude.js` | Pretend Claude Code that speaks the same protocol, for testing |
| `tools/practice.js` | Runs the app with the pretend Claude on port 4318 |
| `tools/build-demo.js` | Builds `dist/easy-mode-demo.html`, one self-contained page |
| `setup.ps1`, `Setup Easy Mode.bat` | Windows installer (Node, Git, Claude Code via winget, desktop shortcut, sign in) |
| `Start Easy Mode.bat` | Starts the app |

## 8. How to run and test

```
node server.js            # the real thing, opens http://localhost:4317
npm run practice          # pretend Claude, no sign in, http://localhost:4318
node tools/build-demo.js  # rebuild the single-file web demo
```

Useful environment settings are `CLAUDE_PATH` (a custom claude command), `BYTE_RUNNER_PORT`, `BYTE_RUNNER_UI` (which UI folder to serve) and `FAKE_FAST=1` (makes the pretend Claude instant). Add `--no-open` to stop the browser opening.

**Automatic checks (v0.2).** All run headless Edge through `tools/dev/ui.js` and print PASS or FAIL.

```
UI_SCRIPT=tools/dev/full.js node tools/dev/ui.js http://127.0.0.1:4318/ out     # practice, about 40 checks (SKIN=goodboy|arcade)
UI_SCRIPT=tools/dev/demo-check.js node tools/dev/ui.js file:///.../dist/easy-mode-demo.html out   # offline demo, 24 checks
UI_SCRIPT=tools/dev/tour.js node tools/dev/ui.js http://127.0.0.1:4318/ out     # screenshots (SKIN, PRESET, W, H)
node tools/dev/attack-check.js                                                   # security, 19 checks
```

On 8 Nov 2026 all of these passed on Windows 11 in both themes, all five layouts at 1280x720, and phone width.

**What was tested.** On Linux, with headless Chrome, end to end with the pretend Claude. That covered starting a project, streaming, permission cards, quest log, helpers, changes and diff, preview, slash palette, Undo (files really removed), page reload, plan mode and Continue. The handshake was also tested against the real Claude Code 2.1.319. Desktop and phone layouts were checked with screenshots.

**Not tested yet.**
- A real signed-in Claude session with v0.2 (only practice mode, to save the owner's Pro usage)
- `AskUserQuestion` against the real CLI (the pretend Claude doesn't send it)
- The Terminal hand-off on Windows

## 9. Known issues and risks

1. **Windows.** Practice mode is now tested on Windows 11. Still watch these on other PCs.
   - `setup.ps1` (winget IDs `OpenJS.NodeJS.LTS`, `Git.Git`, `Anthropic.ClaudeCode`)
   - The folder picker (PowerShell FolderBrowserDialog with `-STA`)
   - `wt.exe` terminal hand-off and its `cmd start` fallback
   - Paths with spaces
2. **Stopping processes on Windows.** `proc.kill()` kills the `cmd.exe` wrapper and may leave `claude.exe` running. We close stdin first, which should end it, but consider `taskkill /pid <pid> /T /F`.
3. **Old messages aren't shown after a restart.** "Continue" resumes Claude's memory but the screen starts empty. Fix by reading the transcript from `%USERPROFILE%\.claude\projects\...\<session>.jsonl` and replaying it.
4. Sessions live in memory, so closing the server ends them (Continue covers this).
5. The LEVEL CLEAR file count can arrive a moment late. It updates itself, but test it.
6. Gems in the pixel world are shared between tabs.
7. "Autopilot" (`auto` mode) may not be available on every account or model. Check `models[].supportsAutoMode` and hide it when false.
8. Very large folders switch Undo off (git add times out after 45 seconds). Show a clearer message.
9. Text sent to Claude is limited only by the 40 MB request cap. Fine for now.

## 10. Next steps (suggested order)

1. **Test on your PC.** Run `npm run practice` first, then the real thing. Fix whatever breaks in section 9, item 1.
2. **Replay transcripts** so "Continue" shows the old chat.
3. **A proper Windows app.** Options are a Node single executable app (SEA), or wrapping it in Tauri for a real window and installer. Keep the zero-dependency server either way.
4. **More themes.** Two are done (CSS variables, `skins.js` words and sounds, a scene in `world.js`). Ideas include a cosy café and a space station, plus an option for people to make their own.
   Before launch, check that the Higgsfield plan allows commercial and open source use of the Good Boy Club art.
5. **Polish for beginners.** A first-run tour, friendlier error messages, a "what does this mean?" button on permission cards.
6. **GitHub launch.**
   - Clean repo, README with a GIF and the demo link, MIT licence (already included)
   - A 20 to 30 second screen recording for Instagram and X
   - Releases with the zip
7. **Awesome lists.** Submit only where it truly fits, one careful pull request each, and read each list's rules first. Check these exist and are active.
   - hesreallyhim/awesome-claude-code
   - sindresorhus/awesome-claude
   - travisvn/awesome-claude-skills and ComposioHQ/awesome-claude-skills (only if we ship a skill alongside, for example a "byte-runner" skill)
   - Lists for beginner-friendly AI tools, Windows apps, and open source alternatives

   A skill version and an MCP-free "CLI skin" version could open more lists later. Realistic target is 20 to 40 good fits, not 100.

## 11. Notes about the owner's preferences

- Wants things that look really pretty and fun, colourful but easy on the eyes.
- Wants documents checked so nothing overlaps.
- Prefers simple, human language. Avoid em dashes and colons in written replies.
- Likes surprising statistics for social media posts.
- On Windows. Wants this shared widely through GitHub and awesome lists.
- Winston is the owner's English bulldog (light-eared look). Diesel was the owner's pug, who passed away. He appears gently as a small glowing star after big jobs. Keep it warm and quiet, no jokes, no sad text.

*In memory of Diesel.* 🐾

## 12. Prompt to paste into Claude Code on your PC

> Read HANDOVER.md and README.md in this folder. This is Easy Mode, a beginner-friendly arcade-style interface for Claude Code. First run `npm run practice` and help me check everything works on Windows, then work through section 9 item 1 and section 10 in order. Keep the server free of npm dependencies, keep all art original (no known characters), and keep the Arcade Dusk colours.
