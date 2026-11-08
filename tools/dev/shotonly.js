module.exports = async ({ shot, sleep }) => { await sleep(Number(process.env.WAIT || 1500)); await shot(process.env.NAME || 'scene'); };
