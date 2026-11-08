// Walk through the new UI like a first-time user and take screenshots.
// env: SKIN=goodboy|arcade  PRESET=simple|power|...  W=1600 H=1000
module.exports = async ({ js, shot, sleep, cmd }) => {
  const location0 = await js('location.href');
  const W = +(process.env.W || 1600), H = +(process.env.H || 1000);
  await cmd('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 700 });
  const skin = process.env.SKIN || 'goodboy', preset = process.env.PRESET || 'simple', tag = process.env.TAG || skin + '-' + preset;
  await js(`localStorage.clear(); localStorage.setItem('br.skin', JSON.stringify('${skin}')); localStorage.setItem('br.alerts', JSON.stringify('off')); 1`);
  await cmd('Page.navigate', { url: location0 }); await sleep(2600);
  await shot(tag + '-0-welcome');
  await js(`document.querySelector('#welcomeGo').click(); 1`); await sleep(600);
  await js(`document.querySelector('#newName').value = 'Dees cafe'; document.querySelector('#makeFolderBtn').click(); 1`); await sleep(1800);
  if (preset !== 'simple') {
    await js(`document.querySelector('#layoutBtn').click(); 1`); await sleep(300);
    await js(`[...document.querySelectorAll('#presetRow button')].find(b => b.textContent.toLowerCase().startsWith('${preset}'.slice(0, 4))).click(); 1`); await sleep(500);
    await js(`document.querySelector('#arrangeDone').click(); 1`); await sleep(400);
  }
  await shot(tag + '-1-start');
  await js(`const p = document.querySelector('#prompt'); p.value = 'hi'; document.querySelector('#sendBtn').click(); 1`);
  await sleep(1500);
  await shot(tag + '-2-asking');
  for (let i = 0; i < 12; i++) { await js(`[...document.querySelectorAll('.card.pending .actions .btn-mint')].forEach(b => b.click()); 1`); await sleep(500); }
  await sleep(1500);
  await shot(tag + '-3-done');
  console.log('errors on page:', await js(`window.__errs ? window.__errs.join(' | ') : 'none'`));
};
