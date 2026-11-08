// Full feature check in practice mode (pretend Claude). Prints PASS / FAIL for each thing.
// usage: UI_SCRIPT=tools/dev/full.js node tools/dev/ui.js http://127.0.0.1:4431/ <outdir>
// env: SKIN=goodboy|arcade  SHOTS=1 to save screenshots
module.exports = async ({ js, shot, sleep, cmd }) => {
  let fails = 0;
  const ok = (c, m) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const q = sel => js(`!!document.querySelector(${JSON.stringify(sel)})`);
  const txt = sel => js(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const visible = sel => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && !!(e.offsetWidth || e.offsetHeight) && getComputedStyle(e).display !== 'none'; })()`);
  const click = sel => js(`(document.querySelector(${JSON.stringify(sel)}) || { click() { throw new Error('no ' + ${JSON.stringify(sel)}) } }).click(), 1`);
  const SHOT = process.env.SHOTS ? shot : async () => {};
  const skin = process.env.SKIN || 'goodboy';
  const u = await js('location.href');

  // start clean: close any projects left from an earlier run
  await js(`(async () => { const i = await ByteApp.api('/api/info'); for (const x of i.sessions || []) await ByteApp.api('/api/session/' + x.id + '/close', {}); for (let k = 0; k < 40; k++) { const j = await ByteApp.api('/api/info'); if (!(j.sessions || []).length) break; await new Promise(r => setTimeout(r, 250)); } return 1; })()`);
  await js(`localStorage.clear(); localStorage.setItem('br.skin', JSON.stringify('${skin}')); 1`);
  await cmd('Page.navigate', { url: u }); await sleep(2600);
  await js(`window.__errs = []; addEventListener('error', e => __errs.push(e.message)); 1`);

  // first run
  ok(await visible('#welcomeModal'), 'welcome shows on first run');
  await js(`window.__osc = 0; const o = AudioContext.prototype.createOscillator; AudioContext.prototype.createOscillator = function () { __osc++; return o.call(this); }; 1`);
  const r = JSON.parse(await js(`JSON.stringify(document.querySelector('#testSound').getBoundingClientRect())`));
  for (const type of ['mousePressed', 'mouseReleased']) await cmd('Input.dispatchMouseEvent', { type, x: r.x + r.width / 2, y: r.y + r.height / 2, button: 'left', clickCount: 1 });
  await sleep(1400);
  ok(await js('__osc') > 2, 'Play a sample makes sound (' + await js('__osc') + ' tones)');
  ok(/♪|again/.test(await txt('#testSound')), 'Play a sample shows it is playing: ' + await txt('#testSound'));
  await click('#welcomeGo'); await sleep(700);
  ok(await visible('#newModal'), 'new project box opens after welcome' + (await visible('#newModal') ? '' : ' (projects already open: ' + await js(`[...ByteApp.sessions.values()].map(x => x.info.cwd.split(/[\/]/).pop() + (x.busy ? ' busy' : '')).join(', ')`) + ')'));

  // new project
  await js(`document.querySelector('#newName').value = 'Full test'; 1`); await click('#makeFolderBtn'); await sleep(2000);
  ok(await js(`document.querySelectorAll('#board .sess[data-sid]').length`) === 1, 'project card on the board');
  ok(await q('.welcome .starter'), 'starter ideas show in a new chat');
  ok(/Just results/.test(await txt('#detailBtn')), 'Simple layout starts on Just results');
  await SHOT(skin + '-full-1-start');

  // a round with questions
  await js(`document.querySelector('#prompt').value = 'make me a cafe site'; document.querySelector('#sendBtn').click(); 1`);
  await sleep(1200);
  ok(await visible('.progress-line'), 'progress line shows while working (Just results)');
  let asked = 0;
  for (let i = 0; i < 30; i++) {
    await sleep(600);
    const n = await js(`document.querySelectorAll('.card.pending').length`);
    if (n) {
      asked++;
      if (asked === 1) { ok(await visible('#needsBar'), 'needs bar shows when Claude asks'); ok(await visible('#sceneAsk'), 'question also floats over the scene'); await SHOT(skin + '-full-2-asking'); }
      if (asked === 2 && await js(`!!document.querySelector('#sceneAsk kbd')`)) { await js(`document.activeElement.blur(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', bubbles: true })); 1`); await sleep(500); ok(await js(`document.querySelectorAll('.card.pending').length`) < n || !(await visible('#sceneAsk')), 'pressing Y answers from the scene'); }
      await js(`[...document.querySelectorAll('.card.pending .actions .btn-mint')].forEach(b => b.click()); 1`);
    }
    if (await q('.level-clear')) break;
  }
  await sleep(1500);
  ok(asked > 0, 'Claude asked for permission ' + asked + ' times and we said yes');
  ok(await q('.level-clear[data-kind="big"]'), 'round finished with a level clear');
  ok(await visible('#usageRings .ring'), 'usage rings show by Undo');
  ok(!(await q('#board .card-ring')), 'no memory ring on the card while memory is low');
  ok(!(await visible('.session-feed > .tool')), 'steps are hidden in Just results');
  ok(/✓ \d+ steps/.test(await txt('.progress-line')), 'progress line sums up: ' + await txt('.progress-line'));
  await click('.progress-line'); await sleep(200);
  ok(await visible('.session-feed > .tool.peek'), 'show steps reveals the steps for that round');
  await click('.progress-line');
  ok(await js(`[...document.querySelectorAll('.w-preview select option')].some(o => /index\\.html/.test(o.value))`), 'Show and tell offers index.html');
  ok(await q('.w-preview iframe'), 'Show and tell shows the page');
  ok(/4\/4|\d\/\d/.test(await txt('.w-quests .pc')), 'to-do list filled: ' + await txt('.w-quests .pc'));
  ok(await js(`document.querySelectorAll('.w-changes .file').length`) >= 1, 'changed files listed');
  ok(!/\$/.test(await txt('#hudCostWrap')) || await js(`getComputedStyle(document.querySelector('#hudCostWrap')).display === 'none'`), 'no $ on the scene for plan users');
  await SHOT(skin + '-full-3-done');

  // notes survive Claude working
  await js(`document.querySelector('#layoutBtn').click(); 1`); await sleep(300);
  await click('#addBlockBtn'); await sleep(200);
  await js(`[...document.querySelectorAll('#addMenu button')].find(b => /notes|scribble|jot/i.test(b.textContent) || b.textContent.includes('Your own notes')).click(); 1`); await sleep(400);
  await click('#arrangeDone'); await sleep(300);
  await js(`const t = document.querySelector('.notes-area'); t.value = 'remember the cats'; t.dispatchEvent(new Event('input')); 1`);
  await js(`document.querySelector('#prompt').value = 'add a booking button'; document.querySelector('#sendBtn').click(); 1`);
  for (let i = 0; i < 20; i++) { await sleep(500); await js(`[...document.querySelectorAll('.card.pending .actions .btn-mint')].forEach(b => b.click()); 1`); }
  ok(await js(`document.querySelector('.notes-area').value`) === 'remember the cats', 'notes are not wiped while Claude works');

  // every step view
  await click('#detailBtn'); await sleep(300);
  ok(/Every step/.test(await txt('#detailBtn')), 'switch to Every step');
  ok(await visible('.session-feed > .tool'), 'steps show in Every step');

  // theme switch mid-chat
  await click('#skinBtn'); await sleep(600);
  const other = skin === 'goodboy' ? 'arcade' : 'goodboy';
  ok(await js(`document.documentElement.dataset.skin`) === other, 'theme switched to ' + other);
  const who = await txt('.msg-claude .who');
  ok(other === 'arcade' ? /CLAUDE/.test(who) : /Winston/.test(who), 'old messages follow the theme: ' + who.slice(0, 20));
  const lc = await txt('.level-clear[data-kind="big"] .lc-title');
  ok(other === 'arcade' ? /LEVEL CLEAR/.test(lc) : /GOOD BOY/.test(lc), 'level clear follows the theme: ' + lc);
  await SHOT(skin + '-full-4-switched');
  await click('#skinBtn'); await sleep(400);

  // undo and redo
  await sleep(1500);
  const before = await js(`document.querySelectorAll('.w-changes .file').length`);
  await js(`document.querySelector('#undoBtn').click(); 1`); await sleep(400);
  await js(`[...document.querySelectorAll('#setupModal button')].find(b => /undo/i.test(b.textContent)).click(); 1`); await sleep(1500);
  ok(await visible('#redoBtn'), 'Undo works and offers Redo');
  await click('#redoBtn'); await sleep(1800);
  ok(!(await visible('#redoBtn')) && /Redone/.test(await js(`document.querySelector('.session-feed').textContent`)), 'Redo works');
  ok(await js(`document.querySelectorAll('.w-changes .file').length`) === before, 'Redo brings the file list back (' + before + ')');

  // palette, history, shortcuts
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })); 1`); await sleep(300);
  ok(await visible('#palette'), 'Ctrl+K opens the finder');
  ok(!(await js(`[...document.querySelectorAll('#palList .slash-item b')].some(b => /New New/.test(b.textContent))`)), 'no "New New" in the finder');
  await js(`document.querySelector('#palette').classList.add('hidden'); 1`);
  await js(`const p = document.querySelector('#prompt'); p.value = ''; p.focus(); p.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); 1`);
  ok(await js(`document.querySelector('#prompt').value`) === 'add a booking button', 'Up arrow brings back the last message');
  await js(`document.querySelector('#prompt').value = ''; 1`);

  // reload: no replayed sounds, Diesel does not come back
  await js(`sessionStorage.setItem('x', 1); 1`);
  await cmd('Page.navigate', { url: u }); await sleep(3000);
  await js(`window.__osc2 = 0; 1`);
  ok(await js(`document.querySelectorAll('#board .sess[data-sid]').length`) >= 1, 'project is still there after reload');
  ok(await q('.level-clear'), 'chat history comes back after reload');
  ok(await js(`document.querySelectorAll('#toasts .toast').length`) === 0, 'no pop-ups when catching up after reload');

  // phone width
  await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await sleep(800);
  ok(await js(`document.documentElement.scrollWidth <= innerWidth + 1`), 'no sideways scroll on a phone (' + await js('document.documentElement.scrollWidth') + 'px)');
  await SHOT(skin + '-full-5-phone');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

  const errs = await js(`(window.__errs || []).join(' | ')`);
  ok(!errs, 'no script errors on the page ' + (errs || ''));
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
};
