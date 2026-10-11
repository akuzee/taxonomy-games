/*
 * Explore: click through the tree with nothing at stake. Same columns as File it:
 * clicking a node opens its children to the right, and a card at the end
 * describes whatever was clicked last. Single-child chains open all the way
 * down, as in File it, so a broad occupation lands on its detailed one.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  let el, v;

  function bind() {
    if (el) return;
    el = { board: $('ex-board') };
    el.board.addEventListener('click', (e) => {
      const btn = e.target.closest('.pi-item');
      if (btn && v) open(+btn.closest('.pi-col').dataset.depth, v.tax.byId.get(btn.dataset.id));
    });
  }

  const node = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const levelName = (l, plural) => (plural ? v.levelInfo(l).plural : v.levelInfo(l).name);

  function start(view) {
    bind();
    v = view;
    el.board.replaceChildren(column(v.root, 0), card(v.root));
  }

  function open(depth, n) {
    for (const c of [...el.board.children]) {
      if (!c.classList.contains('pi-col') || +c.dataset.depth > depth) c.remove();
    }
    mark(depth, n);
    let at = n;
    let d = depth;
    while (v.children(at).length) {
      el.board.append(column(at, d + 1));
      const kids = v.children(at);
      if (kids.length > 1) break;
      at = kids[0];
      mark(++d, at);
    }
    const info = card(at);
    el.board.append(info);
    requestAnimationFrame(() => info.scrollIntoView({ inline: 'end', block: 'nearest', behavior: 'smooth' }));
  }

  function mark(depth, n) {
    const col = el.board.querySelector(`.pi-col[data-depth="${depth}"]`);
    col.classList.add('has-open');
    for (const b of col.querySelectorAll('.pi-item')) b.classList.toggle('is-open', b.dataset.id === n.id);
  }

  function column(parent, depth) {
    const kids = v.children(parent);
    const col = node('section', 'pi-col is-active ex-col');
    col.dataset.depth = depth;
    col.style.setProperty('--lvl', `var(--lvl-${Math.min(kids[0].level, 5)})`);
    const head = node('header', 'pi-col-head');
    head.append(node('span', 'lvl', levelName(kids[0].level, kids.length > 1)), node('span', 'count', String(kids.length)));
    const list = node('ol', 'pi-list');
    for (const c of kids) {
      const b = node('button', 'pi-item');
      b.type = 'button';
      b.dataset.id = c.id;
      if (c.code) b.append(node('span', 'code', c.code));
      b.append(node('span', 't', c.title));
      const n = v.children(c).length;
      if (n) b.append(node('span', 'n', n + ' ›'));
      const li = node('li');
      li.append(b);
      list.append(li);
    }
    col.append(head, list);
    return col;
  }

  // Everything in the view below n, counted per layer.
  function holds(n) {
    const counts = new Map();
    (function walk(m) {
      for (const c of v.children(m)) {
        counts.set(c.level, (counts.get(c.level) || 0) + 1);
        walk(c);
      }
    })(n);
    return [...counts].map(([l, k]) => `${k.toLocaleString()} ${Tax.lower(levelName(l, k !== 1))}`);
  }

  function termsUnder(n) {
    const out = [];
    (function walk(m) {
      out.push(...(v.tax.termsByNode.get(m.id) || []));
      m.children.forEach(walk);
    })(n);
    return out;
  }

  function card(n) {
    const c = node('section', 'pi-result ex-card');
    const isRoot = n === v.root;
    c.append(node('p', 'ex-level', isRoot ? v.tax.fullName : levelName(n.level)));
    const h = node('h3');
    if (n.code) h.append(node('span', 'code', n.code));
    h.append(isRoot ? v.tax.name : n.title);
    c.append(h);
    if (!isRoot) {
      // The path doubles as navigation: on a phone the earlier columns are off-screen.
      const trail = node('div', 'trail');
      v.path(n).forEach((m, i) => {
        const b = node('button', 'trail-link', m.code || m.title);
        b.type = 'button';
        b.title = m.title;
        b.addEventListener('click', () => open(i, m));
        trail.append(b);
      });
      c.append(trail);
    }
    if (n.def) c.append(node('p', 'def', n.def));
    const h2 = holds(n);
    if (h2.length) c.append(node('p', 'def', `Holds ${h2.join(', ')}.`));
    if (isRoot) c.append(node('p', 'is-a', 'Click any group to open it. Nothing here is scored.'));

    const terms = termsUnder(n);
    for (const set of v.tax.termSets) {
      const mine = terms.filter((t) => t.set === set.key);
      if (!mine.length) continue;
      const plural = set.nounPlural || v.tax.termNounPlural || 'terms';
      if (v.isLeaf(n)) {
        const p = node('p', 'also');
        const shown = mine.sort((a, b) => b.flag - a.flag).slice(0, 40);
        p.append(node('b', null, `${mine.length.toLocaleString()} ${plural} filed here: `),
          shown.map((t) => t.text).join(set.long ? ' · ' : ', ') + (mine.length > shown.length ? ' …' : ''));
        c.append(p);
      } else {
        c.append(node('p', 'also', `${mine.length.toLocaleString()} ${plural} are filed somewhere below.`));
      }
    }
    return c;
  }

  window.Explore = {
    start,
    stop() {
      v = null;
      if (el) el.board.replaceChildren();
    },
  };
})();
