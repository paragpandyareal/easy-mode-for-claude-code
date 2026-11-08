# BYTE RUNNER

**A friendly, colourful home for Claude Code.** The power of the CLI, the comfort of an app, and a little friend who runs while Claude works. Pick **Good Boy Club** (a sunny cartoon park with Winston the bulldog and his pack) or **Arcade Dusk** (a pixel city with Bit the robot).

Byte Runner runs the **real Claude Code** on your computer and shows everything in a bright, game-style screen in your browser. Because it is the official Claude Code doing the work, your Claude subscription, API keys, skills, hooks, MCP servers and `CLAUDE.md` files all work exactly as they do in the terminal.

> Not made by or affiliated with Anthropic. Claude and Claude Code are trademarks of Anthropic.

---

## Why it exists

Lots of people bounce off Claude Code in the first five minutes. Not because it is hard, but because the terminal feels hostile. Setup breaks, there is no undo button, permission prompts read like legal documents, and a blank black screen gives no clue what to type.

Byte Runner fixes those without taking any power away.

| Problem | What Byte Runner does |
|---|---|
| Setup is confusing | One double-click installs Node.js, Git and Claude Code, and adds a desktop shortcut |
| Afraid of breaking things | Every message makes a **save point**. One big **Undo** button puts your files back |
| Scary permission prompts | Plain English cards like “Claude wants to create index.html”, with red warnings for deleting or installing |
| Blank screen | Starter cards and a “Teach Claude about you” setup that writes your `CLAUDE.md` |
| Can't see what changed | Live list of changed files with a colour diff, plus a **Preview** pane for web pages |
| Pasting images is a pain | Drag and drop or paste images, PDFs and files |
| Juggling projects | A board of projects, each with its own state. Sounds, pop-ups and the tab title tell you when any of them is done or needs you |
| Too much going on | **Just results** hides every step and shows only the outcome. One tap shows the steps again |
| Downloaded a project with surprises | Folders that bring their own hooks, status line or apps ask **Trust this folder?** first |

## Best of both worlds

**From the desktop app:** no terminal needed, visual diffs, file attachments, project tabs, plan, task and helper panels, live preview.

**From the CLI:** it *is* the CLI underneath, so you keep skills, hooks, MCP, slash commands, every model and effort level, every safety mode (including the expert ones), and API key or subscription login. Press **Terminal** and the very same chat opens in Windows Terminal with `claude --resume`. Press **Bring it back here** to return.

**New:** Undo and Redo with save points, plain English permissions, starter cards, guided `CLAUDE.md`, two animated themes, and usage rings for memory, your 5 hour limit and your weekly limit.

## What's new in 0.2

* **Two themes.** Good Boy Club is a hand-drawn cartoon park. Arcade Dusk is the original pixel city. Switch any time, even mid-chat.
* **Your own screen.** Every block (chat, scene, to-do list, preview, files, status line, hooks, memory, tokens, usage and more) can be moved, resized, hidden or added. Five ready layouts: Simple, Builder, Power user, Focus and Showtime. Keyboard friendly, and **Reset** puts a layout back.
* **Just results or Every step.** Beginners see a tidy "Winston is working… 7 steps so far" line and the answer. Power users see every tool, helper and thought.
* **Never miss a question.** Every project has a clear state. Questions show in the chat, in a bar above the message box, floating over the scene (answer with **Y**, **N** or **A**), and in the Inbox block for all projects. A gentle reminder sound repeats while something waits.
* **Phones.** A bottom tab bar with Chat, Scene, Lists and Preview.
* **Your status line.** The Status line block runs your real Claude Code `statusLine` command, or builds one from a template.
* **Find anything** with **Ctrl+K**. Bring back old messages with **Up** or **Ctrl+R**. Press **?** for every shortcut.
* **Show and tell.** Pages, documents, spreadsheets and pictures Claude makes show up straight away.
* **Safer.** A trust question for folders with their own settings, DNS rebinding protection, a preview that cannot send data out, and secrets never saved into "don't ask again" rules.

---

## Install on Windows

1. Download this folder and unzip it somewhere you will keep it (for example `Documents\Byte Runner`).
2. Double-click **`Setup Byte Runner.bat`**. It installs anything missing and asks if you want to sign in to Claude.
3. Next time, just double-click the **Byte Runner** shortcut on your desktop.

A small black window stays open while Byte Runner runs. Close it to quit.

**Mac and Linux:** install Node.js 18+, Git and [Claude Code](https://docs.claude.com/en/docs/claude-code/setup), then run `node server.js` in this folder.

**Just want to look around first?** Double-click **`Practice Byte Runner.bat`** (or run `npm run practice`). It uses a pretend Claude so you can click through everything without signing in, and none of your Claude plan is used. There is also a one-file demo in `dist/byte-runner-demo.html` you can open in any browser.

## How to use it

1. **New game** → pick a folder (or create a new one). Claude can only change files inside it.
2. Pick how careful Claude should be:
   - 🛡 **Ask me first** asks before changing files or running anything (best to start)
   - ✏️ **Edit freely** changes files on its own, asks before commands
   - 🗺 **Plan first** writes a plan, changes nothing until you approve
   - 🤖 **Autopilot** handles safe steps and checks with you on risky ones
3. Type what you want, or tap a starter card. Press **GO**.
4. Watch the to-do list, approve or refuse what Claude asks, and check what changed in **Show and tell**.
   Want less on screen? Press **Just results**. Want it all? Press **Every step**.
5. Don't like it? **Undo**.

Type **/** in the message box for slash commands and your skills.

---

## How it works (for tech people)

```
Browser UI  ⇄  server.js (localhost only)  ⇄  claude -p --input-format stream-json --output-format stream-json
```

* `server.js` has **zero npm dependencies**. It spawns the official `claude` binary per project tab with `--permission-prompt-tool stdio`, and relays the stream-json events to the page over Server-Sent Events.
* Permission prompts arrive as `can_use_tool` control requests. The page answers them with `control_response`, including `updatedPermissions` for “Always allow this”, and `updatedInput.answers` for Claude's multiple choice questions.
* `initialize` gives the app the real list of slash commands, skills, agents, models, effort levels and the login type. `rate_limit_event` feeds the 5 hour and weekly meters.
* Mode and model changes use `set_permission_mode` and `set_model`. Effort changes restart the process with `--resume` so nothing is lost.
* **Save points** live in a hidden bare git store under `%APPDATA%\ByteRunner\savepoints`, one per project, using `--git-dir` and `--work-tree`. Your project's own `.git` is never touched. It respects `.gitignore` and skips `node_modules` and similar. Undo is `git reset --hard <savepoint>` against that store, after first saving the current state so an undo can itself be reversed.
* Security: the server listens on `127.0.0.1` only and checks the Host header (no DNS rebinding). Every action needs a random token that only the served page knows, a POST, and our own origin. A project's own hooks, status line, MCP servers and env settings only load after you choose **I trust it**; otherwise Claude starts with `--setting-sources user`. The preview runs on its own port, refuses hidden files and links that lead outside the project, and its pages cannot send data anywhere.
* Arcade Dusk is a pixel canvas drawn in code. Good Boy Club is drawn from the owner's cartoon art in `public/art/`, and falls back to Arcade if the art cannot load.

### Files

| File | What it is |
|---|---|
| `server.js` | The bridge to Claude Code, save points, preview server |
| `public/index.html`, `style.css` | The interface and both themes |
| `public/app.js` | Turns Claude Code events into the game screen |
| `public/grid.js` | The free-form board of blocks |
| `public/skins.js` | Theme words and sounds |
| `public/world.js` | The animated scenes, Winston, the pack, Bit and Diesel's star |
| `public/art/` | Good Boy Club cartoon art |
| `public/demo.js` | Demo mode for the online preview |
| `tools/fake-claude.js` | A pretend Claude Code for testing and practice |
| `tools/build-demo.js` | Builds a single-file demo page |
| `tools/dev/` | Test tools: `full.js` and `demo-check.js` walk through every feature in headless Edge, `attack-check.js` re-runs the security checks |

### A note on Claude subscriptions

Anthropic does not allow third-party apps to log in to Claude subscriptions themselves. Byte Runner never touches your login or tokens. It starts the official Claude Code program on your own computer, which signs in the normal way, the same as running `claude` in a terminal. Please read Anthropic's [legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance) yourself if you plan to build on this.

## Ideas for next versions

More themes (a cosy café, a space station), a packaged `.exe`, showing old messages after Continue, team sharing of save points, a theme maker.

## License

MIT. Fonts are under the SIL Open Font License.

**Art.** The Good Boy Club art (Winston, the pack, Diesel and the park) was made by the project owner with Higgsfield. Bit and the Arcade city are drawn in code. No characters from games, films or brands are used.

---

*In memory of Diesel, a fawn pug with big kind eyes. He watches over the park as a little star.* 🐾
