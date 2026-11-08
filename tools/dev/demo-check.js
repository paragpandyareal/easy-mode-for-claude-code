// Check the offline demo page (dist/easy-mode-demo.html) like a visitor would.
// usage: UI_SCRIPT=tools/dev/demo-check.js node tools/dev/ui.js file:///C:/path/to/demo.html <outdir>
// env: SKIN=goodboy|arcade  SHOTS=1
module.exports = async ({ js, shot, sleep, cmd }) => {
  let fails = 0;
  const ok = (c, m) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const visible = sel => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && !!(e.offsetWidth || e.offsetHeight) && getComputedStyle(e).display !== 'none'; })()`);
  const txt = sel => js(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const SHOT = process.env.SHOTS ? shot : async () => {};
  const skin = process.env.SKIN || 'goodboy';
  const u = await js('location.href');
  await js(`localStorage.clear(); localStorage.setItem('br.skin', JSON.stringify('${skin}')); 1`);
  await cmd('Page.navigate', { url: u }); await sleep(1200);
  await js(`window.__errs = []; addEventListener('error', e => __errs.push(e.message)); 1`);

  ok(await visible('#demoBanner') && /DEMO/.test(await txt('#demoBanner')), 'demo banner shows');
  ok(await visible('#welcomeModal'), 'welcome shows on first visit');
  ok(await js(`!!(window.BR_ART && Object.keys(BR_ART).length > 20)`), 'art is built into the page (' + await js(`Object.keys(window.BR_ART || {}).length`) + ' pictures)');
  await js(`document.querySelector('#welcomeGo').click(); 1`); await sleep(400);
  ok(!(await visible('#welcomeModal')), 'welcome closes');
  ok(await js(`document.querySelectorAll('#board .sess[data-sid]').length`) === 1, 'demo project is on the board');

  // the demo types its own first message
  let asked = 0, done = false;
  for (let i = 0; i < 60 && !done; i++) {
    await sleep(500);
    const n = await js(`document.querySelectorAll('.card.pending').length`);
    if (n) { asked++; if (asked === 1) await SHOT(skin + '-demo-1-asking'); await js(`[...document.querySelectorAll('.card.pending .actions .btn-mint')].forEach(b => b.click()); 1`); }
    done = await js(`!!document.querySelector('.level-clear')`);
  }
  ok(done, 'the demo plays a full round by itself');
  ok(asked >= 2, 'the demo asks for permission (' + asked + ' times)');
  await sleep(1200);
  ok(await js(`[...document.querySelectorAll('.w-preview select option')].some(o => /index\\.html/.test(o.value))`), 'Show and tell offers index.html');
  ok(await js(`!!document.querySelector('.w-preview iframe') && /Whisker/.test(document.querySelector('.w-preview iframe').srcdoc)`), 'Show and tell shows the café page');
  ok(/Just results/.test(await txt('#detailBtn')), 'demo starts on Just results');
  ok(/steps/.test(await txt('.progress-line')), 'progress line sums up the round: ' + await txt('.progress-line'));
  ok(await js(`document.querySelectorAll('.w-quests .quest.done').length`) >= 3, 'to-do list ticked off');
  ok(await visible('#usageRings .ring'), 'usage rings show');
  ok(!(await visible('#hudCostWrap')) === (await js(`!!(ByteApp.sessions.values().next().value.caps.account.subscriptionType)`)), 'cost chip hidden only for plan accounts');
  await SHOT(skin + '-demo-2-done');

  // second round, then undo
  await js(`document.querySelector('#prompt').value = 'add a booking button'; document.querySelector('#sendBtn').click(); 1`);
  for (let i = 0; i < 30; i++) { await sleep(500); await js(`[...document.querySelectorAll('.card.pending .actions .btn-mint')].forEach(b => b.click()); 1`); if (await js(`document.querySelectorAll('.level-clear').length`) >= 2) break; }
  ok(await js(`document.querySelectorAll('.level-clear').length`) >= 2, 'second round finishes');
  await js(`document.querySelector('#undoBtn').click(); 1`); await sleep(300);
  await js(`[...document.querySelectorAll('#setupModal button')].find(b => /undo/i.test(b.textContent)).click(); 1`); await sleep(800);
  ok(/Undone/.test(await js(`document.querySelector('.session-feed').textContent`)), 'Undo works in the demo');

  // switches
  await js(`document.querySelector('#detailBtn').click(); 1`); await sleep(200);
  ok(await visible('.session-feed > .tool'), 'Every step shows the steps');
  await js(`document.querySelector('#skinBtn').click(); 1`); await sleep(500);
  const who = await txt('.msg-claude .who');
  ok(skin === 'goodboy' ? /CLAUDE/.test(who) : /Winston/.test(who), 'theme switch re-words the chat: ' + who.slice(0, 14));
  await js(`document.querySelector('#soundBtn').click(); 1`); await sleep(200);
  ok(await visible('#bellMenu'), 'bell opens its menu');
  await js(`document.body.click(); 1`);
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })); 1`); await sleep(200);
  ok(await visible('#palette'), 'Ctrl+K finder opens');
  await js(`document.querySelector('#palette').classList.add('hidden'); 1`);
  await js(`document.querySelector('#layoutBtn').click(); 1`); await sleep(200);
  ok(await visible('#arrangeBar') && await visible('#resetLayout'), 'Customise bar with Reset');
  await js(`document.querySelector('#arrangeDone').click(); 1`);

  await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await sleep(700);
  ok(await visible('#phoneTabs'), 'phone tabs show on a phone');
  ok(await js(`document.documentElement.scrollWidth <= innerWidth + 1`), 'no sideways scroll on a phone');
  await SHOT(skin + '-demo-3-phone');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

  const errs = await js(`(window.__errs || []).join(' | ')`);
  ok(!errs, 'no script errors ' + (errs || ''));
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
};
