/*
 * Write-in: name every node, one layer at a time, top down.
 *
 * Each round is one layer of the view. The layers above it are already on the
 * board (named or revealed), so every blank sits under its parent with its code
 * and its siblings visible. Nodes that carry no information are filled in for
 * free: the only child of a parent (Paralegals [broad] → Paralegals [detailed])
 * and catch-alls ("Engineers, All Other").
 */
(function () {
  const POINTS = { named: 1, hinted: 0.7, missed: 0 };
  const $ = (id) => document.getElementById(id);
  let el, cfg, v, rounds, ri, state, hinted, asked, roundDone, tallies, startedAt, timerId;

  function bind() {
    if (el) return;
    el = {
      board: $('wi-board'), input: $('wi-input'), feedback: $('wi-feedback'), ask: $('wi-ask'),
      advance: $('btn-wi-advance'), progress: $('stat-progress'), progressLabel: $('stat-progress-label'),
      score: $('stat-score'), timer: $('stat-timer'), title: $('quiz-title'), subtitle: $('quiz-subtitle'),
    };
    el.input.addEventListener('input', onInput);
    el.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onEnter(); }
    });
    el.advance.addEventListener('click', () => { if (v) advance(); });
    el.board.addEventListener('click', (e) => {
      const btn = e.target.closest('.hint-btn');
      if (!btn || !v) return;
      const id = btn.closest('.slot').dataset.id;
      hinted.add(id);
      paint(id);
      el.input.focus();
    });
  }

  const levelName = (l, n = 1) => Tax.lower(n === 1 ? v.levelInfo(l).name : v.levelInfo(l).plural);
  const isFree = (n) => v.passThrough(v.parent(n) || v.root) || v.tax.isCatchAll(n);
  const span = (cls, text) => {
    const s = document.createElement('span');
    s.className = cls;
    if (text != null) s.textContent = text;
    return s;
  };

  function start(config, view) {
    bind();
    cfg = config;
    v = view;
    rounds = v.levels.slice();
    state = new Map();
    hinted = new Set();
    tallies = [];
    ri = 0;
    $('stat-score-label').textContent = 'Score';
    el.title.textContent = cfg.title || 'Write-in';
    startedAt = Date.now();
    clearInterval(timerId);
    timerId = setInterval(() => { el.timer.textContent = App.fmtTime(Date.now() - startedAt); }, 500);
    el.timer.textContent = '00:00';
    beginRound();
  }

  function beginRound() {
    const level = rounds[ri];
    roundDone = false;
    asked = [];
    for (const n of v.atLevel(level)) {
      const free = isFree(n);
      state.set(n.id, free ? 'free' : 'blank');
      if (!free) asked.push(n);
    }
    const plural = v.levelInfo(level).plural;
    el.subtitle.textContent = `Layer ${ri + 1} of ${rounds.length} · ${plural[0].toUpperCase()}${plural.slice(1)}`;
    el.ask.textContent = `Name the ${asked.length} ${levelName(level, asked.length)}`;
    el.advance.textContent = 'Reveal the rest';
    el.input.disabled = false;
    el.input.value = '';
    el.input.placeholder = 'Type a name or code, then Enter';
    const free = v.atLevel(level).length - asked.length;
    feedback(free ? `${free} more are filled in for you (only children and catch-alls).` : '');
    render();
    updateHud();
    el.input.focus();
    if (!asked.length) finishRound();
  }

  function render() {
    const level = rounds[ri];
    const top = v.children(v.root);
    const kids = document.createElement('div');
    kids.className = 'wi-kids' + (top[0]?.level === level ? ' flat-grid' : '');
    for (const n of top) kids.append(nodeEl(n, 1, level));
    const legend = document.createElement('div');
    legend.className = 'wi-legend';
    for (const [cls, text] of [['r-0', 'named'], ['r-1', 'named with a hint'], ['r-missed', 'revealed'], ['r-free', 'filled in for you']]) {
      const s = span('');
      s.append(span('mark ' + cls), text);
      legend.append(s);
    }
    el.board.replaceChildren(legend, kids);
  }

  function nodeEl(n, depth, level) {
    const wrap = document.createElement('div');
    wrap.className = `wi-node d${depth}`;
    wrap.style.setProperty('--lvl', `var(--lvl-${Math.min(n.level, 5)})`);
    if (n.level === level) {
      const s = document.createElement('div');
      s.dataset.id = n.id;
      wrap.append(s);
      paint(n.id, s);
      return wrap;
    }
    const head = document.createElement('div');
    head.className = 'wi-head';
    if (cfg.codes !== false && n.code) head.append(span('code', n.code));
    head.append(span('t', n.title), span('mark ' + resultClass(n.id)));
    const kids = document.createElement('div');
    kids.className = 'wi-kids';
    for (const c of v.children(n)) kids.append(nodeEl(c, depth + 1, level));
    wrap.append(head, kids);
    return wrap;
  }

  function resultClass(id) {
    const st = state.get(id);
    if (st === 'named') return hinted.has(id) ? 'r-1' : 'r-0';
    return st === 'missed' ? 'r-missed' : 'r-free';
  }

  function hintText(n) {
    if (n.def) {
      const first = n.def.split(/(?<=\.)\s/)[0];
      return first.length > 160 ? first.slice(0, 157) + '…' : first;
    }
    return 'Includes ' + Tax.examples(v.tax, n, 2).map((m) => m.title).join('; ');
  }

  function paint(id, s = el.board.querySelector(`.slot[data-id="${CSS.escape(id)}"]`)) {
    if (!s) return;
    const n = v.tax.byId.get(id);
    const st = state.get(id);
    const h = hinted.has(id);
    const cls = { blank: 'is-blank', missed: 'is-missed', free: 'is-free', named: h ? 'is-named-1' : 'is-named-0' }[st];
    s.className = `slot ${cls}${h ? ' is-hinted' : ''}`;
    s.replaceChildren();
    if (cfg.codes !== false && n.code) s.append(span('code', n.code));
    const fill = span('fill', st === 'blank' ? null : n.title);
    if (st === 'blank' && h) fill.append(span('hint', hintText(n)));
    s.append(fill);
    if (st === 'blank' && !h) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hint-btn';
      b.textContent = '?';
      b.title = 'Hint (counts as yellow)';
      b.setAttribute('aria-label', `Hint for ${n.code || 'this blank'}`);
      s.append(b);
    }
  }

  // Every raw layer under the scope, for wrong-layer feedback. Built once per game.
  let layerCache = null;
  function rawLayers() {
    if (layerCache?.v === v) return layerCache.layers;
    const layers = new Map();
    (function walk(n) {
      for (const c of n.children) {
        if (!v.tax.isCatchAll(c)) {
          if (!layers.has(c.level)) layers.set(c.level, []);
          layers.get(c.level).push(c);
        }
        walk(c);
      }
    })(v.root);
    layerCache = { v, layers };
    return layers;
  }
  const article = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a');

  // Every node at the round's layer, minus catch-alls already filled in:
  // otherwise "physicians" would land on "Physicians, All Other".
  const candidates = () => v.atLevel(rounds[ri])
    .filter((n) => !(state.get(n.id) === 'free' && v.tax.isCatchAll(n)));

  // Typing a full title or full code accepts at once; anything looser waits for
  // Enter. The comparison is literal: a singularizing one would accept
  // "…Law Clerk" one keystroke early and leave the "s" behind as a new guess.
  const plain = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  function onInput() {
    if (!v || roundDone) return;
    const g = el.input.value;
    if (!g.trim()) return;
    const typed = plain(g);
    let hit = candidates().find((n) => state.get(n.id) === 'blank' && plain(n.title) === typed);
    // A code accepts at once only when typed in full; "23" could be the start of "23-2011".
    if (!hit && Match.isCode(g)) hit = candidates().find((n) => Match.sameCode(g, n.code));
    if (hit && state.get(hit.id) === 'blank') accept(hit);
  }

  function onEnter() {
    if (!v) return;
    if (roundDone) return advance();
    const g = el.input.value.trim();
    if (!g) return;
    const level = rounds[ri];
    const r = Match.match(g, candidates());
    if (r.node) {
      if (state.get(r.node.id) === 'blank') return accept(r.node);
      return feedback(`Already on the board: ${r.node.title}`, 'bad');
    }
    if (r.ambiguous) {
      return feedback(`“${g}” fits ${r.ambiguous.length} ${levelName(level, 2)}. Add a word.`, 'bad');
    }
    // Naming something at the wrong layer is the most useful miss to explain,
    // including layers this game skips or doesn't reach.
    // Titles can repeat across layers (Farming… is an intermediate *and* a major
    // group), so report a layer this game asks for first, else the most specific.
    const order = [...rawLayers()].sort(([a], [b]) =>
      (v.levels.includes(b) - v.levels.includes(a)) || (v.levels.includes(a) ? a - b : b - a));
    for (const [l, nodes] of order) {
      if (l === level) continue;
      const o = Match.match(g, nodes);
      if (!o.node) continue;
      const which = l < level && v.has(o.node.id) ? ` (${o.node.title})` : '';
      const note = v.levels.includes(l) ? `, not a ${levelName(level)}` : `, a layer this game doesn't ask for`;
      return feedback(`“${g}” is ${article(levelName(l))} ${levelName(l)}${which}${note}.`, 'bad');
    }
    feedback(`No ${levelName(level)} matches “${g}”.`, 'bad');
  }

  function accept(n) {
    state.set(n.id, 'named');
    paint(n.id);
    const s = el.board.querySelector(`.slot[data-id="${CSS.escape(n.id)}"]`);
    s.classList.add('flash');
    s.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    el.input.value = '';
    feedback(`✓ ${n.title}`, 'good');
    updateHud();
    if (asked.every((m) => state.get(m.id) !== 'blank')) {
      finishRound();
      feedback(`All ${asked.length} named. Press Enter to continue.`, 'good');
    }
  }

  function advance() {
    if (!roundDone) {
      for (const n of asked) if (state.get(n.id) === 'blank') { state.set(n.id, 'missed'); paint(n.id); }
      finishRound();
      feedback('Revealed. Press Enter to continue.');
      el.input.focus();
      return;
    }
    if (ri + 1 >= rounds.length) return finish();
    ri++;
    beginRound();
  }

  function finishRound() {
    roundDone = true;
    const tally = { level: rounds[ri], total: asked.length, named: 0, hinted: 0, missed: 0 };
    for (const n of asked) {
      const st = state.get(n.id);
      if (st === 'missed') tally.missed++;
      else if (hinted.has(n.id)) tally.hinted++;
      else tally.named++;
    }
    tallies[ri] = tally;
    el.input.value = '';
    el.input.placeholder = 'Press Enter to continue';
    el.advance.textContent = ri + 1 >= rounds.length ? 'See results' : `Next: ${levelName(rounds[ri + 1], 2)}`;
    updateHud();
  }

  function points() {
    let pts = 0, n = 0;
    const done = tallies.filter(Boolean);
    for (const t of done) { pts += t.named * POINTS.named + t.hinted * POINTS.hinted; n += t.total; }
    if (!roundDone) {
      for (const m of asked) {
        if (state.get(m.id) !== 'named') continue;
        pts += hinted.has(m.id) ? POINTS.hinted : POINTS.named;
        n++;
      }
    }
    return n ? Math.round((pts / n) * 100) : 100;
  }

  function updateHud() {
    const named = asked.filter((n) => state.get(n.id) === 'named').length;
    el.progressLabel.textContent = 'Named';
    el.progress.textContent = `${named} / ${asked.length}`;
    el.score.textContent = points() + '%';
  }

  function feedback(text, kind) {
    el.feedback.textContent = text;
    el.feedback.className = 'feedback' + (kind ? ` is-${kind}` : '');
  }

  function finish() {
    clearInterval(timerId);
    const rows = tallies.filter(Boolean);
    const total = rows.reduce((a, t) => a + t.total, 0);
    const named = rows.reduce((a, t) => a + t.named + t.hinted, 0);
    const hints = rows.reduce((a, t) => a + t.hinted, 0);
    const table = document.createElement('table');
    table.className = 'level-table';
    for (const t of rows) {
      const tr = table.insertRow();
      const name = v.levelInfo(t.level).plural;
      tr.insertCell().textContent = name[0].toUpperCase() + name.slice(1);
      tr.insertCell().textContent = `${t.named + t.hinted} / ${t.total}` + (t.hinted ? ` (${t.hinted} hinted)` : '');
    }
    App.showEnd({
      title: cfg.title || 'Write-in',
      score: points(),
      breakdown: `${named} of ${total} named` + (hints ? ` · ${hints} with hints` : ''),
      time: App.fmtTime(Date.now() - startedAt),
      table,
      restart: () => start(cfg, v),
    });
  }

  window.WriteIn = {
    start,
    stop() {
      clearInterval(timerId);
      v = null;
      if (el) el.board.replaceChildren();
    },
  };
})();
