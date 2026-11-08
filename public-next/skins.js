/* =========================================================
   EASY MODE · skins
   A skin changes the words, colours (style.css [data-skin]),
   the pixel world (world.js) and the sounds, all together.
   Layout and widgets are shared, so a new skin is just data.
   Every fun label has a plain-English line under it.
   ========================================================= */
(function () {
  'use strict';

  const SKINS = {
    arcade: {
      id: 'arcade', name: 'Arcade Dusk', mode: 'dark', world: 'arcade', lead: 'Bit',
      desc: 'Neon city at sunset with Bit the robot',
      L: {
        brand: 'EASY MODE', brandSub: 'for Claude Code',
        newProject: '+ New game', newTitle: 'NEW GAME', start: 'PRESS START', startCta: '▶ NEW GAME',
        player: ['PLAYER 1', 'who is playing'],
        stats: ['GAME STATS', 'this session'],
        quests: ['QUEST LOG', 'Claude’s to-do list'],
        saves: ['SAVE POINTS', 'Undo puts your files back'],
        changes: ['HIGH SCORES', 'files Claude changed'],
        preview: ['PREVIEW', 'see what Claude built'],
        helpers: ['HELPERS', 'side quests Claude sends out'],
        skills: ['POWER-UPS', 'skills and connected apps'],
        tokens: ['WHERE TOKENS GO', 'what used Claude’s effort'],
        context: ['MEMORY', 'how full Claude’s memory is'],
        tally: ['MOVES', 'every kind of step Claude took'],
        inbox: ['NEEDS YOU', 'questions waiting in every project'], statusline: ['STATUS LINE', 'your Claude Code status line'], env: ['ENVIRONMENT', 'where and how Claude is working'],
        hooks: ['HOOKS', 'your own commands at key moments'], memory: ['MEMORY FILES', 'CLAUDE.md notes Claude reads'], usage: ['LIVES', 'plan limits and memory'],
        timeline: ['REPLAY', 'every round so far'], files: ['MAP', 'your project files'], notes: ['NOTES', 'just for you'], prompts: ['COMBOS', 'saved prompts, one click'], agents: ['CREW', 'helper agents you can call'],
        send: 'GO ▶', stop: '■ STOP', placeholder: 'Tell Claude what to make…', working: 'Claude is working…',
        ready: 'READY', working1: 'WORKING', needs: 'NEEDS YOU', done: 'ALL DONE', error: 'OOPS', login: 'SIGN IN',
        levelClear: '★ LEVEL CLEAR ★', answered: 'ANSWERED', yourTurn: 'YOUR TURN',
        gems: 'gems',
        waitSay: 'Bit needs you', doneSay: 'Level clear! Your move.', hello: 'Hi! Pick a project to start.',
        play: '🎮 Play while you wait', gameHint: 'Space or tap to jump · catch the gems',
        gameOver: 'GAME OVER · press space', paused: 'PAUSED · Claude needs you',
        helperWord: 'helper', helpersOut: 'out on a quest', helperBack: 'back with the answer',
        statModel: 'MODEL', statEffort: 'EFFORT', statMode: 'SAFETY', statCtx: 'MEMORY', stat5: '5-HOUR LIMIT', statWeek: 'WEEKLY LIMIT', statScore: 'THIS SESSION',
      },
    },
    goodboy: {
      id: 'goodboy', name: 'Good Boy Club', mode: 'light', world: 'goodboy', lead: 'Winston',
      desc: 'Sunny park with Winston the bulldog and his pack',
      L: {
        brand: 'GOOD BOY CLUB', brandSub: 'Winston and Claude Code, best friends',
        newProject: '+ New walk', newTitle: 'NEW WALK', start: 'WALKIES?', startCta: '▶ START A WALK',
        player: ['Trainer card', 'who is walking Winston'],
        stats: ['Walk stats', 'this session'],
        quests: ['Today’s walk', 'Claude’s to-do list'],
        saves: ['Buried bones', 'dig one up to undo'],
        changes: ['The toy box', 'files Claude changed'],
        preview: ['Show and tell', 'see what Claude built'],
        helpers: ['The pack', 'helpers Claude sends out'],
        skills: ['Tricks', 'skills and connected apps'],
        tokens: ['Where the treats went', 'what used Claude’s effort'],
        context: ['Winston’s tummy', 'how full Claude’s memory is'],
        tally: ['Good habits', 'every kind of step Claude took'],
        inbox: ['Waiting for you', 'questions in every project'], statusline: ['Status line', 'your Claude Code status line'], env: ['The yard', 'where and how Claude is working'],
        hooks: ['House rules', 'your own commands at key moments'], memory: ['Winston’s notebook', 'CLAUDE.md notes Claude reads'], usage: ['Energy', 'plan limits and memory'],
        timeline: ['Walk diary', 'every round so far'], files: ['The garden', 'your project files'], notes: ['Sticky notes', 'just for you'], prompts: ['Favourite commands', 'saved prompts, one click'], agents: ['The kennel', 'helper agents you can call'],
        send: 'FETCH! ▶', stop: '■ HEEL!', placeholder: 'Tell Winston what to fetch…', working: 'Winston is on it…',
        ready: 'READY', working1: 'ON A WALK', needs: 'NEEDS YOU', done: 'GOOD BOY!', error: 'MUDDY PAWS', login: 'SIGN IN',
        levelClear: '🐾 GOOD BOY! 🐾', answered: 'ANSWERED', yourTurn: 'YOUR TURN',
        gems: 'treats',
        waitSay: 'Winston brought you the ball', doneSay: 'Good boy! All done.', hello: 'Woof! Pick a project to start.',
        play: '🎾 Play fetch while you wait', gameHint: 'Space or tap to jump · catch the balls',
        gameOver: 'Splash! Press space to go again', paused: 'PAUSED · Winston needs you',
        helperWord: 'pup', helpersOut: 'out sniffing', helperBack: 'came back with it',
        statModel: 'MODEL', statEffort: 'EFFORT', statMode: 'SAFETY', statCtx: 'MEMORY', stat5: '5-HOUR LIMIT', statWeek: 'WEEKLY LIMIT', statScore: 'TREAT JAR',
      },
    },
  };

  /* ---------------- sounds, made live with WebAudio (no files) ---------------- */
  let ctx = null;
  // One master volume for every sound, so they are all loud enough to notice.
  let master = null;
  const VOLUME = 2.6;
  function ac() {
    try {
      if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = VOLUME; master.connect(ctx.destination); }
      if (ctx.state === 'suspended') ctx.resume();
    } catch { ctx = null; }
    return ctx;
  }
  const out = () => master || ctx.destination;
  // Wait until the browser lets us play (it blocks sound until the first click).
  async function ready() { const c = ac(); if (!c) return false; if (c.state !== 'running') { try { await c.resume(); } catch { /* */ } } return c.state === 'running'; }
  function tone(freqs, { dur = 0.08, type = 'square', vol = 0.05, gap = 0.8, slide = 0 } = {}) {
    const c = ac(); if (!c) return;
    let t = c.currentTime;
    for (const f of freqs) {
      const o = c.createOscillator(), gn = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f * slide), t + dur);
      gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(gn).connect(out()); o.start(t); o.stop(t + dur + 0.02); t += dur * gap;
    }
  }
  function noise({ dur = 0.15, vol = 0.12, freq = 700, q = 1.5, at = 0 } = {}) {
    const c = ac(); if (!c) return;
    const len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), gn = c.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; gn.gain.value = vol;
    src.connect(f).connect(gn).connect(out()); src.start(c.currentTime + at);
  }
  // A soft "boof": a low pitch drop with a breathy edge.
  function boof(at = 0) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + at, o = c.createOscillator(), gn = c.createGain(), f = c.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.16);
    f.type = 'lowpass'; f.frequency.value = 900;
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.12, t + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(f).connect(gn).connect(out()); o.start(t); o.stop(t + 0.22);
    noise({ dur: 0.1, vol: 0.05, freq: 500, at });
  }
  function squeak(at = 0) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + at, o = c.createOscillator(), gn = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(2300, t + 0.07); o.frequency.exponentialRampToValueAtTime(1500, t + 0.14);
    gn.gain.setValueAtTime(0.07, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(gn).connect(out()); o.start(t); o.stop(t + 0.16);
  }

  const SOUNDS = {
    arcade: {
      gem: () => tone([988, 1319], { dur: 0.05, vol: 0.035 }),
      wait: () => tone([660, 880], { dur: 0.12, type: 'triangle', vol: 0.07 }),
      done: () => tone([523, 659, 784, 1047], { dur: 0.11, type: 'triangle', vol: 0.06 }),
      error: () => tone([220, 165], { dur: 0.16, type: 'square', vol: 0.05 }),
      tick: () => tone([1200], { dur: 0.02, vol: 0.02 }),
      jump: () => tone([440], { dur: 0.08, type: 'square', vol: 0.03, slide: 2 }),
      score: () => tone([1047, 1568], { dur: 0.05, vol: 0.03 }),
    },
    goodboy: {
      gem: () => tone([880], { dur: 0.05, type: 'sine', vol: 0.04, slide: 1.5 }),
      wait: () => { boof(0); boof(0.28); },
      done: () => { squeak(0); squeak(0.18); tone([784, 1047, 1319], { dur: 0.12, type: 'triangle', vol: 0.05, at: 0 }); },
      error: () => { noise({ dur: 0.35, vol: 0.08, freq: 300, q: 0.8 }); tone([196, 147], { dur: 0.2, type: 'sine', vol: 0.05 }); },
      tick: () => tone([1500], { dur: 0.02, type: 'sine', vol: 0.02 }),
      jump: () => squeak(0),
      score: () => tone([1319, 1760], { dur: 0.05, type: 'sine', vol: 0.03 }),
    },
  };

  window.ByteSkins = { SKINS, SOUNDS, unlockAudio: ac, audioReady: ready };
})();
