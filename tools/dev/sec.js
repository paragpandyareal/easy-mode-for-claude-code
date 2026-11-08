// Security scenario: a hostile page in the project must not reach the app; a normal page must preview fine.
const fs = require('fs');
module.exports = async ({ js, shot, sleep }) => {
  await js(`document.querySelector('#newName').value = 'sec-test'; document.querySelector('#makeFolderBtn').click(); 1`);
  await sleep(2000);
  const cwd = await js(`document.querySelector('#pFolder').title.replace(/^Open /, '')`);
  console.log('project:', cwd);
  fs.writeFileSync(cwd + '\\poc.html', `<html><head></head><body><script>
    let out = [];
    try { out.push('parent token: ' + parent.document.querySelector('meta[name=br-token]').content); } catch (e) { out.push('parent blocked'); }
    fetch('http://localhost:4420/api/info?from=poc').then(r => r.status).catch(() => 'fetch blocked').then(s => { out.push('api: ' + s); document.title = out.join(' | '); });
  </script></body></html>`);
  fs.writeFileSync(cwd + '\\index.html', '<html><head><title>ok</title></head><body><h1 id=x>Hello preview</h1><script>localStorage.setItem("a","1");document.title="ls:"+localStorage.getItem("a")</script></body></html>');
  // Make the app see the files: send a turn so changes refresh, then pick the pages.
  await js(`document.querySelector('#prompt').value='hi'; document.querySelector('#sendBtn').click(); 1`);
  await sleep(1500);
  for (let i = 0; i < 8; i++) { await js(`[...document.querySelectorAll('#feed button')].filter(b => /yes|allow/i.test(b.textContent) && !b.disabled).forEach(b => b.click()); 1`); await sleep(700); }
  await js(`document.querySelector('.side-tab[data-tab=preview]').click(); 1`);
  await sleep(500);
  console.log('pages:', await js(`[...document.querySelectorAll('#previewPick option')].map(o => o.value).join(',')`));
  for (const pg of ['poc.html', 'index.html']) {
    await js(`const s = document.querySelector('#previewPick'); if (![...s.options].some(o => o.value === '${pg}')) s.append(new Option('${pg}', '${pg}')); s.value = '${pg}'; s.dispatchEvent(new Event('change')); 1`);
    await sleep(2500);
    console.log(pg, 'src:', await js(`document.querySelector('#previewFrame').src.replace(/\\/preview\\/.*/, '/preview/…')`));
    const t = await js(`(async () => { const f = document.querySelector('#previewFrame'); try { return f.contentDocument ? 'SAME ORIGIN (bad): ' + f.contentDocument.title : 'cross-origin'; } catch (e) { return 'cross-origin (good)'; } })()`);
    console.log(pg, 'frame from app side:', t);
  }
  await shot('sec-preview');
};
