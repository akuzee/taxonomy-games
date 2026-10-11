/*
 * Taxonomy helpers — no DOM. Runs in the browser (window.Tax) and in node
 * (module.exports) so tree logic is testable against the real data.
 *
 * A taxonomy is a tree of coded nodes at fixed levels (SOC: high-level group →
 * … → detailed occupation) plus "terms": outside names that resolve to exactly
 * one node (BLS direct-match job titles). Games never walk the raw tree; they
 * walk a *view* — the tree under a scope node, restricted to a chosen set of
 * levels, with a skipped level's children re-attached to the nearest kept
 * ancestor. Everything taxonomy-specific lives in the data file, not here.
 *
 * Views list children alphabetically (the user's call: you navigate by names,
 * not codes). The data file stays in code order; pass order: 'code' for that.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Tax = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  function index(raw) {
    const nodes = raw.nodes.map(([id, level, parent, title, code, def]) =>
      ({ id, level, parent, title, code, def: def || null, children: [] }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const n of nodes) if (n.parent) byId.get(n.parent).children.push(n);
    // A taxonomy can have several term sets (SOC: BLS titles, O*NET titles, tasks…).
    // Raw terms are [text, node id, flag, set index]; the flag marks a curated
    // subset of its set (BLS illustrative titles, O*NET's everyday titles).
    const sets = raw.termSets || [{ key: 'titles', noun: raw.termNoun, nounPlural: raw.termNounPlural }];
    const terms = raw.terms.map(([text, id, flag, set = 0]) =>
      ({ text, id, flag: !!flag, illustrative: !!flag, set: sets[set].key }));
    const termsByNode = new Map();
    for (const t of terms) {
      if (!termsByNode.has(t.id)) termsByNode.set(t.id, []);
      termsByNode.get(t.id).push(t);
    }
    const catchAll = raw.catchAll ? new RegExp(raw.catchAll, 'i') : null;
    const ancestors = (n) => {
      const out = [];
      for (let m = n; m; m = m.parent ? byId.get(m.parent) : null) out.push(m);
      return out;
    };
    return {
      ...raw, nodes, byId, terms, termsByNode, ancestors, termSets: sets,
      setInfo: (key) => sets.find((s) => s.key === key) || sets[0],
      roots: nodes.filter((n) => !n.parent),
      // "X, All Other" / "Miscellaneous X": residual buckets, not things anyone recalls by name
      isCatchAll: (n) => !!catchAll && catchAll.test(n.title),
      levelKeys: raw.levels.map((l) => l.key),
      defaultLevels: raw.levels.filter((l) => l.default).map((l) => l.key),
    };
  }

  const byTitle = (a, b) => a.title.localeCompare(b.title);

  function view(tax, { scope = null, levels, order = 'alpha' } = {}) {
    const scopeNode = scope ? tax.byId.get(scope) : null;
    if (scope && !scopeNode) throw new Error(`unknown scope "${scope}"`);
    const top = scopeNode ? scopeNode.level : -1;
    const keys = levels && levels.length ? levels : tax.defaultLevels;
    const kept = tax.levels.map((_, i) => i).filter((i) => i > top && keys.includes(tax.levels[i].key));
    if (!kept.length) throw new Error('no levels selected below the scope');
    const keep = new Set(kept);
    const root = scopeNode ||
      { id: '', level: -1, title: tax.name, code: '', children: tax.roots, def: null };

    const kids = new Map();
    const parent = new Map();
    const byLevel = new Map(kept.map((l) => [l, []]));
    const all = [];
    (function fill(n) {
      const c = [];
      const walk = (m) => { for (const k of m.children) (keep.has(k.level) ? c.push(k) : walk(k)); };
      walk(n);
      if (order === 'alpha') c.sort(byTitle);
      kids.set(n.id, c);
      for (const k of c) {
        parent.set(k.id, n);
        all.push(k);
        byLevel.get(k.level).push(k);
        fill(k);
      }
    })(root);
    const inView = new Set(all.map((n) => n.id));
    const children = (n) => kids.get(n.id) || [];

    const v = {
      tax, root, levels: kept, nodes: all,
      levelInfo: (i) => tax.levels[i],
      children,
      parent: (n) => parent.get(n.id) || null,
      atLevel: (l) => byLevel.get(l) || [],
      has: (id) => inView.has(id),
      isLeaf: (n) => children(n).length === 0,
      // A node with one child asks nothing: the child is forced.
      passThrough: (n) => children(n).length === 1,
      path(n) {
        const p = [];
        for (let m = n; m && m !== root; m = parent.get(m.id)) p.unshift(m);
        return p;
      },
      // Nearest in-view ancestor-or-self of any raw node. Terms point at detailed
      // occupations, which may be a skipped level, or outside the scope (→ null).
      resolve(id) {
        for (const m of tax.ancestors(tax.byId.get(id))) if (inView.has(m.id)) return m;
        return null;
      },
    };
    return v;
  }

  // Up to k raw leaf titles under a node, evenly spaced and skipping catch-alls:
  // used to say what a group contains (miss feedback, write-in hints).
  function examples(tax, n, k = 3) {
    const leaves = [];
    (function walk(m) {
      if (!m.children.length) { if (!tax.isCatchAll(m)) leaves.push(m); return; }
      m.children.forEach(walk);
    })(n);
    if (leaves.length <= k) return leaves;
    return Array.from({ length: k }, (_, i) => leaves[Math.floor((i + 0.5) * leaves.length / k)]);
  }

  /*
   * Prompts for the place-it game, grouped by the node they resolve to:
   *   kinds: a term set's key ('titles', 'tasks', …), or that key plus '*' for
   *          only its flagged subset ('reported*'), or 'illustrative' (an old
   *          name for 'titles*'), 'leaves' (the leaf nodes' own titles), or
   *          'groups' (group titles — the player must also stop at the right layer)
   *   skip:  node ids whose subtrees contribute no prompts
   * Returns [{ target, terms: [{ text, kind }] }].
   */
  function promptPool(v, { kinds = ['illustrative'], skip = [] } = {}) {
    const { tax } = v;
    const skipped = (n) => tax.ancestors(n).some((m) => skip.includes(m.id));
    const byTarget = new Map();
    const add = (target, text, kind, set) => {
      if (!byTarget.has(target.id)) byTarget.set(target.id, { target, terms: [] });
      const bucket = byTarget.get(target.id).terms;
      if (!bucket.some((t) => t.text === text)) bucket.push({ text, kind, set });
    };

    const wanted = kinds.filter((k) => k !== 'leaves' && k !== 'groups')
      .map((k) => (k === 'illustrative' ? 'titles*' : k));
    const whole = new Set(wanted.filter((k) => !k.endsWith('*')));
    const flagged = new Set(wanted.filter((k) => k.endsWith('*')).map((k) => k.slice(0, -1)));
    if (whole.size || flagged.size) {
      for (const t of tax.terms) {
        if (!whole.has(t.set) && !(t.flag && flagged.has(t.set))) continue;
        const target = v.resolve(t.id);
        if (target && !skipped(tax.byId.get(t.id))) add(target, t.text, 'title', t.set);
      }
    }
    if (kinds.includes('leaves')) {
      for (const n of tax.nodes) {
        if (n.children.length || skipped(n) || tax.isCatchAll(n)) continue;
        const target = v.resolve(n.id);
        if (target) add(target, n.title, 'leaf');
      }
    }
    if (kinds.includes('groups')) {
      const seen = new Map();
      for (const n of v.nodes) seen.set(n.title, (seen.get(n.title) || 0) + 1);
      for (const n of v.nodes) {
        // Pass-through nodes are excluded because the game auto-advances through
        // them; asking for one would mean offering a choice it never offers.
        if (v.children(n).length < 2 || skipped(n) || tax.isCatchAll(n)) continue;
        if (seen.get(n.title) > 1 || n.title === v.root.title) continue;
        add(n, n.title, 'group');
      }
    }
    return [...byTarget.values()];
  }

  // One prompt per target: drawing targets first keeps coverage even when one
  // occupation has 100 titles and its neighbor has 2.
  function samplePrompts(pool, count, rand = Math.random) {
    const order = shuffle(pool.slice(), rand);
    return order.slice(0, Math.min(count || order.length, order.length)).map(({ target, terms }) => {
      const t = terms[Math.floor(rand() * terms.length)];
      return { text: t.text, kind: t.kind, set: t.set, target };
    });
  }

  function shuffle(a, rand = Math.random) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Level names mid-sentence: "Major group" → "major group", but "NAICS industry" stays.
  const lower = (s) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

  return { index, view, examples, promptPool, samplePrompts, shuffle, lower };
});
