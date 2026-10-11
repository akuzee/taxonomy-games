/*
 * The map: a fixed board shared by the Map view and the Race.
 *
 * Every major group is a tile with its own hue; its minor groups are listed
 * inside it; a minor group opens into a popover of its broad occupations.
 * Everything is alphabetical, in reading order: the first tile is top-left, the
 * next sits to its right, and the sequence wraps to the next row (an earlier
 * version flowed down CSS columns, which reads as unsorted across the top).
 * Arrow keys are plain directions: ↑/↓ within a column of tiles, ←/→ to the
 * nearest row in the neighboring column.
 *
 * The keyboard model is one pure function, step(), used both for live key
 * presses and by shortest(), so a race's par is exactly what the keys can do.
 */
(function () {
  const short = (t) => t.replace(/ Occupations$/, '');
  const TILE_REM = 13.5;
  const GAP_REM = 0.6;
  const KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape']);
  // Golden-angle hues: tiles adjacent in alphabetical order land far apart on the wheel.
  const hueAt = (i) => Math.round((i * 137.508 + 25) % 360);

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  function create(root, tax, { mode = 'map', onEvent = () => {} } = {}) {
    // Which layers make tiles / rows / popover / popover detail is the taxonomy's
    // call: O*NET tiles by subcategory so its 41 GWAs fit on one screen as rows.
    const v = Tax.view(tax, { levels: tax.boardLevels || tax.defaultLevels });
    const rows = [];           // minor groups in reading order
    const where = new Map();   // broad id → { row, k }
    let state = { row: 0, k: null };
    let rects = [];
    let sideCache = new Map();
    const tiles = [];          // { el, rows: row indices }
    let cols = 0;
    let colRows = [];          // per board column: row indices, top to bottom
    const colOf = [];          // row index → board column
    const marks = new Map();   // broad id → class
    let expanded = null;       // map mode: broad whose detailed occupations are shown
    let hits = null;           // map mode: search results, broad id → matching job titles

    const wrap = el('div', 'map-wrap');
    const board = el('div', 'map-board');
    const pop = el('div', 'map-pop');
    pop.hidden = true;
    wrap.append(board, pop);
    root.replaceChildren(wrap);

    v.children(v.root).forEach((major, i) => {
      const hue = hueAt(i);
      const tile = el('section', 'tile');
      tile.style.setProperty('--h', hue);
      const head = el('header', 'tile-head');
      head.append(el('span', 'code', major.code.replace(/-0000$/, '')), short(major.title));
      const list = el('ol', 'tile-rows');
      const mine = [];
      for (const minor of v.children(major)) {
        const b = el('button', 'mrow', short(minor.title));
        b.type = 'button';
        b.dataset.row = rows.length;
        const li = el('li');
        li.append(b);
        list.append(li);
        const broads = v.children(minor);
        broads.forEach((x, k) => where.set(x.id, { row: rows.length, k }));
        mine.push(rows.length);
        rows.push({ node: minor, major, hue, el: b, broads });
      }
      tile.append(head, list);
      tiles.push({ el: tile, rows: mine });
    });

    // Tile i goes in column i mod n, so the top row reads A, B, C… across and
    // each next tile sits under the one n places before it.
    function layout() {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const n = Math.max(1, Math.floor((wrap.clientWidth + GAP_REM * rem) / ((TILE_REM + GAP_REM) * rem)));
      if (n === cols) return;
      cols = n;
      board.style.setProperty('--cols', n);
      const columns = Array.from({ length: n }, () => el('div', 'map-col'));
      colRows = columns.map(() => []);
      tiles.forEach((t, i) => {
        columns[i % n].append(t.el);
        colRows[i % n].push(...t.rows);
        for (const r of t.rows) colOf[r] = i % n;
      });
      board.replaceChildren(...columns);
    }
    layout();

    // ---------- geometry ----------
    function measure() {
      layout();
      const base = wrap.getBoundingClientRect();
      rects = rows.map((r) => {
        const b = r.el.getBoundingClientRect();
        return { l: b.left - base.left, r: b.right - base.left, t: b.top - base.top,
          cx: (b.left + b.right) / 2 - base.left, cy: (b.top + b.bottom) / 2 - base.top };
      });
      sideCache = new Map();
      if (state.k !== null) placePop();
    }

    // The row in the neighboring column (dir -1 left, +1 right) nearest in height.
    function side(i, dir) {
      const key = i * 2 + (dir > 0);
      if (sideCache.has(key)) return sideCache.get(key);
      const c = colOf[i] + dir;
      let best = null;
      if (c >= 0 && c < cols) {
        for (const j of colRows[c]) {
          const dy = Math.abs(rects[j].cy - rects[i].cy);
          if (!best || dy < best[1]) best = [j, dy];
        }
      }
      const out = best ? best[0] : null;
      sideCache.set(key, out);
      return out;
    }

    // ---------- the keyboard model ----------
    // One keypress → the next state, or null if that key does nothing here.
    // Enter inside an open group is a pick, not a move, and is handled by key().
    function step(s, k) {
      const open = s.k !== null;
      switch (k) {
        case 'ArrowUp':
        case 'ArrowDown': {
          const d = k === 'ArrowDown' ? 1 : -1;
          if (open) {
            const n = s.k + d;
            return n >= 0 && n < rows[s.row].broads.length ? { row: s.row, k: n } : null;
          }
          const col = colRows[colOf[s.row]];
          const at = col.indexOf(s.row) + d;
          return at >= 0 && at < col.length ? { row: col[at], k: null } : null;
        }
        case 'ArrowLeft':
        case 'ArrowRight': {
          const j = side(s.row, k === 'ArrowRight' ? 1 : -1);
          if (j === null) return open ? { row: s.row, k: null } : null;
          return { row: j, k: null };
        }
        case 'Enter': return open ? null : { row: s.row, k: 0 };
        case 'Escape': return open ? { row: s.row, k: null } : null;
      }
      return null;
    }

    // The fewest keypresses from a state to picking a broad occupation, as the
    // key sequence itself (the final Enter included). Breadth-first over step().
    function route(from, broadId) {
      const goal = where.get(broadId);
      const id = (s) => `${s.row}:${s.k}`;
      const prev = new Map([[id(from), null]]);
      let frontier = [from];
      while (frontier.length) {
        const next = [];
        for (const s of frontier) {
          if (s.row === goal.row && s.k === goal.k) {
            const keys = ['Enter'];
            for (let p = prev.get(id(s)); p; p = prev.get(id(p.s))) keys.unshift(p.k);
            return keys;
          }
          for (const k of KEYS) {
            const t = step(s, k);
            if (t && !prev.has(id(t))) { prev.set(id(t), { s, k }); next.push(t); }
          }
        }
        frontier = next;
      }
      return null;
    }
    const shortest = (from, broadId) => route(from, broadId)?.length ?? Infinity;

    function key(e) {
      if (!KEYS.has(e.key)) return null;
      e.preventDefault();
      if (e.key === 'Enter' && state.k !== null) return pick(state.k);
      const next = step(state, e.key);
      if (!next) return { kind: 'none' };
      const kind = next.k !== null && state.k === null ? 'open' :
        next.k === null && state.k !== null && next.row === state.row ? 'close' : 'move';
      setState(next);
      return { kind, row: next.row, minor: rows[next.row].node };
    }

    function pick(k) {
      const b = rows[state.row].broads[k];
      if (mode === 'map') {
        expanded = expanded === b.id ? null : b.id;
        renderPop();
      }
      const ev = { kind: 'select', node: b, row: state.row };
      onEvent(ev);
      return ev;
    }

    // ---------- rendering ----------
    function setState(s) {
      const rowChanged = s.row !== state.row;
      const opened = s.k !== null && (state.k === null || rowChanged);
      rows[state.row].el.classList.remove('is-cursor');
      state = s;
      const r = rows[s.row];
      r.el.classList.add('is-cursor');
      if (s.k === null) {
        pop.hidden = true;
        r.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return;
      }
      if (opened || pop.hidden) { expanded = null; renderPop(); placePop(); }
      for (const b of pop.querySelectorAll('.brow')) b.classList.toggle('is-cursor', +b.dataset.k === s.k);
      pop.querySelector('.brow.is-cursor')?.scrollIntoView({ block: 'nearest' });
    }

    function renderPop() {
      const r = rows[state.row];
      pop.style.setProperty('--h', r.hue);
      const head = el('header', 'pop-head');
      head.append(el('span', 'pop-major', short(r.major.title)));
      const title = el('span', 'pop-title', r.node.title);
      if (mode === 'map') title.prepend(el('span', 'code', r.node.code + ' '));
      head.append(title);
      const list = el('ol', 'pop-rows');
      r.broads.forEach((b, k) => {
        const li = el('li');
        const btn = el('button', 'brow', b.title);
        btn.type = 'button';
        btn.dataset.k = k;
        if (k === state.k) btn.classList.add('is-cursor');
        if (marks.has(b.id)) btn.classList.add(marks.get(b.id));
        if (hits?.has(b.id)) btn.classList.add('is-hit');
        if (mode === 'map') {
          const n = v.children(b).length;
          if (n > 1) btn.append(el('span', 'n', String(n)));
        }
        li.append(btn);
        if (mode === 'map' && expanded === b.id) li.append(detail(b));
        list.append(li);
      });
      pop.replaceChildren(head, list);
      pop.hidden = false;
    }

    function detail(b) {
      const d = el('div', 'pop-detail');
      const kids = v.children(b);
      const occ = el('ul', 'pop-occ');
      for (const n of kids.length ? kids : [b]) {
        const li = el('li');
        li.append(el('span', 'code', n.code + ' '), n.title);
        occ.append(li);
      }
      d.append(occ);
      const found = hits?.get(b.id);
      if (found?.length) {
        const p = el('p', 'pop-terms');
        p.append(el('b', null, 'Matching job titles: '), found.slice(0, 12).join(', '));
        d.append(p);
      } else if (kids.length <= 1 && b.children.length <= 1) {
        const leaf = kids[0] || b;
        if (leaf.def) d.append(el('p', 'pop-terms', leaf.def.split(/(?<=\.)\s/)[0]));
      }
      return d;
    }

    function placePop() {
      const a = rects[state.row];
      if (!a) return;
      const w = pop.offsetWidth;
      const room = wrap.clientWidth;
      let left = a.r + 10;
      let top = a.t - 6;
      if (left + w > room) left = a.l - w - 10;
      if (left < 0) { left = Math.max(0, Math.min(a.l, room - w)); top = a.t + 28; }
      pop.style.left = left + 'px';
      pop.style.top = top + 'px';
    }

    // ---------- marks & search ----------
    function mark(id, cls) { marks.set(id, cls); if (state.k !== null) renderPop(); }
    function clearMarks() { marks.clear(); }
    function flash(id) {
      const b = pop.querySelector(`.brow[data-k="${where.get(id)?.k}"]`);
      if (!b) return;
      b.classList.remove('is-flash');
      void b.offsetWidth;
      b.classList.add('is-flash');
    }

    // Map mode: every query word must appear in a broad occupation's title, one
    // of its children, or one of the terms (job titles, index entries) filed under it.
    const haystacks = new Map();
    function hay(b) {
      if (!haystacks.has(b.id)) {
        const terms = [];
        (function walk(n) { terms.push(...(tax.termsByNode.get(n.id) || []).map((t) => t.text)); n.children.forEach(walk); })(b);
        const titles = [b.title, ...v.children(b).map((n) => n.title)];
        haystacks.set(b.id, { titles: titles.join(' | ').toLowerCase(), terms });
      }
      return haystacks.get(b.id);
    }
    function search(query) {
      const words = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
      hits = words.length ? new Map() : null;
      let groups = 0;
      rows.forEach((r) => {
        let n = 0;
        if (hits) {
          for (const b of r.broads) {
            const h = hay(b);
            const terms = h.terms.filter((t) => words.every((w) => t.toLowerCase().includes(w)));
            if (terms.length || words.every((w) => h.titles.includes(w))) { hits.set(b.id, terms); n++; }
          }
        }
        r.el.classList.toggle('has-hits', n > 0);
        r.el.dataset.hits = n || '';
        if (n) groups++;
      });
      board.classList.toggle('is-searching', !!hits);
      if (state.k !== null) renderPop();
      return { broads: hits ? hits.size : 0, groups };
    }

    // ---------- mouse (map mode only: a race is scored in keypresses) ----------
    if (mode === 'map') {
      board.addEventListener('click', (e) => {
        const b = e.target.closest('.mrow');
        if (!b) return;
        const row = +b.dataset.row;
        if (state.k !== null && state.row === row) setState({ row, k: null });
        else { setState({ row, k: 0 }); onEvent({ kind: 'open', row, minor: rows[row].node }); }
      });
      pop.addEventListener('click', (e) => {
        const b = e.target.closest('.brow');
        if (!b) return;
        state = { row: state.row, k: +b.dataset.k };
        pick(state.k);
      });
    }

    const onResize = () => requestAnimationFrame(measure);
    window.addEventListener('resize', onResize);
    document.fonts?.ready.then(measure);

    return {
      key, measure, step, route, shortest, search, mark, clearMarks, flash,
      get state() { return state; },
      setState(s) { setState(s); },
      stateOf: (broadId) => ({ ...where.get(broadId) }),
      broads: () => rows.flatMap((r) => r.broads),
      // The layer that opens in the popover (broad occupations, industry groups, IWAs).
      popLevel: v.levelInfo(rows[0].broads[0].level),
      rowLevel: v.levelInfo(rows[0].node.level),
      rowOf: (broadId) => where.get(broadId).row,
      pathOf(broadId) {
        const r = rows[where.get(broadId).row];
        return { major: r.major, minor: r.node, hue: r.hue };
      },
      destroy() { window.removeEventListener('resize', onResize); root.replaceChildren(); },
    };
  }

  window.Board = { create, short };
})();
