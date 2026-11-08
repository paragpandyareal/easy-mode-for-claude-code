// Cut the owner's Good Boy Club pictures into transparent PNG sprites, using headless Edge's canvas.
// usage: UI_SCRIPT=tools/dev/art-cut.js node tools/dev/ui.js about:blank <anything>
// Reads art/source/*.jpg, writes public-next/art/*.png and public-next/art/manifest.json
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'art', 'source'), OUT = path.join(ROOT, 'public-next', 'art');

// What to cut from each picture. names[] are in reading order (rows top to bottom, then left to right).
const JOBS = [
  { file: 'image_a00353c1.jpg', bg: 'cream', h: 230, grid: [2, 3], names: ['w_front', 'w_stand', 'w_walk', 'w_sit_ball', 'w_jump', 'w_sleep'] },
  { file: 'image_39100281.jpg', bg: 'key', h: 230, stripLines: true, grid: [1, 4], tint: [229, 171, 116], names: ['w_walk1', 'w_walk2', 'w_walk3', 'w_walk4'] },
  { file: 'image_428dd885.jpg', bg: 'cream', h: 220, grid: [1, 3], names: ['d_sit', 'd_stand', 'd_star'], glowLast: true },
  { file: 'image_35059c49.jpg', bg: 'cream', h: 170, grid: [1, 6], names: ['p_pip', 'p_mochi', 'p_biscuit', 'p_pepper', 'p_luna', 'p_tofu'] },
  { file: 'image_6cc9b21b.jpg', bg: 'key', h: 170, grid: [1, 6], names: ['p_pip_walk', 'p_mochi_walk', 'p_biscuit_walk', 'p_pepper_walk', 'p_luna_walk', 'p_tofu_walk'] },
  { file: 'image_eb319a0.jpg', bg: 'floodkey', h: 170, grid: [1, 6], names: ['p_pip_stick', 'p_mochi_stick', 'p_biscuit_stick', 'p_pepper_stick', 'p_luna_stick', 'p_tofu_stick'] },
  { file: 'image_8409d00c.jpg', bg: 'frame', layer: 'bg_sky' },
  { file: 'image_58d88460.jpg', bg: 'key', layer: 'bg_hills' },
  { file: 'image_41f08b2.jpg', bg: 'key', layer: 'bg_fence', cropY: [0.34, 0.672] },
  { file: 'image_74625981.jpg', bg: 'key', layer: 'bg_path' },
];

const PAGE_LIB = `
window.Cut = {
  async load(url) { const im = new Image(); im.src = url; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, c.width, c.height); },
  bgColor(d) { // median of the four corner patches
    const W = d.width, H = d.height, s = [];
    for (const [x0, y0] of [[2, 2], [W - 12, 2], [Math.round(W / 2), 2]]) for (let y = y0; y < y0 + 10; y++) for (let x = x0; x < x0 + 10; x++) { const i = (y * W + x) * 4; s.push([d.data[i], d.data[i + 1], d.data[i + 2]]); }
    const med = k => s.map(p => p[k]).sort((a, b) => a - b)[s.length >> 1];
    return [med(0), med(1), med(2)];
  },
  dist(d, i, bg) { const r = d.data[i] - bg[0], g = d.data[i + 1] - bg[1], b = d.data[i + 2] - bg[2]; return Math.sqrt(r * r + g * g + b * b); },
  // Unmix a pixel from the background colour so edges are clean (no magenta fringe).
  unmix(d, i, bg, a) { for (let k = 0; k < 3; k++) d.data[i + k] = Math.max(0, Math.min(255, Math.round((d.data[i + k] - (1 - a) * bg[k]) / a))); d.data[i + 3] = Math.round(a * 255); },
  keyAll(d, bg, lo = 45, hi = 100) { for (let i = 0; i < d.data.length; i += 4) { const dd = this.dist(d, i, bg); if (dd <= lo) d.data[i + 3] = 0; else if (dd < hi) this.unmix(d, i, bg, (dd - lo) / (hi - lo)); } },
  // Flood from the edges only, so white bellies inside outlines survive.
  flood(d, bg, lo = 40, hi = 70) {
    const W = d.width, H = d.height, seen = new Uint8Array(W * H), st = [];
    for (let x = 0; x < W; x++) st.push(x, (H - 1) * W + x); for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1);
    while (st.length) {
      const p = st.pop(); if (seen[p]) continue; seen[p] = 1;
      const i = p * 4, dd = this.dist(d, i, bg); if (dd >= hi) continue;
      if (dd <= lo) d.data[i + 3] = 0; else { this.unmix(d, i, bg, (dd - lo) / (hi - lo)); continue; }
      const x = p % W; if (x > 0) st.push(p - 1); if (x < W - 1) st.push(p + 1); if (p >= W) st.push(p - W); if (p < W * (H - 1)) st.push(p + W);
    }
  },
  colorToAlpha(d, bg) { // for soft glows: alpha = how far a pixel is from the background
    for (let i = 0; i < d.data.length; i += 4) {
      let a = 0; for (let k = 0; k < 3; k++) { const v = d.data[i + k], b = bg[k]; a = Math.max(a, v > b ? (v - b) / (255 - b || 1) : (b - v) / (b || 1)); }
      a = Math.min(1, a * 1.25); if (a < 0.04) { d.data[i + 3] = 0; continue; } this.unmix(d, i, bg, a);
    }
  },
  stripLines(d) { const W = d.width; for (let y = 0; y < d.height; y++) { let run = 0, best = 0; for (let x = 0; x < W; x++) { if (d.data[(y * W + x) * 4 + 3] > 128) { run++; if (run > best) best = run; } else run = 0; } if (best > W * 0.5) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; d.data[i + 3] = 0; } } },
  bands(d, axis, box, minGap, minSize) { // runs of non-empty rows/cols inside box
    const prof = [], [x0, y0, x1, y1] = box, W = d.width;
    const len = axis === 'y' ? y1 - y0 : x1 - x0;
    for (let k = 0; k < len; k++) { let n = 0; if (axis === 'y') { for (let x = x0; x < x1; x++) if (d.data[((y0 + k) * W + x) * 4 + 3] > 40) n++; } else { for (let y = y0; y < y1; y++) if (d.data[(y * W + x0 + k) * 4 + 3] > 40) n++; } prof.push(n > 1); }
    const out = []; let s = -1, gap = 0;
    for (let k = 0; k <= len; k++) { const on = k < len && prof[k]; if (on) { if (s < 0) s = k; gap = 0; } else if (s >= 0) { gap++; if (gap >= minGap || k === len) { const e = k - gap + 1; if (e - s >= minSize) out.push([s, e]); s = -1; gap = 0; } } }
    return out;
  },
  sprites(d) {
    const rows = this.bands(d, 'y', [0, 0, d.width, d.height], 14, 30), boxes = [];
    for (const [ry0, ry1] of rows) for (const [cx0, cx1] of this.bands(d, 'x', [0, ry0, d.width, ry1], 18, 40)) {
      const [[yy0, yy1]] = this.bands(d, 'y', [cx0, ry0, cx1, ry1], 30, 4).length ? [this.bands(d, 'y', [cx0, ry0, cx1, ry1], 30, 4).reduce((a, b) => [Math.min(a[0], b[0]), Math.max(a[1], b[1])])] : [[0, ry1 - ry0]];
      boxes.push([cx0, ry0 + yy0, cx1, ry0 + yy1]);
    }
    return boxes;
  },
  gridBoxes(d, rows, cols) {
    const W = d.width, H = d.height;
    let rb = this.bands(d, 'y', [0, 0, W, H], 14, 30);
    if (rb.length !== rows) { const ys = this.bands(d, 'y', [0, 0, W, H], 9999, 1); const y0 = ys[0][0], y1 = ys[ys.length - 1][1]; rb = Array.from({ length: rows }, (_, r) => [y0 + Math.round((y1 - y0) * r / rows), y0 + Math.round((y1 - y0) * (r + 1) / rows)]); }
    const boxes = [];
    for (const [ry0, ry1] of rb) {
      const xs = this.bands(d, 'x', [0, ry0, W, ry1], 9999, 1); const x0 = xs[0][0], x1 = xs[xs.length - 1][1];
      const col = x => { let n = 0; for (let y = ry0; y < ry1; y++) if (d.data[(y * W + x) * 4 + 3] > 40) n++; return n; };
      const cuts = [x0];
      for (let c = 1; c < cols; c++) { const ex = Math.round(x0 + (x1 - x0) * c / cols), r = Math.round((x1 - x0) / cols / 3); let best = ex, bn = 1e9; for (let x = ex - r; x <= ex + r; x++) { const n = col(x); if (n < bn) { bn = n; best = x; } } cuts.push(best); }
      cuts.push(x1);
      for (let c = 0; c < cols; c++) {
        const cx0 = cuts[c], cx1 = cuts[c + 1];
        const yb = this.bands(d, 'y', [cx0, ry0, cx1, ry1], 9999, 1);
        const xb = this.bands(d, 'x', [cx0, ry0, cx1, ry1], 9999, 1);
        boxes.push([cx0 + xb[0][0], ry0 + yb[0][0], cx0 + xb[xb.length - 1][1], ry0 + yb[yb.length - 1][1]]);
      }
    }
    return boxes;
  },
  // Keep only the main animal inside a box (drop slivers of neighbours), then shrink the box to fit.
  mainOnly(d, box) {
    const [x0, y0, x1, y1] = box, w = x1 - x0, h = y1 - y0, lab = new Int32Array(w * h), sizes = [0];
    for (let p = 0; p < w * h; p++) {
      if (lab[p] || d.data[((y0 + (p / w | 0)) * d.width + x0 + p % w) * 4 + 3] <= 40) continue;
      const id = sizes.length; let n = 0; const st = [p]; lab[p] = id;
      while (st.length) { const q = st.pop(); n++; const qx = q % w, qy = q / w | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = qx + dx, ny = qy + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const r = ny * w + nx; if (lab[r]) continue; if (d.data[((y0 + ny) * d.width + x0 + nx) * 4 + 3] > 40) { lab[r] = id; st.push(r); } } }
      sizes.push(n);
    }
    const big = Math.max(...sizes);
    let nx0 = w, ny0 = h, nx1 = 0, ny1 = 0;
    for (let p = 0; p < w * h; p++) {
      const i = ((y0 + (p / w | 0)) * d.width + x0 + p % w) * 4;
      if (lab[p] && sizes[lab[p]] < big * 0.06) { d.data[i + 3] = 0; continue; }
      if (lab[p]) { const x = p % w, y = p / w | 0; nx0 = Math.min(nx0, x); nx1 = Math.max(nx1, x + 1); ny0 = Math.min(ny0, y); ny1 = Math.max(ny1, y + 1); }
    }
    return [x0 + nx0, y0 + ny0, x0 + nx1, y0 + ny1];
  },
  coatMean(d, box) { let r = 0, g = 0, b = 0, n = 0; const [x0, y0, x1, y1] = box; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * d.width + x) * 4; const R = d.data[i], G = d.data[i + 1], B = d.data[i + 2]; if (d.data[i + 3] > 250 && R > 150 && R - B > 50 && R < 250) { r += R; g += G; b += B; n++; } } return n ? [r / n, g / n, b / n] : null; },
  tint(d, from, to, box) { const gain = [to[0] / from[0], to[1] / from[1], to[2] / from[2]]; const [bx0, by0, bx1, by1] = box; for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { const i = (y * d.width + x) * 4; const R = d.data[i], B = d.data[i + 2]; if (d.data[i + 3] > 0 && R - B > 35 && R > 120) for (let k = 0; k < 3; k++) d.data[i + k] = Math.min(255, Math.round(d.data[i + k] * gain[k])); } },
  png(d, box, targetH) {
    const [x0, y0, x1, y1] = box, w = x1 - x0, h = y1 - y0;
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(d, -x0, -y0, x0, y0, w, h);
    const s = targetH ? Math.min(1, targetH / h) : 1, o = document.createElement('canvas');
    o.width = Math.round(w * s); o.height = Math.round(h * s); const g = o.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, o.width, o.height);
    return { url: o.toDataURL('image/png'), w: o.width, h: o.height };
  },
};`;

module.exports = async ({ js }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await js(PAGE_LIB + '; 1');
  const manifest = {};
  const coat = {};
  for (const job of JOBS) {
    const b64 = fs.readFileSync(path.join(SRC, job.file)).toString('base64');
    await js(`window.__src = 'data:image/jpeg;base64,${b64}'; 1`);
    const res = await js(`(async () => {
      const job = ${JSON.stringify(job)};
      const d = await Cut.load(window.__src), orig = new ImageData(new Uint8ClampedArray(d.data), d.width, d.height);
      const bg = Cut.bgColor(d), out = [];
      if (job.bg === 'frame') { // sky inside a magenta frame: crop to the inner box
        let x0 = d.width, y0 = d.height, x1 = 0, y1 = 0;
        for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) if (Cut.dist(d, (y * d.width + x) * 4, bg) > 120) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        out.push({ name: job.layer, ...Cut.png(d, [x0 + 6, y0 + 6, x1 - 5, y1 - 5]) });
        return { dims: [d.width, d.height], bg, out };
      }
      if (job.bg === 'cream') Cut.flood(d, bg); else if (job.bg === 'floodkey') { Cut.flood(d, bg, 40, 75); Cut.keyAll(d, bg, 28, 29); } else Cut.keyAll(d, bg);
      if (job.stripLines) Cut.stripLines(d);
      if (job.layer) {
        let box = [0, 0, d.width, d.height];
        if (job.cropY) box = [0, Math.round(d.height * job.cropY[0]), d.width, Math.round(d.height * job.cropY[1])];
        else { const ys = Cut.bands(d, 'y', box, 9999, 1); if (ys.length) box = [0, ys[0][0], d.width, ys[ys.length - 1][1]]; }
        out.push({ name: job.layer, ...Cut.png(d, box) });
        return { dims: [d.width, d.height], bg, out };
      }
      const boxes = job.grid ? Cut.gridBoxes(d, job.grid[0], job.grid[1]) : Cut.sprites(d);
      boxes.forEach((bx, k) => {
        let src = d;
        if (job.glowLast && k === boxes.length - 1) { src = new ImageData(new Uint8ClampedArray(orig.data), orig.width, orig.height); Cut.colorToAlpha(src, bg); bx = [Math.max(0, bx[0] - 40), Math.max(0, bx[1] - 40), Math.min(d.width, bx[2] + 40), Math.min(d.height, bx[3] + 40)]; }
        if (!(job.glowLast && k === boxes.length - 1)) bx = Cut.mainOnly(src, bx); let m = Cut.coatMean(src, bx); if (job.tint && m) { Cut.tint(src, m, job.tint, bx); m = Cut.coatMean(src, bx); }
        out.push({ name: (job.names || [])[k] || ('extra' + k), coat: m, box: bx, ...Cut.png(src, bx, job.h) });
      });
      return { dims: [d.width, d.height], bg, count: boxes.length, out };
    })()`);
    if (!res || typeof res === 'string') { console.log('FAIL', job.file, res); continue; }
    console.log(job.file, 'size', res.dims.join('x'), 'bg', res.bg.join(','), 'pieces', res.out.length, res.count != null && job.names && res.count !== job.names.length ? `  !! expected ${job.names.length}` : '');
    for (const o of res.out) {
      fs.writeFileSync(path.join(OUT, o.name + '.png'), Buffer.from(o.url.split(',')[1], 'base64'));
      manifest[o.name] = { w: o.w, h: o.h };
      if (o.coat) coat[o.name] = o.coat.map(Math.round);
    }
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log('coat means', JSON.stringify({ stand: coat.w_stand, walk1: coat.w_walk1 }));
};
