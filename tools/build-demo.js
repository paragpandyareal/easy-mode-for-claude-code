#!/usr/bin/env node
// Builds a single self-contained demo page: fonts, styles, scripts and art inlined.
// usage: node tools/build-demo.js [out.html]   (BYTE_RUNNER_UI=public-next to build from another UI folder)
'use strict';
const fs = require('fs');
const path = require('path');
const pub = path.join(__dirname, '..', process.env.BYTE_RUNNER_UI || 'public');
const out = process.argv[2] || path.join(__dirname, '..', 'dist', 'easy-mode-demo.html');
const b64 = f => fs.readFileSync(f).toString('base64');

let html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
let css = fs.readFileSync(path.join(pub, 'style.css'), 'utf8');
css = css.replace(/url\('\/static\/fonts\/([^']+)'\)/g, (_, f) => `url(data:font/woff2;base64,${b64(path.join(pub, 'fonts', f))})`);
html = html.replace('<link rel="stylesheet" href="/static/style.css">', () => `<style>\n${css}\n</style>`);

// Art for the Good Boy Club skin, as data URLs the scene reads from window.BR_ART.
const artDir = path.join(pub, 'art');
const art = {};
if (fs.existsSync(artDir)) for (const f of fs.readdirSync(artDir)) if (f.endsWith('.png')) art[f.slice(0, -4)] = 'data:image/png;base64,' + b64(path.join(artDir, f));
const artScript = Object.keys(art).length ? `<script>window.BR_ART = ${JSON.stringify(art)};</script>\n` : '';

let first = true;
html = html.replace(/<script src="\/static\/([\w.]+)"><\/script>/g, (_, f) => {
  const code = `<script>\n${fs.readFileSync(path.join(pub, f), 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>`;
  if (first) { first = false; return artScript + code; }
  return code;
});
html = html.replace('<meta name="br-token" content="__BR_TOKEN__">', '<meta name="br-token" content="">');
html = html.replace(', viewport-fit=cover', '').replace('<title>Easy Mode for Claude Code</title>', '<title>Easy Mode demo</title>');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('Wrote', out, (html.length / 1024 / 1024).toFixed(1) + ' MB');
