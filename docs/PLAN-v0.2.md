# Byte Runner v0.2 plan

Made on 8 November 2026 from four reviews run on the owner's PC (practice mode).
Reviewers were a UI and UX expert, Priya (product manager), Dee (café owner, very non-technical) and Sam (senior engineer, daily CLI user).
We only keep what gives real wow, makes it easier, or adds clear value.

## Phase 1. Trust and must-fixes
1. Preview runs on its own port, so a page can't steal the app token (found by Sam). **Done**
2. Alerts for every project. Separate Needs you / All done / Error states, each with its own look and sound. Tab bounce, toast with Jump, Windows notification, favicon and title count. First run asks "Alerts only / Everything / Off".
3. On phone and small screens, scroll question cards into view, plus a sticky "Claude needs you" bar.
4. Practice mode banner, and pretend account names. **Done**
5. Cost. On a subscription show "covered by your plan (worth about $x)". Keep a running total across restarts.
6. Undo cleans up preview and quest log, and Redo is added.
7. Small bugs. No LEVEL CLEAR after a refusal or with no changes, no stacked modals, close the slash menu, make disabled Undo look disabled, and don't send a bare "/".
8. Windows fixes. Spaces in paths, killing the whole process tree, reconnect after restart, real account format. **Done**

## Phase 2. Look and motion
9. Skin system. A skin is tokens, fonts, frame kit, lexicon (all labels), scene art and sounds, while layout and widgets are shared.
   - Arcade Dusk (dark), rebuilt with strong framing, an 8px pixel-font grid and the motion spec.
   - Good Boy Club (light), a dog and cat trainer genre starring Winston the English bulldog, with original art only.
   - Follows the OS light or dark setting, or the user picks.
10. Scene shows real state with integer pixel scaling, and drops to 8fps when idle.
11. A big moment for LEVEL CLEAR / GOOD BOY. The feed collapses repeats and folds answered cards away.

## Phase 3. Power features
12. Widgets you can arrange, with presets Simple (default, no jargon), Builder, Power user, Focus and Showtime.
13. Session board showing state, time and cost for every project.
14. Skills panel showing available, used (×n, tokens) and active now, plus MCP server status.
15. Token spend by area (tool, skill, helper, file, cache vs fresh), a context tank with a compact marker, and the real resolved model.
16. Helper drill-in with live steps and a final report.
17. A waiting mini-game that pauses when Claude needs you.

## Phase 4. Documents and data
18. Preview for .md, .csv and images. Tables in replies, a Copy button, and starters by role.
19. A friendly "what changed" view with "Show code".
20. Continue replays the old chat from the transcript.

## Left out for now
A signed installer (comes with the Windows app step), a QR code to a phone, chat rewind, a hooks panel, MCP elicitation and a config file race.
