/*
 * File it: given a term, pick its branch at every layer of the view.
 *
 * Each layer is one step, scored like a map-games prompt: three tries, then the
 * answer is revealed and must be clicked to go on. A wrong pick opens a peek at
 * what that branch actually holds, so a miss still teaches the map. Steps with
 * only one possible child are filled in automatically and not scored.
 *
 * When group names are in the pool, every column after the first also offers
 * "it names the group itself": the player has to judge the layer, not just the
 * branch.
 */
(function () {
  const MAX = 3;
  const POINTS = [1, 0.7, 0.4, 0];
  const STOP = '__stop';
  const $ = (id) => document.getElementById(id);
  let el, cfg, v, prompts, idx, steps, si, attempts, results, stopOffered, startedAt, timerId;

  function bind() {
    if (el) return;
    el = {
      board: $('pi-board'), term: $('pi-term'), tries: $('tries-left'),
      progress: $('stat-progress'), progressLabel: $('stat-progress-label'),
      score: $('stat-score'), timer: $('stat-timer'), title: $('quiz-title'), subtitle: $('quiz-subtitle'),
    };
    el.board.addEventListener('click', (e) => {
      const btn = e.target.closest('.pi-col.is-active .pi-item');
      if (btn && v) pick(btn);
    });
  }

  const node = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const levelName = (l, plural) => (plural ? v.levelInfo(l).plural : v.levelInfo(l).name);
  const firstSentence = (s, max = 150) => {
    const f = s.split(/(?<=\.)\s/)[0];
    return f.length > max ? f.slice(0, max - 1) + '…' : f;
  };

  function start(config, view, list) {
    bind();
    cfg = config;
    v = view;
    const kinds = cfg.pool || v.tax.defaultPool || ['titles', 'groups'];
    if (!list) {
      const pool = Tax.promptPool(v, { kinds, skip: cfg.skip ?? v.tax.skipTermsByDefault ?? [] });
      if (!pool.length) throw new Error('Nothing to file with these settings. Add a kind of term or widen the scope.');
      // "Stop here" is offered whenever any answer in the pool is a group — group
      // names, or terms filed on a group (APQC metrics). Decided from the pool, not
      // the sample, so its absence never hints that every answer is a leaf.
      // A retry (list given) keeps the original game's setting.
      stopOffered = kinds.includes('groups') || pool.some((p) => !v.isLeaf(p.target));
      list = Tax.samplePrompts(pool, cfg.count ?? 15);
    }
    prompts = list;
    results = [];
    idx = 0;
    $('stat-score-label').textContent = 'Score';
    el.title.textContent = cfg.title || 'File it';
    el.subtitle.textContent = v.root.id ? `${v.root.code} ${v.root.title}` : `All of ${v.tax.name}`;
    el.progressLabel.textContent = 'Term';
    startedAt = Date.now();
    clearInterval(timerId);
    timerId = setInterval(() => { el.timer.textContent = App.fmtTime(Date.now() - startedAt); }, 500);
    el.timer.textContent = '00:00';
    beginPrompt();
  }

  // One step per layer on the way down; if the target is a group, one more step
  // where the right answer is to stop.
  function stepsFor(target) {
    const out = [];
    let at = v.root;
    for (const n of v.path(target)) {
      out.push({ parent: at, answer: n, auto: v.passThrough(at) });
      at = n;
    }
    if (!v.isLeaf(target)) out.push({ parent: target, answer: STOP, auto: false });
    return out;
  }

  function beginPrompt() {
    const p = prompts[idx];
    steps = stepsFor(p.target);
    si = 0;
    results[idx] = [];
    el.board.replaceChildren();
    el.term.textContent = p.text;
    openStep();
  }

  function openStep() {
    attempts = 0;
    while (si < steps.length && steps[si].auto) {
      renderColumn(si, true);
      results[idx].push('auto');
      si++;
    }
    if (si >= steps.length) return finishPrompt();
    renderColumn(si, false);
    updateHud();
  }

  function renderColumn(k, auto) {
    const s = steps[k];
    const kids = v.children(s.parent);
    const col = node('section', 'pi-col' + (auto ? '' : ' is-active'));
    col.dataset.step = k;
    col.style.setProperty('--lvl', `var(--lvl-${Math.min(kids[0].level, 5)})`);
    const head = node('header', 'pi-col-head');
    head.append(node('span', 'lvl', levelName(kids[0].level, kids.length > 1)), node('span', 'count', String(kids.length)));
    const list = node('ol', 'pi-list');
    if (stopOffered && s.parent !== v.root && !auto) {
      const li = node('li');
      const b = node('button', 'pi-item pi-stop');
      b.type = 'button';
      b.dataset.id = STOP;
      b.append(node('span', 'code', '◎ stop here'), node('span', 't', `It names the ${Tax.lower(levelName(s.parent.level))} itself`));
      li.append(b);
      list.append(li);
    }
    for (const c of kids) {
      const li = node('li');
      const b = node('button', 'pi-item');
      b.type = 'button';
      b.dataset.id = c.id;
      if (cfg.codes !== false && c.code) b.append(node('span', 'code', c.code));
      b.append(node('span', 't', c.title));
      const n = v.children(c).length;
      if (n) b.append(node('span', 'n', n + ' ›'));
      if (auto) {
        b.disabled = true;
        if (c === s.answer) b.classList.add('is-chosen', 'r-auto');
      }
      li.append(b);
      list.append(li);
    }
    col.append(head, list);
    if (auto) col.append(node('p', 'auto-note', 'Only one way down from here.'));
    for (const prev of el.board.querySelectorAll('.pi-col.is-active')) deactivate(prev);
    for (const g of el.board.querySelectorAll('.pi-ghost')) g.remove();
    el.board.append(col);
    if (!auto) {
      for (const l of v.levels.filter((l) => l > kids[0].level)) {
        el.board.append(node('div', 'pi-ghost', levelName(l, true)));
      }
    }
    requestAnimationFrame(() => col.scrollIntoView({ inline: 'end', block: 'nearest', behavior: 'smooth' }));
  }

  function deactivate(col) {
    col.classList.remove('is-active');
    for (const b of col.querySelectorAll('.pi-item')) b.disabled = true;
    col.querySelector('.pi-stop')?.closest('li').remove();
  }

  function pick(btn) {
    const s = steps[si];
    const id = btn.dataset.id;
    const right = s.answer === STOP ? id === STOP : id === s.answer.id;
    if (right) {
      const r = Math.min(attempts, MAX);
      results[idx].push(r);
      btn.classList.remove('is-reveal');
      btn.classList.add('is-chosen', 'r-' + r);
      const col = btn.closest('.pi-col');
      if (id === STOP) {
        // Keep the stop choice visible: deactivate() would otherwise remove it.
        col.classList.remove('is-active');
        for (const b of col.querySelectorAll('.pi-item')) b.disabled = true;
      } else deactivate(col);
      si++;
      return si >= steps.length ? finishPrompt() : openStep();
    }
    if (attempts >= MAX || btn.classList.contains('is-wrong')) return;
    attempts++;
    btn.classList.add('is-wrong');
    btn.classList.remove('is-flash');
    void btn.offsetWidth;
    btn.classList.add('is-flash');
    btn.closest('li').append(peek(id, s));
    if (attempts >= MAX) {
      const answer = btn.closest('.pi-col').querySelector(`.pi-item[data-id="${CSS.escape(s.answer === STOP ? STOP : s.answer.id)}"]`);
      answer.classList.add('is-reveal');
      answer.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    updateHud();
  }

  // What the wrong pick actually is: a miss should teach where that branch leads.
  function peek(id, s) {
    const p = node('div', 'peek');
    if (id === STOP) {
      p.textContent = `No: “${prompts[idx].text}” is narrower than that.`;
      return p;
    }
    const n = v.tax.byId.get(id);
    if (n.children.length) {
      p.append('Holds ');
      Tax.examples(v.tax, n, 3).forEach((m, i) => {
        if (i) p.append('; ');
        p.append(node('b', null, m.title));
      });
    } else if (n.def) {
      p.textContent = firstSentence(n.def, 130);
    }
    if (s.answer === STOP && n.children.length) p.prepend('Too deep. ');
    return p;
  }

  function finishPrompt() {
    const p = prompts[idx];
    const t = p.target;
    const scored = results[idx].filter((r) => r !== 'auto');
    const worst = scored.length ? Math.max(...scored) : 0;
    for (const g of el.board.querySelectorAll('.pi-ghost')) g.remove();
    const card = node('section', 'pi-result');
    card.append(node('p', `verdict r-${worst}`,
      worst === 0 ? 'Filed, no misses' : worst === MAX ? 'Revealed' : 'Filed'));
    const h = node('h3');
    if (t.code) h.append(node('span', 'code', t.code));
    h.append(t.title);
    card.append(h);

    const lvl = Tax.lower(levelName(t.level));
    const isA = {
      title: (() => {
        const noun = v.tax.setInfo(p.set).noun || v.tax.termNoun || 'term';
        return `“${p.text}” is ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun} filed under this ${lvl}.`;
      })(),
      leaf: `“${p.text}” is the ${lvl} itself.`,
      group: `“${p.text}” names this ${lvl} itself, so the right move was to stop here.`,
    }[p.kind];
    card.append(node('p', 'is-a', isA));

    const trail = node('div', 'trail');
    const path = v.path(t);
    path.forEach((n, i) => trail.append(node('span', `r-${results[idx][i]}`, n.code || n.title)));
    if (results[idx].length > path.length) trail.append(node('span', `r-${results[idx][path.length]}`, '◎ stop'));
    card.append(trail);

    if (t.def) card.append(node('p', 'def', t.def));
    else {
      const kids = v.children(t);
      if (kids.length) {
        const d = node('p', 'def', `${kids.length} ${Tax.lower(levelName(kids[0].level, true))}, including `);
        d.append(Tax.examples(v.tax, t, 3).map((m) => m.title).join('; ') + '.');
        card.append(d);
      }
    }
    // Other titles filed here, from the prompt's own set first, flagged ones first.
    const others = (v.tax.termsByNode.get(t.id) || [])
      .filter((x) => x.text !== p.text && x.set === (p.set || x.set))
      .sort((a, b) => b.flag - a.flag)
      .slice(0, 8);
    if (others.length) {
      const also = node('p', 'also');
      also.append(node('b', null, 'Also filed here: '), others.map((x) => x.text).join(', '));
      card.append(also);
    }

    const next = node('button', 'primary-btn', idx + 1 < prompts.length ? 'Next term' : 'See results');
    next.type = 'button';
    next.append(node('span', 'kbd', '↵'));
    next.addEventListener('click', () => {
      idx++;
      if (idx >= prompts.length) finish();
      else beginPrompt();
    });
    card.append(next);
    el.board.append(card);
    el.tries.textContent = '';
    updateHud();
    requestAnimationFrame(() => {
      el.board.scrollTo({ left: el.board.scrollWidth, behavior: 'smooth' });
      next.focus({ preventScroll: true });
    });
  }

  function scorePercent() {
    const all = results.flat().filter((r) => r !== 'auto');
    if (!all.length) return 100;
    return Math.round((all.reduce((a, r) => a + POINTS[r], 0) / all.length) * 100);
  }

  function updateHud() {
    el.progress.textContent = `${Math.min(idx + 1, prompts.length)} / ${prompts.length}`;
    el.score.textContent = scorePercent() + '%';
    el.tries.textContent = attempts === 0 ? '' : attempts >= MAX ? 'Click the answer to go on' :
      `${MAX - attempts} ${MAX - attempts === 1 ? 'try' : 'tries'} left`;
  }

  function finish() {
    clearInterval(timerId);
    const missed = prompts.filter((_, i) => results[i].some((r) => r !== 'auto' && r > 0));
    const clean = prompts.length - missed.length;
    App.showEnd({
      title: cfg.title || 'File it',
      score: scorePercent(),
      breakdown: `${clean} of ${prompts.length} filed without a miss`,
      time: App.fmtTime(Date.now() - startedAt),
      missed: missed.map((p) => {
        const li = document.createElement('li');
        li.append(node('b', null, p.text), ' → ');
        if (p.target.code) li.append(node('span', 'code', p.target.code + ' '));
        li.append(p.target.title);
        return li;
      }),
      retry: missed.length ? { label: `Retry the ${missed.length} you missed`, run: () => start(cfg, v, missed) } : null,
      restart: () => start(cfg, v),
    });
  }

  document.addEventListener('keydown', (e) => {
    if (!v || e.key !== 'Enter' || e.target.closest?.('input, select, textarea, button')) return;
    el.board.querySelector('.pi-result .primary-btn')?.click();
  });

  window.Place = {
    start,
    stop() {
      clearInterval(timerId);
      v = null;
      if (el) el.board.replaceChildren();
    },
  };
})();
