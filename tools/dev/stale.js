// Scenario: chat open, server restarts underneath the page, user says hi.
const { execSync, spawn } = require('child_process');
module.exports = async ({ js, shot, sleep }) => {
  const toasts = () => js(`[...document.querySelectorAll('#toasts > *')].map(t => t.textContent).join(' | ')`);
  await js(`document.querySelector('#newName').value = 'stale-test'; document.querySelector('#makeFolderBtn').click(); 1`);
  await sleep(2000);
  console.log('tab before restart:', await js(`document.querySelector('#sessionTabs').textContent`));
  execSync(`powershell -NoProfile -c "Get-CimInstance Win32_Process -Filter \\"Name='node.exe'\\" | ? { $_.CommandLine -like '*practice.js*' } | % { Stop-Process -Id $_.ProcessId -Force }"`);
  console.log('server killed');
  await sleep(1500);
  spawn('node', ['tools/practice.js', '--no-open'], { cwd: require('path').join(__dirname, '..', '..'), detached: true, stdio: 'ignore', env: { ...process.env, FAKE_FAST: '1' } }).unref();
  console.log('server restarted');
  await sleep(6000);
  console.log('tab after restart:', JSON.stringify(await js(`document.querySelector('#sessionTabs').textContent`)));
  await js(`document.querySelector('#newName').value = 'stale-test-2'; document.querySelector('#makeFolderBtn').click(); 1`);
  await sleep(2000);
  await js(`const p = document.querySelector('#prompt'); p.value = 'hi'; document.querySelector('#sendBtn').click(); 1`);
  await sleep(3000);
  console.log('toasts:', await toasts());
  console.log('feed has hi:', await js(`[...document.querySelectorAll('.msg-user')].some(m => m.textContent.includes('hi'))`));
  await shot('04-stale');
};
