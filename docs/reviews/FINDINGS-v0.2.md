# v0.2 review findings and to-do (8 Nov 2026, about 14:20)

Five independent reviews ran against `public-next`: security, Dee (non-technical), Sam (technical), UI/UX, and code. The full reports were returned in chat. This file is the action list.

## DONE already (server.js, plus the app.js security bits)
- Security
  - Host-header check (blocks DNS rebinding).
  - POST plus our-origin needed for actions; GET is only allowed for env/files/diff.
  - The token query string is only accepted for /api/events.
  - Trust gate: a folder's own hooks, status line, MCP or env need "I trust it". Otherwise the session starts with `--setting-sources user` (config.trusted keyed by a hash).
  - The preview refuses dot-paths, checks the real path (junctions), uses `connect-src 'self'`, and checks the host.
  - git runs with `core.fsmonitor=false` / `hooksPath=NUL`.
  - model, effort, mode and resume are validated, and `%` is escaped in the launcher `.cmd`.
  - Body caps (25MB send, 1MB others). The replay log skips stream_event and huge events.
  - `.env` is excluded from save points.
  - Safe attachment names (no overwrite).
  - Better secret regexes (SECRET_RE in app.js).
  - Jumping to a question focuses the card, not Yes.
  - Bash cards show the command first.
  - Verified by `scratchpad/sectest/attack.js`: 13/13 pass.
- Sam
  - Only one process per session (restartTimer taken over by send).
  - A failed live switch queues while busy.
  - No terminal hand-off while busy.
  - `--include-hook-events`.
  - Status line input is shaped like Claude Code's (context_window fields, `effort {level}`), and stderr is returned.
  - The env now lists skills from `~/.claude/skills` and `.claude/skills`.
- Diesel's star is small, and the error state has a rain cloud.

## IMPORTANT before anything else
- The OLD UI in `public/` does not handle the new `{needsTrust}` reply from /api/session/start. It will break when opening a folder that has its own `.claude` settings or `.mcp.json`. Fix that quickly, or swap public-next in.

## TO DO: app.js / style.css / grid.js / world.js (front-end pass)
Bugs:
1. Notes are wiped while Claude works. In renderWidgets, always skip notes/files when the sig is unchanged. onChanges should call `renderWidgets(['changes','preview','files'])`.
2. Batch renders into one requestAnimationFrame (scheduleRender), merge the five timers into one 1s tick that only updates labels, and add a `stateLabel(s)` helper.
3. Streaming reparses markdown on every delta (N²). Throttle setBubble to one call per animation frame.
4. Cost: on the 'started' app event, `costBase += costRaw; costRaw = 0`.
5. Gate notify() and sounds until 'hello' (no sounds on replay).
6. Use the event time `ev.t` for tool and helper durations, and keep a "thought for Xs" note.
7. Real skills: use `s.env.skills` in the skills widget and slash grouping. Real model: use `caps.models[default].resolvedModel` before init.
8. Token areas: count helpers by result length (not API usage) and label cache re-reads separately.
9. Redo should refresh files, save points, preview and the Undo button.
10. Stop while a question is pending: deny the pending cards first, then interrupt, and clear "Stopping…" after 5s.
11. "New New walk" in the palette: use `L('newProject').replace(/^\+\s*/,'')`.
12. Diesel's star replays on reload: store `dieselSeen` per session. Use a minimum size of 48px.
13. Old helpers stay in the scene (two Pips). Clear helpers per round.
14. A partial turn (the user said no) must not show the "GOOD BOY!" badge or "Your move." Add a 'partial' state and use "Your turn: what's next?".
15. Show status line stderr (e.g. jq missing). The owner's script needs `jq`: `winget install jqlang.jq`.
16. Prompt history: up arrow / Ctrl+R in the composer.
UX:
17. Reminders: if something is waiting, replay the sound every 60-90s and flash the title. Add a "Remind me again" option.
18. The bell opens a three-choice menu (not a cycle).
19. Hide $ when isPlanUser (scene chip and bottom bar). Practice mode shows "pretend".
20. Good Boy Club contrast: text tokens `--t-ok:#1f7a50; --t-warn:#8a5a00; --t-info:#1f5f9e; --t-bad:#b02a3a; --t-lilac:#5b3fc4` for tags, .sess .st, .helper .hs, .plus, .fs-* and outline buttons.
21. The Good Boy needs card: `background:#2b1d33; color:#ffe066`.
22. grid.js: add `compact()` (close gaps) after resolve/remove. Observe `#area`. Call layout in rAF after arrange(false). Use rowH minimum 16.
23. Arrange mode: hide `.ph .pm` while editing, and make the grip an absolute overlay.
24. Phone: `.area{flex:none;overflow:visible}` and a sticky statusbar. Or better, a bottom tab bar (Chat/Scene/Lists/Preview). No dragging on phones (use ↑/↓ buttons). Don't save the layout if nothing changed. Icon-only STOP/GO under 480px. A short needs-bar text.
25. At 1280x720: no-wrap statusbar, hide "refills" under 1400px, and stop the arrange bar wrapping.
26. The speech bubble covers Winston in short scenes. Use a `.stage.short` class and move it to the top centre.
27. Sky cloud seams: cut the clouds as separate sprites, or use a gradient sky plus placed clouds.
28. The add-block menu covers Done: `right:0`.
29. Arcade error: add a grey tint and a "!" sign over Bit.
30. The shortcuts modal layout. Add Ctrl+Z.
31. The needs bar needs `role=status` and `aria-live`. Pause toasts on hover; action toasts last 8s.
32. Permission "Show details" for Write: show a summary first, with the code behind "Show code".
33. Jargon to plain words: TUMMY, ENERGY · 5H, MAKE/FIND tags, "Only pre-approved", "Expert controls", "House rules". Keep the fun titles but put plain words in the tooltips and labels.
Wow (UI/UX top 5):
34. Usage rings: a context ring on each board card, and 5h/week rings by Undo, with hover breakdown.
35. Answer from the scene: a floating card with Y/N/A keys.
36. The board snaps with a spring, auto-scrolls while dragging, supports keyboard move/resize, and has "Reset to preset".
37. Phone tabs (see 24).
38. Empty blocks collapse to one line, or show a sample.

## Code clean-up (reviewer said: targeted refactors, NO rewrite; I agree)
- Remove the dead pixel Good Boy code in world.js (about 190 lines). Fall back to the arcade scene if the art fails. Update preview-worlds.html.
- Remove dead CSS: .layout, .col*, .preset-row, .w-list, .drawer, .layout-opts, .panel.collapsed and so on. Remove unused skins.js keys, /api/skin, config.skin, the duplicate previewKey, grid.remove and COLS.
- `if (!this.canvas.offsetParent) return;` in the world tick (no drawing when the scene is hidden). Skip build() in cartoon mode.
- Merge duplicate helpers (version, model label, context %, rate %).
- Status line: check the cache before envInfo. Cache claudeStatus(). Only poll while busy.

## Then
- Copy public-next/* over public/ (keep public/demo.js), and rebuild the demo with `node tools/build-demo.js` (BYTE_RUNNER_UI not needed after the swap).
- Update README/HANDOVER (new features, trust gate, art credits, "In memory of Diesel").
- Restart the user's servers.
