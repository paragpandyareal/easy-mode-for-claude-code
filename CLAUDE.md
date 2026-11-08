# Byte Runner, notes for Claude

**Start here every session: read `docs/RESUME.md` first.** It says what is live, what is in progress and the next steps in order. The full plan from the four user reviews is in `docs/PLAN-v0.2.md`. The background and protocol notes are in `HANDOVER.md`.

## Owner preferences
- Simple, human language. Avoid em dashes and colons in written replies.
- Pretty, colourful and fun, but easy on the eyes. Check that nothing overlaps.
- Windows-first. The owner is on Windows 11 with Node 26, Git and Claude Code 2.1.319 (Claude Pro).
- Keep all art original or owner-supplied. No Pokémon, Pac-Man or any franchise lookalike.
- Keep the server free of npm dependencies.
- Ask before anything destructive. Commit only when asked (this folder is not a git repo yet).

## Layout
- `public/` is the LIVE UI (v0.1 plus fixes). `public-next/` is the v0.2 redesign in progress.
- `public-next/preview-worlds.html` shows the new scene engine on its own.
- `tools/practice.js` runs a pretend Claude on port 4318. `tools/fake-claude.js` is the pretend CLI.
- `tools/dev/` is the test harness. `ui.js` drives headless Edge over DevTools. Run it as `UI_SCRIPT=<scenario.js> node tools/dev/ui.js <url> <outdir>`. `e2e.js` is the API end-to-end check. The scenarios are say-hi, stale (server restart) and sec (preview isolation).
- The art sources are listed in docs/RESUME.md. They are still in `%USERPROFILE%\Downloads` and need copying into `art/source/`.
- Don't run real `claude` prompts for testing. They spend the owner's Pro usage. A handshake-only `initialize` is fine.
