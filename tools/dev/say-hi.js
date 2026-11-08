// Scenario: fresh page, make a new project, say hi.
module.exports = async ({ js, shot, sleep }) => {
  const toasts = () => js(`[...document.querySelectorAll('#toasts > *')].map(t => t.textContent).join(' | ')`);
  await shot('01-start');
  console.log('modal open:', await js(`!document.querySelector('#newModal').classList.contains('hidden')`));
  await js(`document.querySelector('#newName').value = 'hello-test'; document.querySelector('#makeFolderBtn').click(); 1`);
  await sleep(2500);
  await shot('02-after-create');
  console.log('toasts after create:', await toasts());
  await js(`const p = document.querySelector('#prompt'); p.value = 'hi'; document.querySelector('#sendBtn').click(); 1`);
  await sleep(5000);
  console.log('toasts after hi:', await toasts());
  console.log('conn:', await js(`document.querySelector('#connText').textContent`));
  await shot('03-after-hi');
};
