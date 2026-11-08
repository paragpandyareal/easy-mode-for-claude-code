# Byte Runner v0.2, what is left to do

Updated as work happens. [x] done, [~] in progress, [ ] not started.

## Your requests today (8 Nov evening)
- [x] Open the app so you can test it (http://localhost:4430)
- [x] "Play a sample" sound button: louder, waits for audio, shows "Playing…"
- [x] Show and tell stayed empty when Claude rewrote a page that already existed. Now it shows pages Claude wrote, and pages already in the folder
- [x] Theme switch mid-chat now re-words old messages (Winston says / CLAUDE, GOOD BOY / LEVEL CLEAR, avatars, speech bubble)
- [x] Port 4460 is not left running (only used for a few seconds by the security check)
- [x] "Just the results" setting (header button, Ctrl+K, presets choose a default): hide all the steps for non-technical people, show only the outcome. "Every step" keeps today's view
- [x] Full test of everything: toolsdevull.js (practice, ~40 checks) and toolsdevdemo-check.js (offline demo, 24 checks), both themes, all pass

## IMPORTANT
- [x] Old UI in public\ now asks before trusting a folder with its own settings

## Front-end bugs (1-16)
- [x] 1 Notes no longer wiped while Claude works
- [x] 2 One redraw per frame, one shared 1-second timer, stateLabel helper
- [x] 3 Streaming reply redraws once per frame, not on every word
- [x] 4 Cost total survives Claude restarts
- [x] 5 No sounds or pop-ups when catching up after a reload
- [x] 6 Real event times for step durations, plus a "thought for Xs" note
- [x] 7 Real skills list and real model name before the first message
- [x] 8 Helper tokens counted by what they bring back; cache re-reads shown apart
- [x] 9 Redo refreshes files, save points, preview and Undo
- [x] 10 Stop works while a question is waiting
- [x] 11 Palette says "New walk", not "New New walk"
- [x] 12 Diesel's star does not replay on reload; minimum size 48px
- [x] 13 Old helpers leave the scene each round
- [x] 14 "Stopped where you said no" is not a GOOD BOY; says "Your turn"
- [x] 15 Status line errors shown (with the jq install tip)
- [x] 16 Prompt history with Up arrow and Ctrl+R

## UX (17-33)
- [x] 17 Reminder sound every 60-90s while something waits, title flash, "Remind me again"
- [x] 18 Bell opens a three-choice menu
- [x] 19 Hide $ for plan users; practice says "pretend"
- [x] 20 Good Boy Club text contrast colours
- [x] 21 Good Boy "needs you" card colours
- [x] 22 Board closes gaps, watches its size, min row height
- [x] 23 Arrange mode tidy (hide buttons, grip overlay)
- [x] 24 Phone layout: bottom tabs, no dragging, short labels
- [x] 25 Laptop size 1280x720: no wrapping
- [x] 26 Speech bubble not covering Winston in short scenes
- [x] 27 Sky cloud seams
- [x] 28 Add-block menu not covering Done
- [x] 29 Arcade error look (grey tint and "!")
- [x] 30 Shortcuts list layout, add Ctrl+Z
- [x] 31 Screen reader for the needs bar; toasts pause on hover
- [x] 32 Permission details: summary first, code behind "Show code"
- [x] 33 Plain words in tooltips for TUMMY, ENERGY and other fun names

## Wow (34-38)
- [x] 34 Usage rings on project cards and by Undo
- [x] 35 Answer from the scene with Y / N / A keys
- [x] 36 Board spring snap, auto-scroll, keyboard move, "Reset" button in Customise
- [x] 37 Phone tabs
- [x] 38 Empty blocks shrink to one line or show a sample

## Code clean-up (targeted, no rewrite)
- [x] Remove dead pixel Good Boy code in world.js (712 to 543 lines), falls back to Arcade if the art fails
- [x] Remove dead CSS (42 rules), unused skin words, /api/skin, duplicate previewKey, grid.remove
- [x] Do not draw the scene while it is hidden
- [x] Merge duplicate helpers
- [x] Status line: cache checked first, claude --version cached, polls only while busy

## Finish
- [x] Full test pass: both themes, all 5 layouts at 1280x720, phone, practice, demo, art-failure fallback, security 19/19. Found and fixed a ghost-project bug (closed projects came back)
- [x] Copy public-next over public (old UI kept in backupspublic-v0.1)
- [x] Rebuild the demo (distbyte-runner-demo.html, 24/24 checks pass)
- [x] Update README and HANDOVER (trust gate, art credits, "In memory of Diesel"), plus an About box in the app, version 0.2.0
- [x] Restart your server (4430 practice, now serving public)
