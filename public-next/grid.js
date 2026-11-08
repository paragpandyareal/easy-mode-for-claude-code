/* =========================================================
   EASY MODE · grid
   A small dashboard layout: 12 columns, rows sized to the window.
   In Arrange mode, drag a block by its title bar and resize it from
   the corner (or use the arrow keys on its grip). Blocks never overlap:
   anything in the way slides down, and gaps close up afterwards.
   On a phone the blocks stack, and ↑ / ↓ buttons reorder them.
   ========================================================= */
(function () {
  'use strict';
  const COLS = 12, GAP = 12;

  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const same = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  const reading = (a, b) => a.y - b.y || a.x - b.x;

  // Put `moved` where it is and push everything that collides with it downwards.
  function resolve(items, moved) {
    const out = items.map(i => ({ ...i }));
    const fixed = [out.find(i => i.id === moved.id)];
    const rest = out.filter(i => i.id !== moved.id).sort(reading);
    for (const it of rest) {
      let guard = 0;
      while (fixed.some(f => overlaps(f, it)) && guard++ < 200) it.y = Math.max(...fixed.filter(f => overlaps(f, it)).map(f => f.y + f.h));
      fixed.push(it);
    }
    return out;
  }
  // Slide every block up as far as it can go, so no empty holes are left behind.
  function compact(items) {
    const out = items.map(i => ({ ...i })).sort(reading), done = [];
    for (const it of out) { while (it.y > 0 && !done.some(d => overlaps(d, { ...it, y: it.y - 1 }))) it.y--; done.push(it); }
    return out;
  }
  // First free spot for a new block of size w x h, scanning row by row.
  function freeSpot(items, w, h) {
    for (let y = 0; y < 200; y++) for (let x = 0; x + w <= COLS; x++) { const c = { x, y, w, h }; if (!items.some(i => overlaps(i, c))) return { x, y }; }
    return { x: 0, y: Math.max(0, ...items.map(i => i.y + i.h)) };
  }

  function create(container, { onChange, minSize = () => [2, 2], rowsPerScreen = 24 } = {}) {
    let items = [], editing = false;
    const els = new Map();
    const area = container.parentElement;
    const ghost = document.createElement('div'); ghost.className = 'cell-ghost hidden'; container.append(ghost);

    const metrics = () => {
      const W = container.clientWidth, cs = getComputedStyle(area);
      const H = (area.clientHeight || window.innerHeight) - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      return { colW: (W + GAP) / COLS, rowH: Math.max(16, (H + GAP) / rowsPerScreen) };
    };
    function place(el, it, m) {
      el.style.left = Math.round(it.x * m.colW) + 'px';
      el.style.top = Math.round(it.y * m.rowH) + 'px';
      el.style.width = Math.round(it.w * m.colW - GAP) + 'px';
      el.style.height = Math.round(it.h * m.rowH - GAP) + 'px';
    }
    const stacked = () => container.classList.contains('stacked');
    function layout() {
      // in the stacked (phone) view, reading order decides the order on screen
      [...items].sort(reading).forEach((it, i) => { const el = els.get(it.id); if (el) el.style.order = i; });
      if (stacked()) { container.style.height = ''; return; }
      const m = metrics();
      for (const it of items) { const el = els.get(it.id); if (el) place(el, it, m); }
      const bottom = Math.max(rowsPerScreen, ...items.map(i => i.y + i.h));
      container.style.height = Math.round(bottom * m.rowH - GAP) + 'px';
    }
    function commit(next, orig) {
      next = compact(next);
      const changed = next.some(n => { const o = orig.find(x => x.id === n.id); return !o || !same(o, n); });
      items = next; layout();
      if (changed && onChange) onChange(items.map(i => ({ ...i })));
    }
    // Move or resize one block by whole cells (keyboard and phone buttons use this).
    function nudge(id, dx, dy, dw, dh) {
      const me = items.find(i => i.id === id); if (!me) return;
      const [minW, minH] = minSize(id);
      const cand = { ...me, w: Math.max(minW, Math.min(COLS, me.w + dw)), h: Math.max(minH, me.h + dh) };
      cand.x = Math.max(0, Math.min(COLS - cand.w, me.x + dx)); cand.y = Math.max(0, me.y + dy);
      commit(resolve(items.map(i => i.id === id ? cand : i), cand), items);
    }
    // Swap places with the block before or after in reading order (phone ↑ / ↓).
    function step(id, dir) {
      const order = [...items].sort(reading), i = order.findIndex(x => x.id === id), j = i + dir;
      if (i < 0 || j < 0 || j >= order.length) return;
      const a = { ...order[i] }, b = { ...order[j] };
      const next = items.map(x => x.id === a.id ? { ...a, x: b.x, y: b.y } : x.id === b.id ? { ...b, x: a.x, y: a.y } : x);
      commit(resolve(next, { ...a, x: b.x, y: b.y }), items);
      const el = els.get(id); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function attach(it, el) {
      els.set(it.id, el);
      el.classList.add('cell');
      const grip = el.querySelector('.ph');
      const handle = document.createElement('div'); handle.className = 'cell-resize'; handle.title = 'Drag to resize'; el.append(handle);
      const bar = document.createElement('div'); bar.className = 'cell-grip'; bar.tabIndex = 0;
      bar.title = 'Drag to move. Or use the arrow keys, and Shift + arrows to resize.';
      bar.setAttribute('role', 'button'); bar.setAttribute('aria-label', 'Move ' + (el.dataset.label || 'block') + ' (arrow keys move, Shift + arrows resize)');
      bar.append(document.createTextNode('⠿ ' + (el.dataset.label || '')));
      const up = document.createElement('button'), down = document.createElement('button');
      up.type = down.type = 'button'; up.className = down.className = 'cell-step'; up.textContent = '↑'; down.textContent = '↓';
      up.title = 'Move up'; down.title = 'Move down';
      for (const [b, d] of [[up, -1], [down, 1]]) { b.addEventListener('pointerdown', e => e.stopPropagation()); b.addEventListener('click', e => { e.stopPropagation(); step(it.id, d); }); bar.append(b); }
      el.prepend(bar);
      bar.addEventListener('keydown', e => {
        if (!editing) return;
        const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!k) return;
        e.preventDefault();
        if (e.shiftKey) nudge(it.id, 0, 0, k[0], k[1]); else nudge(it.id, k[0], k[1], 0, 0);
        bar.focus();
      });
      const start = (e, mode) => {
        if (!editing || e.button !== 0 || stacked()) return;
        if (e.target.closest('button, select, input, textarea') && mode === 'move' && !e.target.closest('.cell-grip')) return;
        e.preventDefault();
        const m = metrics(), me = items.find(i => i.id === it.id), orig = { ...me }, before = items.map(i => ({ ...i }));
        const sx = e.clientX, sy = e.clientY, st0 = area.scrollTop;
        const [minW, minH] = minSize(it.id);
        el.classList.add('dragging'); ghost.classList.remove('hidden');
        let cand = { ...orig }, last = e, raf = 0;
        const apply = () => {
          const ev = last, scrolled = area.scrollTop - st0;
          const dx = (ev.clientX - sx) / m.colW, dy = (ev.clientY - sy + scrolled) / m.rowH;
          if (mode === 'move') {
            cand = { ...orig, x: Math.max(0, Math.min(COLS - orig.w, Math.round(orig.x + dx))), y: Math.max(0, Math.round(orig.y + dy)) };
            el.style.transform = `translate(${ev.clientX - sx}px, ${ev.clientY - sy + scrolled}px)`;
          } else {
            cand = { ...orig, w: Math.max(minW, Math.min(COLS - orig.x, Math.round(orig.w + dx))), h: Math.max(minH, Math.round(orig.h + dy)) };
            el.style.width = Math.round(orig.w * m.colW - GAP + (ev.clientX - sx)) + 'px';
            el.style.height = Math.round(orig.h * m.rowH - GAP + (ev.clientY - sy + scrolled)) + 'px';
          }
          place(ghost, cand, m);
          const preview = resolve(items.map(i => i.id === it.id ? cand : i), cand);
          for (const p of preview) if (p.id !== it.id) { const o = els.get(p.id); if (o) place(o, p, m); }
        };
        // keep scrolling while the pointer sits near the top or bottom edge
        const edge = () => {
          const r = area.getBoundingClientRect(), y = last.clientY;
          const v = y > r.bottom - 50 ? Math.min(24, (y - (r.bottom - 50)) / 2 + 4) : y < r.top + 50 ? -Math.min(24, (r.top + 50 - y) / 2 + 4) : 0;
          if (v) { area.scrollTop += v; apply(); }
          raf = requestAnimationFrame(edge);
        };
        raf = requestAnimationFrame(edge);
        const move = ev => { last = ev; apply(); };
        const done = () => {
          cancelAnimationFrame(raf);
          removeEventListener('pointermove', move); removeEventListener('pointerup', done);
          el.classList.remove('dragging'); el.style.transform = ''; ghost.classList.add('hidden');
          commit(resolve(items.map(i => i.id === it.id ? cand : i), cand), before);
        };
        addEventListener('pointermove', move); addEventListener('pointerup', done);
      };
      bar.addEventListener('pointerdown', e => start(e, 'move'));
      if (grip) grip.addEventListener('pointerdown', e => start(e, 'move'));
      handle.addEventListener('pointerdown', e => start(e, 'resize'));
    }

    new ResizeObserver(() => layout()).observe(area);
    addEventListener('resize', layout);

    return {
      set(list, elFor) {
        for (const el of els.values()) el.remove();
        els.clear();
        items = list.map(i => ({ ...i }));
        for (const it of items) { const el = elFor(it.id); if (el) { container.append(el); attach(it, el); } }
        items = items.filter(i => els.has(i.id));
        layout();
      },
      get: () => items.map(i => ({ ...i })),
      add(id, w, h, el) { const p = freeSpot(items, w, h); const it = { id, x: p.x, y: p.y, w, h }; items.push(it); container.append(el); attach(it, el); layout(); if (onChange) onChange(items.map(i => ({ ...i }))); },
      edit(on) { editing = on; container.classList.toggle('editing', on); },
      get editing() { return editing; },
      layout, compact: () => commit(items, items.map(i => ({ ...i, y: -1 }))),
    };
  }

  window.ByteGrid = { create };
})();
