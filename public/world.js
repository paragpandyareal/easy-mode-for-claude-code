/* =========================================================
   BYTE RUNNER · the animated world
   Two original pixel worlds that act out what Claude is doing:
     arcade  : Bit the robot runs through a dusk city
     goodboy : Winston the English bulldog and his pack in a sunny park
   Pixels are drawn on a small canvas and scaled up by a whole number,
   so they stay crisp and even at any size.
   ========================================================= */
(function () {
  'use strict';

  const LH = 84; // full height of the scene art in "pixels"
  const VIEW = 60; // how many rows we try to show; the top of the sky is cropped on short panels
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- tiny drawing kit ---------------- */
  let g = null; // low-res context we draw into
  function px(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); }
  function sprite(rows, x, y, pal, alpha = 1, flip = false) {
    g.globalAlpha = alpha;
    const W = rows[0].length;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch !== ' ' && ch !== '.') { g.fillStyle = pal[ch] || ch; g.fillRect(Math.round(x + (flip ? W - 1 - c : c)), Math.round(y + r), 1, 1); }
      }
    }
    g.globalAlpha = 1;
  }
  // Seeded random so cities and parks look the same every time.
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  /* ---------------- Bit (arcade lead) ---------------- */
  const BIT_PAL = { k: '#241b4d', m: '#7ee8c8', M: '#4fc4a5', f: '#1b1640', e: '#ffe08a', a: '#ff92b4', w: '#e9fff8', c: '#ff92b4' };
  const BOT = [
    '       aa       ',
    '       kk       ',
    '  kkkkkkkkkkkk  ',
    ' kwmmmmmmmmmmMk ',
    ' kmffffffffffMk ',
    ' kmffeeffeeffMk ',
    ' kmffeeffeeffMk ',
    ' kmffffffffffMk ',
    ' kmmcmmmmmmcmMk ',
    '  kkkkkkkkkkkk  ',
    '    kMMMMMMk    ',
    '   kMmmmmmmMk   ',
    '   kMmmaammMk   ',
    '   kMmmmmmmMk   ',
    '    kkkkkkkk    ',
  ];
  const BLINK = ' kmffffffffffMk ';
  const LEGS = [['    MM    MM    ', '   MM      MM   '], ['     MM  MM     ', '     MM  MM     '], ['   MM      MM   ', '    MM    MM    '], ['     MM  MM     ', '     MM  MM     ']];
  const STAND = ['     MM  MM     ', '     MM  MM     '];

  function drawBit(x, gy, st) {
    // x = centre, gy = ground line
    const t = st.t, w = 16, top = gy - 17 + (st.hop || 0);
    const x0 = Math.round(x - w / 2);
    const rows = BOT.slice();
    if (st.blink) { rows[5] = BLINK; rows[6] = BLINK; }
    if (st.mood === 'error') { rows[5] = ' kmffeffffeffMk '.replace(/e/g, 'a'); rows[6] = BLINK; }
    sprite(rows, x0, top + (st.bob || 0), BIT_PAL);
    const legs = st.moving ? LEGS[st.frame % 4] : STAND;
    sprite(legs, x0, top + 15, BIT_PAL);
    // arms
    const swing = st.moving ? (st.frame % 2 ? 1 : -1) : 0;
    if (st.mood === 'wait') {
      // holds up a "!" sign, bobbing
      const sy = top - 9 + (Math.floor(t / 300) % 2);
      px(x0 + 13, sy + 6, 1, 6, '#4fc4a5');
      px(x0 + 10, sy, 7, 7, '#241b4d'); px(x0 + 11, sy + 1, 5, 5, '#ffe08a'); px(x0 + 13, sy + 2, 1, 2, '#241b4d'); px(x0 + 13, sy + 5, 1, 1, '#241b4d');
      px(x0 + 2, top + 11, 1, 3, '#4fc4a5');
    } else if (st.mood === 'done') {
      px(x0 + 1, top + 6, 1, 4, '#4fc4a5'); px(x0 + 14, top + 6, 1, 4, '#4fc4a5');
    } else {
      px(x0 + 2, top + 11 + swing, 1, 3, '#4fc4a5'); px(x0 + 13, top + 11 - swing, 1, 3, '#4fc4a5');
    }
    if (st.mood === 'error') { // little smoke puff
      const k = (t / 120) % 12; g.globalAlpha = 0.6; px(x0 + 8 + k / 3, top - 3 - k, 2, 2, '#c9c0ef'); g.globalAlpha = 1;
    }
  }

  /* ---------------- the pack: names only (the cartoon art is in /static/art) ---------------- */
  const BREEDS = { pip: 'Pip', mochi: 'Mochi', biscuit: 'Biscuit', pepper: 'Pepper', luna: 'Luna', tofu: 'Tofu' };

  /* ---------------- arcade helpers: drones ---------------- */
  function drawDrone(x, y, col, t, carry) {
    const spin = Math.floor(t / 60) % 2;
    px(x - 4 + spin, y - 3, 9 - spin * 2, 1, '#d8ecff');
    px(x, y - 2, 1, 1, '#241b4d');
    px(x - 3, y - 1, 7, 3, '#241b4d'); px(x - 2, y - 1, 5, 2, col); px(x, y, 1, 1, '#ffe08a');
    if (carry) { px(x - 1, y + 3, 3, 3, '#241b4d'); px(x, y + 4, 1, 1, carry); }
  }

  /* ---------------- scenery (pre-rendered strips) ---------------- */
  function strip(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const prev = g; g = c.getContext('2d'); draw(w, h); g = prev; return c; }

  const SCENES = {
    arcade: {
      ground: 75, leadX: 0.24, skyTop: '#191438',
      sky(W) {
        const bands = ['#191438', '#1e1842', '#26194d', '#331d58', '#4a2364', '#6a2a6e', '#8f3274', '#b84478'];
        const bh = Math.ceil(70 / bands.length);
        bands.forEach((c, i) => px(0, i * bh, W, bh, c));
        // dithered seams between bands
        for (let i = 1; i < bands.length; i++) for (let x = (i % 2); x < W; x += 2) px(x, i * bh - 1, 1, 1, bands[i]);
      },
      build(W) {
        const r = rng(7);
        this.stars = Array.from({ length: Math.round(W / 6) }, () => ({ x: Math.floor(r() * W), y: 24 + Math.floor(r() * 26), p: r() * 6 }));
        const far = strip(W * 2, LH, (w) => {
          let x = 0; const rr = rng(11);
          while (x < w) {
            const bw = 8 + Math.floor(rr() * 14), bh = 14 + Math.floor(rr() * 22);
            px(x, 70 - bh, bw, bh, '#2f2560');
            for (let wy = 70 - bh + 3; wy < 66; wy += 4) for (let wx = x + 2; wx < x + bw - 2; wx += 3) if (rr() > 0.62) px(wx, wy, 1, 2, rr() > 0.5 ? '#6a5aa8' : '#ffb68e');
            x += bw + 1;
          }
        });
        const near = strip(W * 2, LH, (w) => {
          let x = 0; const rr = rng(23);
          while (x < w) {
            const bw = 10 + Math.floor(rr() * 18), bh = 8 + Math.floor(rr() * 18);
            px(x, 70 - bh, bw, bh, '#1f1a45'); px(x, 70 - bh, bw, 1, '#3b3474');
            if (rr() > 0.7) { px(x + 2, 70 - bh - 4, 1, 4, '#3b3474'); px(x + 2, 70 - bh - 5, 1, 1, '#ff92b4'); }
            for (let wy = 70 - bh + 3; wy < 67; wy += 3) for (let wx = x + 2; wx < x + bw - 2; wx += 3) if (rr() > 0.55) px(wx, wy, 1, 1, rr() > 0.4 ? '#ffe08a' : '#82c8ff');
            x += bw + 2 + Math.floor(rr() * 4);
          }
        });
        this.layers = [{ c: far, speed: 0.12 }, { c: near, speed: 0.35 }];
      },
      backdrop(W, t, scroll) {
        this.sky(W);
        for (const s of this.stars) { const on = Math.sin(t / 700 + s.p) > -0.3; if (on) px(s.x, s.y, 1, 1, s.p > 4 ? '#ffe08a' : '#efeaff'); }
        // striped synthwave sun
        const cx = Math.round(W * 0.74), cy = 50, rad = 20;
        const cols = ['#ffe08a', '#ffd27a', '#ffc07f', '#ffab86', '#ff9a8e', '#ff8fa3'];
        for (let y = -rad; y <= 0; y++) {
          const half = Math.floor(Math.sqrt(rad * rad - y * y));
          const yy = cy + y;
          if (y > -9 && (y % 3 === 0 || (y > -5 && y % 2 === 0))) continue;
          px(cx - half, yy, half * 2, 1, cols[Math.min(cols.length - 1, Math.floor((y + rad) / rad * cols.length))]);
        }
        for (const L of this.layers) { const off = Math.floor(scroll * L.speed) % (L.c.width / 2); g.drawImage(L.c, -off, 0); g.drawImage(L.c, L.c.width / 2 - off, 0); }
      },
      foreground(W, t, scroll) {
        px(0, 70, W, LH - 70, '#211c4a'); px(0, 70, W, 1, '#b8a2ff'); px(0, 71, W, 1, '#6a5aa8');
        const off = Math.floor(scroll) % 16;
        for (let x = -off; x < W; x += 16) px(x, 77, 8, 1, '#4a428a');
        // reflections of the sun on the road
        for (let x = Math.round(W * 0.74) - 12; x < Math.round(W * 0.74) + 12; x += 3) px(x, 73 + (x % 2), 2, 1, '#ff8fa3');
      },
      gemShape(x, y, c) { px(x, y - 1, 1, 1, c); px(x - 1, y, 3, 1, c); px(x, y + 1, 1, 1, c); px(x, y, 1, 1, '#ffffff'); },
      obstacle(x, y) { px(x, y - 6, 6, 6, '#241b4d'); px(x + 1, y - 5, 4, 4, '#ff92b4'); px(x + 1, y - 5, 1, 1, '#ffe08a'); px(x + 3, y - 3, 2, 1, '#82c8ff'); },
      pickup(x, y, t) { const c = ['#7ee8c8', '#82c8ff', '#ffe08a', '#ff92b4'][Math.floor(t / 200) % 4]; this.gemShape(x, y, c); },
    },
    goodboy: { ground: 79, leadX: 0.24 }, // the cartoon park (below) draws everything
  };

  /* ---------------- the cartoon park (Good Boy Club) ----------------
     Hand-drawn art supplied by the owner, cut into sprites in /static/art.
     Drawn smooth at full resolution. Positions come from the same logical
     coordinates as the pixel worlds, so the game and helpers work the same. */
  const Park = {
    ready: false, img: {}, star: null,
    load(base) {
      const names = ['bg_sky', 'bg_hills', 'bg_fence', 'bg_path', 'w_front', 'w_stand', 'w_sit_ball', 'w_jump', 'w_sleep', 'w_walk1', 'w_walk2', 'w_walk3', 'w_walk4', 'd_star', 'd_sit',
        ...['pip', 'mochi', 'biscuit', 'pepper', 'luna', 'tofu'].flatMap(p => ['p_' + p + '_walk', 'p_' + p + '_stick'])];
      let left = names.length;
      const src = window.BR_ART || {};
      for (const n of names) {
        const im = new Image();
        im.onload = () => { if (--left === 0) this.ready = true; };
        im.onerror = () => { left = -1; }; // any missing file: show the Arcade city instead
        im.src = src[n] || (base + n + '.png');
        this.img[n] = im;
      }
    },
    sprite(c, im, cx, footY, h, o = {}) {
      if (!im || !im.width) return;
      const w = im.width / im.height * h;
      c.save();
      c.translate(cx, footY);
      if (o.rot) c.rotate(o.rot);
      c.scale((o.flip ? -1 : 1) * (o.sx || 1), o.sy || 1);
      if (o.alpha != null) c.globalAlpha = o.alpha;
      c.drawImage(im, -w / 2, -h, w, h);
      c.restore();
    },
    shadow(c, cx, footY, w) { c.fillStyle = 'rgba(58,42,63,.16)'; c.beginPath(); c.ellipse(cx, footY - 2, w / 2, w / 10, 0, 0, Math.PI * 2); c.fill(); },
    tile(c, im, y, h, off, Wd) {
      if (!im || !im.width) return;
      const w = Math.round(im.width / im.height * h);
      if (!(w >= 4)) return;
      let x = -((off % w) + w) % w;
      for (; x < Wd; x += w) c.drawImage(im, Math.floor(x), Math.round(y), w + 1, Math.round(h));
    },
    bone(c, x, y, s) {
      c.fillStyle = '#fff6ea'; c.strokeStyle = '#3a2a3f'; c.lineWidth = Math.max(1.5, s * 0.14);
      c.beginPath(); c.roundRect(x - s * 0.55, y - s * 0.16, s * 1.1, s * 0.32, s * 0.12);
      for (const [dx, dy] of [[-0.55, -0.15], [-0.55, 0.15], [0.55, -0.15], [0.55, 0.15]]) c.moveTo(x + dx * s + s * 0.17, y + dy * s), c.arc(x + dx * s, y + dy * s, s * 0.17, 0, Math.PI * 2);
      c.fill(); c.stroke();
    },
    heart(c, x, y, s, col) {
      c.fillStyle = col; c.beginPath(); c.moveTo(x, y + s * 0.35);
      c.bezierCurveTo(x - s * 0.6, y - s * 0.1, x - s * 0.3, y - s * 0.6, x, y - s * 0.25);
      c.bezierCurveTo(x + s * 0.3, y - s * 0.6, x + s * 0.6, y - s * 0.1, x, y + s * 0.35); c.fill();
    },
    ball(c, x, y, r) { c.fillStyle = '#d6f24a'; c.strokeStyle = '#3a2a3f'; c.lineWidth = Math.max(1.5, r * 0.18); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke(); c.strokeStyle = '#fffbe0'; c.lineWidth = r * 0.16; c.beginPath(); c.arc(x - r * 0.9, y, r * 0.8, -0.9, 0.9); c.stroke(); },
    puddle(c, x, y, w) { c.fillStyle = '#9fd4f7'; c.strokeStyle = '#3a2a3f'; c.lineWidth = Math.max(1.5, w * 0.04); c.beginPath(); c.ellipse(x, y, w / 2, w / 7, 0, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = '#ffffffaa'; c.beginPath(); c.ellipse(x - w * 0.15, y - w * 0.02, w * 0.12, w * 0.03, 0, 0, Math.PI * 2); c.fill(); },
    sparkle(c, x, y, s, a, col = '#fff8c8') { c.save(); c.globalAlpha = a; c.fillStyle = col; c.strokeStyle = '#3a2a3f55'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y - s); c.quadraticCurveTo(x, y, x + s, y); c.quadraticCurveTo(x, y, x, y + s); c.quadraticCurveTo(x, y, x - s, y); c.quadraticCurveTo(x, y, x, y - s); c.fill(); c.stroke(); c.restore(); },

    draw(W, dt, moving, gameOn) {
      const c = W.ctx, Wd = W.canvas.width, Hd = W.canvas.height, S = W.S, t = W.t, I = this.img;
      if (Wd < 20 || Hd < 20) return; // not laid out yet
      const Y = yl => Hd - (LH - yl) * S;            // logical y to device y
      const X = xl => xl * S;                         // logical x to device x
      const sc = SCENES.goodboy, foot = Y(sc.ground) + S * 2;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      // sky: cover the whole stage, very slow drift
      // The sky picture has clouds on the left and one sun on the right. Repeat the cloudy part
      // across the stage, then place the sun once, above the hills.
      const sky = I.bg_sky; {
        const sh = Hd * 0.72, k = sh / sky.height, c0 = sky.width * 0.105, cut = sky.width * 0.445 - c0;
        c.fillStyle = '#bfe6fb'; c.fillRect(0, 0, Wd, Hd);
        const tw = cut * k, drift = (t * 0.006) % tw;
        if (!(tw >= 4)) return;
        const first = Math.floor((t * 0.006) / tw); // which tile is leftmost, so mirroring does not flicker as it drifts
        for (let i = 0, x = -drift; x < Wd; x += tw, i++) {
          if ((first + i) % 2) { c.save(); c.translate(Math.round(x + tw), 0); c.scale(-1, 1); c.drawImage(sky, c0, 0, cut, sky.height, 0, 0, Math.ceil(tw) + 1, sh); c.restore(); }
          else c.drawImage(sky, c0, 0, cut, sky.height, Math.round(x), 0, Math.ceil(tw) + 1, sh);
        }
        const s0 = sky.width * 0.64, s1 = sky.width * 0.9;
        // Cut the sun out once, with its blue background made see-through, so clouds drift behind it.
        if (!Park.sun) {
          const cv = document.createElement('canvas'); cv.width = Math.round(s1 - s0); cv.height = sky.height;
          const cg = cv.getContext('2d'); cg.drawImage(sky, s0, 0, cv.width, cv.height, 0, 0, cv.width, cv.height);
          try {
            const d = cg.getImageData(0, 0, cv.width, cv.height), p = d.data, R = p[0], G2 = p[1], B = p[2];
            for (let i = 0; i < p.length; i += 4) { const dist = Math.abs(p[i] - R) + Math.abs(p[i + 1] - G2) + Math.abs(p[i + 2] - B); if (dist < 40) p[i + 3] = 0; else if (dist < 80) p[i + 3] = Math.round(255 * (dist - 40) / 40); }
            cg.putImageData(d, 0, 0);
          } catch { /* image from another origin: keep the plain crop */ }
          Park.sun = cv;
        }
        c.drawImage(Park.sun, Wd * 0.74, -sh * 0.12, (s1 - s0) * k, sh);
      }
      // Diesel's guardian star, softly glowing in the sky
      if (this.star) {
        const age = (Date.now() - this.star) / 1000, life = 9;
        if (age > life) this.star = null;
        else {
          const a = Math.min(1, age / 1.5, (life - age) / 2);
          // Diesel himself, floating in the sky with a warm golden glow
          const sh = Math.max(24, Hd * 0.115), cx = Wd * 0.56, cy = Hd * 0.08 + sh + Math.sin(t / 900) * Hd * 0.015;
          c.save(); c.globalAlpha = a * 0.85;
          const gr = c.createRadialGradient(cx, cy - sh * 0.5, sh * 0.1, cx, cy - sh * 0.5, sh * 0.85);
          gr.addColorStop(0, '#fffbe6'); gr.addColorStop(0.55, '#fff3c466'); gr.addColorStop(1, '#ffe08a00');
          c.fillStyle = gr; c.beginPath(); c.arc(cx, cy - sh * 0.5, sh * 0.85, 0, Math.PI * 2); c.fill(); c.restore();
          c.save(); c.shadowColor = '#fff1a8'; c.shadowBlur = Hd * 0.05; c.filter = 'brightness(1.35) saturate(0.75)'; this.sprite(c, I.d_sit, cx, cy, sh, { alpha: a * 0.78 }); c.restore();
          for (let i = 0; i < 8; i++) { const ang = i / 8 * Math.PI * 2 + t / 2600, tw = 0.5 + 0.5 * Math.sin(t / 260 + i * 1.7); this.sparkle(c, cx + Math.cos(ang) * sh * 0.62, cy - sh * 0.5 + Math.sin(ang) * sh * 0.52, Hd * (0.016 + 0.01 * tw), a * tw, '#ffc83d'); }
        }
      }
      const sp = W.scroll * S; // scroll in device px
      this.tile(c, I.bg_hills, Hd * 0.30, Hd * 0.55, sp * 0.15, Wd);
      this.tile(c, I.bg_fence, Hd * 0.60, Hd * 0.22, sp * 0.45, Wd);
      this.tile(c, I.bg_path, Hd * 0.76, Hd * 0.26, sp, Wd);

      // game things
      if (gameOn) {
        for (const o of W.game.obs) this.puddle(c, X(o.x + 4), foot - S, S * 11);
        for (const it of W.game.items) this.ball(c, X(it.x), Y(it.y) - S * 2, S * 2.6 + Math.sin(t / 200) * S * 0.2);
      }

      // the pack (helpers)
      const breedKey = b => ({ pip: 'pip', mochi: 'mochi', biscuit: 'biscuit', pepper: 'pepper', luna: 'luna', tofu: 'tofu' }[b] || 'tofu');
      const ph = Hd * 0.27;
      for (const hp of W.helpers.values()) {
        if (hp.phase === 'away' || hp.phase === 'gone') continue;
        const k = breedKey(hp.breed), x = X(hp.x);
        const bob = hp.phase === 'home' ? 0 : Math.abs(Math.sin(t / 110 + hp.x)) * Hd * 0.012;
        this.shadow(c, x, foot, ph * 1.0);
        if (hp.phase === 'out') this.sprite(c, I['p_' + k + '_walk'], x, foot - bob, ph);
        else if (hp.phase === 'back') this.sprite(c, I['p_' + k + '_stick'], x, foot - bob, ph, { flip: true });
        else this.sprite(c, I['p_' + k + '_stick'], x, foot, ph, { sy: 1 + Math.sin(t / 700 + hp.x) * 0.012 });
      }

      if (W.state === 'error' && !gameOn) { c.fillStyle = 'rgba(70,80,100,.18)'; c.fillRect(0, 0, Wd, Hd); }
      // Winston
      const lx = X(W.W * sc.leadX), wh = Hd * 0.43;
      const celebrating = Date.now() < W.moodUntil;
      const typingNow = Date.now() - W.typing < 1500;
      const st = W.state;
      let im = I.w_stand, o = {}, lift = 0, h = wh;
      if (gameOn) {
        const air = W.game.y < -0.5;
        im = air ? I.w_jump : I['w_walk' + (1 + Math.floor(t / 90) % 4)];
        lift = -W.game.y * S;
        if (W.game.over) { im = I.w_sleep; h = wh * 0.62; lift = 0; }
      } else if (st === 'sleep') { im = I.w_sleep; h = wh * 0.62; o.sy = 1 + Math.sin(t / 900) * 0.015; }
      else if (st === 'error') { im = I.w_front; h = wh * 0.95; o.rot = Math.sin(t / 500) * 0.02; }
      else if (celebrating && !reduced()) { im = I.w_jump; lift = Math.abs(Math.sin(t / 160)) * Hd * 0.09; o.flip = Math.floor(t / 260) % 2 === 1; }
      else if (st === 'wait') { im = I.w_sit_ball; h = wh * 0.98; o.rot = Math.sin(t / 140) * 0.035; lift = Math.floor(t / 1600) % 3 === 0 ? Math.abs(Math.sin(t / 130)) * Hd * 0.025 : 0; }
      else if (moving) { im = I['w_walk' + (1 + Math.floor(t / 140) % 4)]; lift = Math.abs(Math.sin(t / 140 * Math.PI / 2)) * Hd * 0.01; }
      else if (typingNow) { im = I.w_front; h = wh * 1.02; o.rot = -0.1; }
      else { o.sy = 1 + Math.sin(t / 700) * 0.012; o.sx = 1 - Math.sin(t / 700) * 0.006; }
      this.shadow(c, lx, foot, wh * (im === I.w_sleep ? 1.5 : 1.05) * (1 - Math.min(0.5, lift / Hd)));
      this.sprite(c, im, lx, foot - lift, h, o);
      if (st === 'sleep' && !gameOn) {
        c.fillStyle = '#3a2a3f'; c.font = `700 ${Math.round(Hd * 0.06)}px Fredoka, Nunito, sans-serif`;
        const k = Math.floor(t / 600) % 3; for (let i = 0; i <= k; i++) c.fillText('z', lx + wh * 0.5 + i * Hd * 0.04, foot - h * 0.9 - i * Hd * 0.05);
      }
      if (st === 'error' && !gameOn) {
        // a small grey rain cloud over his head
        const cy2 = foot - h - Hd * 0.1, r = Hd * 0.05;
        c.fillStyle = '#9aa3b5'; c.strokeStyle = '#3a2a3f'; c.lineWidth = Math.max(2, Hd * 0.008);
        c.beginPath(); c.arc(lx - r * 1.1, cy2, r * 0.8, Math.PI * 0.5, Math.PI * 1.5); c.arc(lx - r * 0.2, cy2 - r * 0.6, r, Math.PI, 0); c.arc(lx + r * 1.0, cy2 - r * 0.1, r * 0.75, Math.PI * 1.3, Math.PI * 0.5); c.closePath(); c.fill(); c.stroke();
        c.strokeStyle = '#5aa9e6'; c.lineWidth = Math.max(2, Hd * 0.01); c.lineCap = 'round';
        for (let i = 0; i < 4; i++) { const k = ((t / 6 + i * 23) % 60) / 60; const dx = lx - r * 1.2 + i * r * 0.8; const dy = cy2 + r * 0.9 + k * Hd * 0.12; c.globalAlpha = 1 - k; c.beginPath(); c.moveTo(dx, dy); c.lineTo(dx - Hd * 0.006, dy + Hd * 0.022); c.stroke(); }
        c.globalAlpha = 1;
      }

      // particles (treats, hearts, confetti) in logical units
      for (const p of W.particles) {
        p.x += p.vx * dt / 16; p.y += p.vy * dt / 16; p.vy += 0.06 * dt / 16; p.life -= dt / 16;
        if (p.kind === 'gem' && p.life < 40) { p.vx += 0.25; p.vy -= 0.2; }
        const x = X(p.x), y = Y(p.y);
        if (p.kind === 'gem') this.bone(c, x, y, Hd * 0.05);
        else if (p.kind === 'heart') this.heart(c, x, y, Hd * 0.05, p.c);
        else { c.fillStyle = p.c; c.save(); c.translate(x, y); c.rotate(p.life / 6); c.fillRect(-Hd * 0.01, -Hd * 0.005, Hd * 0.02, Hd * 0.01); c.restore(); }
      }
      W.particles = W.particles.filter(p => p.life > 0 && p.y < LH + 4 && p.x < W.W + 8);
    },
  };

  /* ---------------- the world ---------------- */
  const World = {
    canvas: null, ctx: null, low: null, W: 160, S: 3, skin: 'arcade', state: 'sleep',
    t: 0, last: 0, scroll: 0, frame: 0, idleSince: Date.now(), lastDraw: 0,
    helpers: new Map(), particles: [], typing: 0, mood: 'idle', moodUntil: 0, snortAt: 0, game: null,
    onGem: null, onScore: null, onGameOver: null,

    init(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      Park.load(window.BR_ART_BASE || '/static/art/');
      this.low = document.createElement('canvas');
      g = this.low.getContext('2d');
      new ResizeObserver(() => this.resize()).observe(canvas);
      this.resize();
      const loop = now => { this.tick(now); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    },
    setSkin(id) { if (!SCENES[id]) id = 'arcade'; this.skin = id; this.build(); },
    scene() { return this.skin === 'goodboy' && Park.ready ? SCENES.goodboy : SCENES.arcade; },
    // only the pixel city needs building; the cartoon park is drawn straight from the art
    build() { if (this.scene() === SCENES.arcade) SCENES.arcade.build(this.W); this.wake(); },
    resize() {
      const dpr = window.devicePixelRatio || 1;
      const cw = Math.max(1, this.canvas.clientWidth), ch = Math.max(1, this.canvas.clientHeight);
      this.S = Math.max(2, Math.round(ch * dpr / VIEW));
      this.W = Math.ceil(cw * dpr / this.S);
      this.H = Math.ceil(ch * dpr / this.S);
      this.canvas.width = Math.round(cw * dpr); this.canvas.height = Math.round(ch * dpr);
      this.low.width = this.W; this.low.height = this.H;
      g = this.low.getContext('2d');
      this.build();
    },
    wake() { this.idleSince = Date.now(); },

    setState(s) { if (s !== this.state) { this.state = s; this.wake(); if (s === 'done') this.celebrate(); } },
    setTyping() { this.typing = Date.now(); this.wake(); },
    // A tool was used: pop a gem / treat out of the lead.
    gem(color) {
      this.wake();
      const sc = this.scene(), lx = this.W * sc.leadX;
      this.particles.push({ kind: 'gem', x: lx, y: sc.ground - 22, vx: 0.5 + Math.random() * 0.6, vy: -1.6 - Math.random() * 0.6, c: color, life: 70 });
      if (this.game && this.game.on) this.game.items.push({ x: this.W + 4, y: sc.ground - 14 - Math.floor(Math.random() * 12) });
      if (this.onGem) this.onGem();
    },
    coins(n) { for (let i = 0; i < Math.min(n, 30); i++) this.gem(['#ffe08a', '#7ee8c8', '#ff92b4', '#82c8ff'][i % 4]); },
    celebrate() {
      const sc = this.scene(), lx = this.W * sc.leadX;
      const cols = this.skin === 'goodboy' ? ['#ff6b5e', '#ffd23f', '#5cbf7a', '#b8a2ff', '#ff92b4'] : ['#7ee8c8', '#82c8ff', '#ffe08a', '#ff92b4', '#b8a2ff'];
      if (reduced()) return;
      for (let i = 0; i < 46; i++) this.particles.push({ kind: this.skin === 'goodboy' && i % 4 === 0 ? 'heart' : 'confetti', x: lx + (Math.random() - 0.5) * 20, y: sc.ground - 26, vx: (Math.random() - 0.5) * 2.6, vy: -1.5 - Math.random() * 2.2, c: cols[i % cols.length], life: 90 + Math.random() * 40 });
      this.moodUntil = Date.now() + 1500;
    },
    // A helper (sub-agent) was sent out.
    drone(id, info = {}) {
      this.wake();
      const sc = this.scene();
      const idx = this.helpers.size;
      const breedKeys = Object.keys(BREEDS);
      const breed = info.breed && BREEDS[info.breed] ? info.breed : breedKeys[idx % breedKeys.length];
      this.helpers.set(id, { id, x: this.W * sc.leadX, y: sc.ground, phase: 'out', breed, col: ['#82c8ff', '#ff92b4', '#ffe08a', '#b8a2ff', '#7ee8c8'][idx % 5], frame: 0, born: Date.now() });
    },
    droneDone(id) { const h = this.helpers.get(id); if (h) { h.phase = 'back'; h.x = this.W + 12; h.carry = this.skin === 'goodboy' ? '#ff6b5e' : '#ffe08a'; this.wake(); } },
    clearHelpers() { this.helpers.clear(); },

    /* ---- mini-game: jump puddles / glitch blocks, catch balls / gems ---- */
    play(on) {
      if (on && !(this.game && this.game.on)) this.game = { on: true, y: 0, vy: 0, obs: [], items: [], score: 0, speed: 1.4, next: 60, over: false, paused: false };
      else if (!on && this.game) this.game.on = false;
      this.wake();
    },
    jump() {
      const G = this.game; if (!G || !G.on) return;
      if (G.over) { this.play(false); this.play(true); return; }
      if (G.paused) return;
      if (G.y === 0) G.vy = -3.3;
    },
    pauseGame(p) { if (this.game) this.game.paused = p; },
    stepGame() {
      const G = this.game; if (!G || !G.on || G.over || G.paused) return;
      const sc = this.scene(), lx = this.W * sc.leadX;
      G.vy += 0.2; G.y = Math.min(0, G.y + G.vy); if (G.y === 0) G.vy = 0;
      G.speed = Math.min(3.2, 1.4 + G.score / 400);
      if (--G.next <= 0) { G.obs.push({ x: this.W + 6 }); G.next = 50 + Math.floor(Math.random() * 70) - Math.min(30, G.score / 20); if (Math.random() > 0.4) G.items.push({ x: this.W + 30, y: sc.ground - 16 - Math.floor(Math.random() * 10) }); }
      for (const o of G.obs) o.x -= G.speed;
      for (const it of G.items) it.x -= G.speed;
      G.obs = G.obs.filter(o => o.x > -12); G.items = G.items.filter(i => i.x > -8 && !i.got);
      // collisions
      const top = sc.ground + G.y;
      for (const o of G.obs) if (Math.abs(o.x + 3 - lx) < 7 && top > sc.ground - 5) { G.over = true; if (this.onGameOver) this.onGameOver(Math.floor(G.score)); }
      for (const it of G.items) if (Math.abs(it.x - lx) < 7 && Math.abs(it.y - (top - 10)) < 9) { it.got = true; G.score += 25; this.particles.push({ kind: 'confetti', x: it.x, y: it.y, vx: 0, vy: -1, c: '#ffe08a', life: 30 }); }
      G.score += 0.25;
      if (this.onScore) this.onScore(Math.floor(G.score));
    },

    tick(now) {
      if (this.canvas && !this.canvas.offsetParent) return;
      const hidden = document.hidden;
      const idle = this.state !== 'run' && !(this.game && this.game.on) && Date.now() - this.idleSince > 60000;
      const minGap = hidden ? 1000 : idle ? 125 : 0; // 8fps when idle for a minute
      if (now - this.lastDraw < minGap) return;
      const dt = Math.min(50, now - (this.last || now)); this.last = now; this.lastDraw = now;
      this.t += dt;
      if (!g) return;
      const sc = this.scene();
      const gameOn = this.game && this.game.on;
      const moving = gameOn ? !this.game.over && !this.game.paused : this.state === 'run';
      const speed = gameOn ? (moving ? this.game.speed : 0) : moving ? 0.9 : 0;
      if (!reduced()) this.scroll += speed * dt / 16;
      if (moving) this.frame = Math.floor(this.t / (this.skin === 'goodboy' ? 160 : 110));
      if (gameOn) this.stepGame();

      if (this.skin === 'goodboy' && Park.ready) {
        this.moveHelpers(dt);
        Park.draw(this, dt, moving, gameOn);
        return;
      }

      const dy = this.H - LH;
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (dy > 0) px(0, 0, this.W, dy, sc.skyTop);
      g.setTransform(1, 0, 0, 1, 0, dy);
      sc.backdrop(this.W, this.t, this.scroll);
      sc.foreground(this.W, this.t, this.scroll);

      // game objects
      if (gameOn) {
        for (const o of this.game.obs) sc.obstacle(Math.round(o.x), sc.ground);
        for (const it of this.game.items) sc.pickup(Math.round(it.x), it.y, this.t);
      }

      // helpers
      const lx = Math.round(this.W * sc.leadX);
      this.moveHelpers(dt);
      for (const hp of this.helpers.values()) {
        if (hp.phase === 'away' || hp.phase === 'gone') continue;
        const mv = hp.phase !== 'home';
        { const fy = hp.phase === 'out' ? sc.ground - 30 - (hp.x - lx) * 0.25 : sc.ground - 34 + Math.sin(this.t / 300 + hp.x) * 2; drawDrone(Math.round(hp.x), Math.round(fy), hp.col, this.t, hp.phase === 'back' ? hp.carry : null); }
      }
      for (const [id, hp] of this.helpers) if (hp.phase === 'gone') this.helpers.delete(id);

      // the lead character
      const st = { t: this.t, frame: this.frame, moving, blink: Math.floor(this.t / 140) % 26 === 0 };
      const celebrating = Date.now() < this.moodUntil;
      const typingNow = Date.now() - this.typing < 1500;
      let jumpY = 0;
      if (gameOn) jumpY = Math.round(this.game.y);
      else if (celebrating && !reduced()) jumpY = -Math.round(Math.abs(Math.sin(this.t / 120)) * 5);
      {
        st.mood = this.state === 'wait' && !gameOn ? 'wait' : this.state === 'error' ? 'error' : celebrating ? 'done' : 'idle';
        st.hop = jumpY;
        st.bob = !moving && !gameOn && Math.floor(this.t / 900) % 2 ? 1 : 0;
        if (this.state === 'error' && !gameOn) { g.fillStyle = 'rgba(60,64,80,.35)'; g.fillRect(0, 0, this.W, LH); }
        drawBit(lx, sc.ground, st);
        if (this.state === 'sleep') this.zzz(lx + 9, sc.ground - 22);
        if (this.state === 'error' && !gameOn) {
          const sx = lx + 1, sy = sc.ground - 36 + (Math.floor(this.t / 400) % 2);
          px(sx - 1, sy - 1, 9, 11, '#191438'); px(sx, sy, 7, 9, '#ffd23f'); px(sx + 3, sy + 1, 1, 5, '#191438'); px(sx + 3, sy + 7, 1, 1, '#191438');
        }
      }

      // particles
      for (const p of this.particles) {
        p.x += p.vx * dt / 16; p.y += p.vy * dt / 16; p.vy += 0.06 * dt / 16; p.life -= dt / 16;
        if (p.kind === 'gem') { if (p.life < 40) { p.vx += 0.25; p.vy -= 0.2; } sc.gemShape(Math.round(p.x), Math.round(p.y), p.c); }
        else if (p.kind === 'heart') { const x = Math.round(p.x), y = Math.round(p.y); px(x, y, 1, 1, p.c); px(x + 2, y, 1, 1, p.c); px(x, y + 1, 3, 1, p.c); px(x + 1, y + 2, 1, 1, p.c); }
        else px(p.x, p.y, (p.life % 6 < 3) ? 2 : 1, 1, p.c);
      }
      this.particles = this.particles.filter(p => p.life > 0 && p.y < LH + 4 && p.x < this.W + 8);

      // scale up to the visible canvas with crisp pixels
      const c = this.ctx;
      c.imageSmoothingEnabled = false;
      c.clearRect(0, 0, this.canvas.width, this.canvas.height);
      g.setTransform(1, 0, 0, 1, 0, 0);
      // anchor the ground to the bottom edge; any spare pixels are sky at the top
      c.drawImage(this.low, 0, 0, this.W, this.H, 0, this.canvas.height - this.H * this.S, this.W * this.S, this.H * this.S);
    },
    // Helpers walk off to the right, come back from the right, then rest behind the lead.
    moveHelpers(dt) {
      const sc = this.scene(), lx = Math.round(this.W * sc.leadX);
      const gap = this.skin === 'goodboy' && Park.ready ? 22 : 14;
      let restSlot = 0;
      for (const hp of this.helpers.values()) {
        if (hp.phase === 'out') { hp.x += 1.4 * dt / 16; if (hp.x > this.W + 30) hp.phase = 'away'; }
        else if (hp.phase === 'back') { const target = lx + 30 + restSlot * gap; hp.x -= 1.2 * dt / 16; if (hp.x <= target) { hp.x = target; hp.phase = 'home'; hp.homeAt = Date.now(); } }
        if (hp.phase === 'home') { hp.x = lx + 30 + restSlot * gap; restSlot++; if (Date.now() - hp.homeAt > 25000) hp.phase = 'gone'; }
      }
      for (const [id, hp] of this.helpers) if (hp.phase === 'gone') this.helpers.delete(id);
    },
    // Diesel's guardian star (Good Boy Club only)
    dieselStar() { if (this.skin === 'goodboy' && Park.ready && !reduced()) Park.star = Date.now(); },
    zzz(x, y) {
      const k = Math.floor(this.t / 500) % 3;
      for (let i = 0; i <= k; i++) { const zx = x + i * 4, zy = y - i * 5; px(zx, zy, 3, 1, '#efeaff'); px(zx + 1, zy + 1, 1, 1, '#efeaff'); px(zx, zy + 2, 3, 1, '#efeaff'); }
    },
  };

  /* ---------------- little portraits for avatars and the logo ---------------- */
  function paintBot(canvas, blink) {
    canvas.width = 16; canvas.height = 16;
    const prev = g; g = canvas.getContext('2d'); g.clearRect(0, 0, 16, 16);
    const rows = BOT.slice(0, 15); if (blink) { rows[5] = BLINK; rows[6] = BLINK; }
    sprite(rows, 0, 1, BIT_PAL); g = prev;
  }
  window.ByteWorld = { World, paintBot, BREEDS };
})();
