/*
 * Race: get from one broad occupation to another on the map, by keyboard.
 *
 * Three numbers per race, because "fewest steps" and "fastest" reward different
 * things: moves against par (the fewest keypresses the board allows, from
 * Board.shortest), wrong groups opened (peeking into a minor group that doesn't
 * hold the target), and time. The score folds them together golf-style:
 * time + 1 s per move over par + 5 s per wrong group opened. Lower is better.
 */
(function () {
  const MOVE_S = 1;
  const OPEN_S = 5;
  const $ = (id) => document.getElementById(id);
  let el, cfg, tax, board, races, idx, cur, results, timerId;

  function bind() {
    if (el) return;
    el = {
      board: $('race-board'), card: $('race-card'), target: $('race-target'), from: $('race-from'),
      progress: $('stat-progress'), progressLabel: $('stat-progress-label'),
      score: $('stat-score'), scoreLabel: $('stat-score-label'), timer: $('stat-timer'),
      title: $('quiz-title'), subtitle: $('quiz-subtitle'),
    };
  }

  const node = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const secs = (s) => s.toFixed(1) + ' s';

  // Start and target always sit in different minor groups, and usually in
  // different major groups, so every race is a real trip across the map.
  function pickRaces(n) {
    const pool = board.broads().filter((b) => !tax.isCatchAll(b));
    const out = [];
    for (let guard = 0; out.length < n && guard < 5000; guard++) {
      const a = pool[Math.floor(Math.random() * pool.length)];
      const b = pool[Math.floor(Math.random() * pool.length)];
      if (board.rowOf(a.id) === board.rowOf(b.id)) continue;
      const sameMajor = board.pathOf(a.id).major === board.pathOf(b.id).major;
      if (sameMajor && Math.random() < 0.7) continue;
      if (out.some((r) => r.b === b)) continue;
      out.push({ a, b });
    }
    return out;
  }

  function start(config, view, list) {
    bind();
    cfg = config;
    tax = view.tax;
    board?.destroy();
    board = Board.create(el.board, tax, { mode: 'race' });
    races = list || pickRaces(cfg.count || 10);
    results = [];
    idx = 0;
    el.title.textContent = cfg.title || 'Race';
    el.subtitle.textContent = 'Arrow keys + Enter';
    el.progressLabel.textContent = 'Race';
    el.scoreLabel.textContent = 'Moves';
    document.removeEventListener('keydown', onKey);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => { board.measure(); begin(); });
  }

  function begin() {
    const { a, b } = races[idx];
    board.clearMarks();
    board.mark(a.id, 'is-start');
    const from = board.stateOf(a.id);
    board.setState(from);
    cur = { moves: 0, wrong: 0, started: null, done: false, par: board.shortest(from, b.id) };
    el.target.textContent = b.title;
    el.from.textContent = `from ${a.title}`;
    el.card.hidden = true;
    clearInterval(timerId);
    el.timer.textContent = '0.0 s';
    updateHud();
  }

  function onKey(e) {
    if (!board || e.target.closest?.('input, select, textarea') || !$('end-panel').hidden) return;
    if (cur.done) {
      if (e.key === 'Enter') { e.preventDefault(); next(); }
      return;
    }
    const ev = board.key(e);
    if (!ev || ev.kind === 'none') return;
    if (cur.started === null) {
      // The clock starts on the first key, so reading the target is free.
      cur.started = performance.now();
      timerId = setInterval(() => { el.timer.textContent = secs((performance.now() - cur.started) / 1000); }, 100);
    }
    cur.moves++;
    const target = races[idx].b;
    if (ev.kind === 'open' && ev.row !== board.rowOf(target.id)) cur.wrong++;
    if (ev.kind === 'select') {
      if (ev.node === target) return finish();
      board.flash(ev.node.id);
    }
    updateHud();
  }

  function finish() {
    clearInterval(timerId);
    const { a, b } = races[idx];
    const time = (performance.now() - cur.started) / 1000;
    const extra = Math.max(0, cur.moves - cur.par);
    const score = time + extra * MOVE_S + cur.wrong * OPEN_S;
    cur.done = true;
    results[idx] = { a, b, time, moves: cur.moves, par: cur.par, wrong: cur.wrong, score };
    board.mark(b.id, 'is-found');
    el.timer.textContent = secs(time);
    updateHud();

    const p = board.pathOf(b.id);
    el.card.style.setProperty('--h', p.hue);
    const big = node('div', 'race-score', secs(score));
    const parts = node('p', 'race-parts',
      `${secs(time)} · ${cur.moves} moves (par ${cur.par})` +
      (cur.wrong ? ` · ${cur.wrong} wrong ${cur.wrong === 1 ? 'group' : 'groups'} opened` : ''));
    const path = node('p', 'race-path');
    path.append(node('span', 'code', p.major.code + ' '), Board.short(p.major.title), ' › ',
      node('span', 'code', p.minor.code + ' '), p.minor.title, ' › ', node('b', null, b.title));
    const btn = node('button', 'primary-btn', idx + 1 < races.length ? 'Next race' : 'See results');
    btn.type = 'button';
    btn.append(node('span', 'kbd', '↵'));
    btn.addEventListener('click', next);
    const verdict = node('p', 'race-verdict', extra === 0 && !cur.wrong ? 'Par, no wrong turns' : 'Arrived');
    el.card.replaceChildren(verdict, big, parts, path, btn);
    el.card.hidden = false;
  }

  function next() {
    idx++;
    if (idx >= races.length) return end();
    begin();
  }

  function updateHud() {
    el.progress.textContent = `${Math.min(idx + 1, races.length)} / ${races.length}`;
    el.score.textContent = `${cur.moves} · par ${cur.par}`;
  }

  function end() {
    el.card.hidden = true;
    const total = results.reduce((s, r) => s + r.score, 0);
    const time = results.reduce((s, r) => s + r.time, 0);
    const moves = results.reduce((s, r) => s + r.moves, 0);
    const par = results.reduce((s, r) => s + r.par, 0);
    const wrong = results.reduce((s, r) => s + r.wrong, 0);
    const table = document.createElement('table');
    table.className = 'level-table';
    for (const r of results) {
      const tr = table.insertRow();
      tr.insertCell().textContent = '→ ' + r.b.title;
      tr.insertCell().textContent = `${secs(r.score)} · ${r.moves}/${r.par}` + (r.wrong ? ` · ${r.wrong}✕` : '');
    }
    const rough = results.filter((r) => r.moves > r.par || r.wrong);
    App.showEnd({
      title: cfg.title || 'Race',
      score: secs(total),
      breakdown: `${moves} moves against a par of ${par} · ${wrong} wrong ${wrong === 1 ? 'group' : 'groups'} opened · ` +
        `score is time + ${MOVE_S} s per extra move + ${OPEN_S} s per wrong group`,
      time: secs(time),
      table,
      retry: rough.length ? {
        label: `Rerun the ${rough.length} over par`,
        run: () => start(cfg, { tax }, rough.map((r) => ({ a: r.a, b: r.b }))),
      } : null,
      restart: () => start(cfg, { tax }),
    });
  }

  window.Race = {
    start,
    // For tools/ and headless tests: the live board and the current race.
    current: () => (board ? { board, race: races[idx], cur } : null),
    stop() {
      clearInterval(timerId);
      document.removeEventListener('keydown', onKey);
      board?.destroy();
      board = null;
      if (el) el.card.hidden = true;
    },
  };
})();
