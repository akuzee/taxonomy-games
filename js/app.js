/*
 * View routing, the home page, the builder, and the shared end panel.
 * Game configs are plain JSON (see data/presets.json); the builder produces the
 * same shape, so anything it can make can also be hand-written as a preset.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const taxCache = new Map();
  let catalog, presets = [], lastConfig = null;
  let current = null;   // the taxonomy the home page, Map, and Explore show

  // Remembering the tab is a per-viewer convenience; storage can be missing.
  const remember = (id) => { try { localStorage.setItem('tg.taxonomy', id); } catch { /* fine */ } };
  const recall = () => { try { return localStorage.getItem('tg.taxonomy'); } catch { return null; } };

  async function loadJSON(p) {
    const r = await fetch(p);
    if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
    return r.json();
  }

  async function loadTax(id) {
    if (!taxCache.has(id)) {
      const entry = catalog.taxonomies.find((t) => t.id === id);
      if (!entry) throw new Error(`Unknown taxonomy "${id}".`);
      taxCache.set(id, Tax.index(await loadJSON(entry.file)));
    }
    return taxCache.get(id);
  }

  function show(view) {
    for (const id of ['home', 'builder', 'explore', 'map', 'writein', 'place', 'race']) $('view-' + id).hidden = id !== view;
    document.body.dataset.view = ['writein', 'place', 'race'].includes(view) ? 'play-' + view : view;
    $('end-panel').hidden = true;
  }

  function error(msg) {
    const bar = $('error-bar');
    bar.textContent = msg;
    bar.hidden = !msg;
  }

  function stopGames() {
    WriteIn.stop();
    Place.stop();
    Explore.stop();
    MapView.stop();
    Race.stop();
  }

  // #map / #explore show the current taxonomy; #map.naics-2022 picks one.
  const routeFor = (view) => `#${view}${current === catalog.taxonomies[0].id ? '' : '.' + current}`;

  async function openMap() {
    error('');
    const tax = await loadTax(current);
    stopGames();
    lastConfig = null;
    show('map');
    MapView.start(tax);
    history.replaceState(null, '', routeFor('map'));
  }

  async function explore() {
    error('');
    const tax = await loadTax(current);
    const hidden = tax.levels.filter((l) => !l.default).map((l) => l.plural);
    $('ex-all-label').textContent = hidden.length ? `Show every layer (adds ${hidden.join(', ')})` : 'Show every layer';
    stopGames();
    lastConfig = null;
    show('explore');
    Explore.start(Tax.view(tax, { levels: $('ex-all-levels').checked ? tax.levelKeys : tax.defaultLevels }));
    history.replaceState(null, '', routeFor('explore'));
  }

  async function play(config) {
    error('');
    try {
      const tax = await loadTax(config.taxonomy);
      const v = Tax.view(tax, { scope: config.scope, levels: config.levels });
      stopGames();
      lastConfig = config;
      if (config.mode === 'writein') { show('writein'); WriteIn.start(config, v); }
      else if (config.mode === 'race') { show('race'); Race.start(config, v); }
      else { show('place'); Place.start(config, v); }
      if (config.id) history.replaceState(null, '', '#' + config.id);
    } catch (e) {
      console.error(e);
      error(e.message);
    }
  }

  function goHome() {
    stopGames();
    show('home');
    history.replaceState(null, '', location.pathname + location.search.replace(/[?&]play=[^&]*/, ''));
  }

  // ---------- end panel (shared by both games) ----------
  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function showEnd({ title, score, breakdown, time, table, missed, retry, restart }) {
    $('end-title').textContent = title;
    $('end-score').textContent = typeof score === 'number' ? score + '%' : score;
    $('end-breakdown').textContent = breakdown;
    $('end-time').textContent = time;
    $('end-table').replaceChildren(...(table ? [table] : []));
    $('missed-wrap').hidden = !missed || !missed.length;
    $('missed-list').replaceChildren(...(missed || []));
    const retryBtn = $('btn-retry-missed');
    retryBtn.hidden = !retry;
    if (retry) {
      retryBtn.textContent = retry.label;
      retryBtn.onclick = () => { $('end-panel').hidden = true; retry.run(); };
    }
    $('btn-restart').onclick = () => { $('end-panel').hidden = true; restart(); };
    $('end-panel').hidden = false;
    $('btn-restart').focus();
  }

  window.App = { fmtTime, showEnd };

  // ---------- home ----------
  async function setTaxonomy(id) {
    current = id;
    remember(id);
    await renderHome();
  }

  function renderTabs() {
    $('tax-tabs').replaceChildren(...catalog.taxonomies.map((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tax-tab';
      b.setAttribute('aria-pressed', String(t.id === current));
      b.append(t.label);
      const s = document.createElement('span');
      s.textContent = t.name;
      b.append(s);
      b.addEventListener('click', () => setTaxonomy(t.id));
      return b;
    }));
  }

  async function renderHome() {
    renderTabs();
    const tax = await loadTax(current);
    const all = Tax.view(tax, { levels: tax.levelKeys });
    const ex = tax.example && tax.byId.get(tax.example.node);
    const path = ex ? all.path(ex) : [];
    const fig = $('ladder');
    fig.replaceChildren();
    const shown = tax.levels.map((lvl, i) => ({ lvl, i })).filter(({ lvl }) => lvl.default);
    shown.forEach(({ lvl, i }, depth) => {
      const rung = document.createElement('div');
      rung.className = 'rung';
      rung.style.setProperty('--depth', depth);
      rung.style.setProperty('--lvl', `var(--lvl-${Math.min(i, 5)})`);
      const count = document.createElement('span');
      count.className = 'rung-count';
      count.textContent = all.atLevel(i).length.toLocaleString();
      const body = document.createElement('div');
      body.className = 'rung-body';
      const name = document.createElement('div');
      name.className = 'rung-name';
      name.textContent = lvl.plural;
      body.append(name);
      const n = path[i];
      if (n) {
        const eg = document.createElement('div');
        eg.className = 'rung-eg';
        const code = document.createElement('span');
        code.className = 'code';
        code.textContent = n.code;
        eg.append(code, n.title);
        body.append(eg);
      }
      rung.append(count, body);
      fig.append(rung);
    });
    if (ex) {
      const cap = document.createElement('figcaption');
      cap.textContent = `Where “${tax.example.term}” is filed: one drawer at each of the ${shown.length} layers.`;
      fig.append(cap);
    }
    $('hero-eyebrow').textContent = tax.fullName;
    $('hero-title').textContent = tax.tagline || tax.fullName;
    $('hero-blurb').textContent = tax.blurb || '';

    // Mode cards speak the taxonomy's language.
    const lower = Tax.lower;
    const leaf = tax.levels.filter((l) => l.default).at(-1);
    const [e1, e2] = tax.termExamples || [];
    $('copy-place').textContent = `Get ${/^[aeiou]/i.test(tax.termNoun) ? 'an' : 'a'} ${tax.termNoun}` +
      (e1 ? `, such as “${e1}”${e2 ? ` or “${e2}”` : ''},` : '') +
      ` and pick its branch at every layer down to the ${lower(leaf.name)}. Group names show up too, ` +
      'and for those you also have to say which layer they sit at.';
    const raceLevel = tax.levels.find((l) => l.key === (tax.boardLevels || tax.defaultLevels)[2]);
    $('copy-race').textContent = `Start on one ${lower(raceLevel.name)} and get to another across the map, ` +
      "using only the keyboard. You're scored on time, on keypresses over par, and on every wrong group you open.";
    const top = path[shown[0]?.i] || all.atLevel(shown[0].i)[0];
    const kids = top ? Tax.view(tax).children(top) : [];
    $('art-code-0').textContent = top?.code || '';
    $('art-title-0').textContent = top ? top.title.replace(/ Occupations$/, '') : '';
    $('art-code-1').textContent = kids[0]?.code || '';
    $('art-code-2').textContent = kids[1]?.code || '';

    const src = $('source-line');
    src.textContent = 'Data: ' + tax.source + ' ';
    const a = document.createElement('a');
    a.href = tax.sourceUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = tax.sourceUrl.replace(/^https?:\/\//, '');
    src.append(a);

    for (const list of document.querySelectorAll('.preset-list')) {
      list.replaceChildren(...presets.filter((p) => p.mode === list.dataset.mode && p.taxonomy === current).map(presetButton));
    }
  }

  function presetButton(p) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset';
    const t = document.createElement('b');
    t.textContent = p.title;
    const s = document.createElement('span');
    s.textContent = p.blurb || '';
    const m = document.createElement('em');
    m.textContent = p.mode === 'place' ? `${p.count || 'all'} terms` :
      p.mode === 'race' ? `${p.count} races` :
      (p.levels || []).length === 1 ? '1 layer' : `${(p.levels || []).length || 'all'} layers`;
    b.append(t, s, m);
    b.addEventListener('click', () => play(p));
    return b;
  }

  // ---------- builder ----------
  const form = () => $('builder');
  const mode = () => form().querySelector('input[name="mode"]:checked').value;

  async function openBuilder() {
    show('builder');
    const sel = $('b-taxonomy');
    if (!sel.options.length) {
      for (const t of catalog.taxonomies) sel.add(new Option(`${t.label} (${t.name})`, t.id));
    }
    sel.value = current;
    await fillScopes();
  }

  async function fillScopes() {
    const tax = await loadTax($('b-taxonomy').value);
    const sel = $('b-scope');
    const keep = sel.value;
    sel.replaceChildren(new Option(`All of ${tax.name}`, ''));
    // Scopes stop two layers above the bottom: below that there's too little to play.
    const deepest = tax.levels.length - 3;
    (function walk(nodes) {
      for (const n of nodes) {
        if (n.level > deepest) continue;
        const pad = '   '.repeat(n.level);
        sel.add(new Option(`${pad}${n.code} ${n.title}`, n.id));
        walk(n.children);
      }
    })(tax.roots);
    sel.value = [...sel.options].some((o) => o.value === keep) ? keep : '';
    renderBuilderPools(tax);
    $('b-levels').replaceChildren();
    renderBuilderLevels();
  }

  // Which kinds of term a taxonomy offers (BLS titles, Census index entries, O*NET tasks…).
  function renderBuilderPools(tax) {
    const pools = tax.pools || [{ kind: 'titles', label: 'Terms' }, { kind: 'groups', label: 'Group names' }];
    const on = tax.defaultPool || ['titles', 'groups'];
    $('b-pool').replaceChildren(...pools.map(({ kind, label }) => {
      const l = document.createElement('label');
      const i = document.createElement('input');
      i.type = 'checkbox';
      i.value = kind;
      i.checked = on.includes(kind);
      const s = document.createElement('span');
      s.textContent = label + ' ';
      const em = document.createElement('em');
      em.id = 'pool-n-' + kind;
      s.append(em);
      l.append(i, s);
      return l;
    }));
    const skip = (tax.skipTermsByDefault || []).length > 0;
    $('b-skip-wrap').hidden = !skip;
    $('b-skip').checked = skip;
    $('b-skip-label').textContent = tax.skipLabel || '';
  }

  function renderBuilderLevels() {
    const tax = taxCache.get($('b-taxonomy').value);
    const scope = $('b-scope').value || null;
    const top = scope ? tax.byId.get(scope).level : -1;
    const box = $('b-levels');
    const prev = new Set([...box.querySelectorAll('input:checked')].map((i) => i.value));
    const fresh = !box.children.length;
    const full = Tax.view(tax, { scope, levels: tax.levelKeys.filter((_, i) => i > top) });
    box.replaceChildren(...tax.levels.map((lvl, i) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = lvl.key;
      input.disabled = i <= top;
      input.checked = !input.disabled && (fresh ? lvl.default : prev.has(lvl.key) || (prev.size === 0 && lvl.default));
      const span = document.createElement('span');
      span.textContent = lvl.plural[0].toUpperCase() + lvl.plural.slice(1) + ' ';
      const em = document.createElement('em');
      em.textContent = i <= top ? '(above the scope)' : `(${full.atLevel(i).length.toLocaleString()})`;
      span.append(em);
      label.classList.toggle('is-disabled', input.disabled);
      label.append(input, span);
      return label;
    }));
    updateBuilderSummary();
  }

  function builderConfig() {
    const pool = [...$('b-pool').querySelectorAll('input:checked')].map((i) => i.value);
    const tax = taxCache.get($('b-taxonomy').value);
    const scope = $('b-scope').value || null;
    const cfg = {
      mode: mode(),
      taxonomy: tax.id,
      scope,
      levels: [...$('b-levels').querySelectorAll('input:checked')].map((i) => i.value),
      codes: $('b-codes').checked,
    };
    const where = scope ? tax.byId.get(scope).title : tax.name;
    if (cfg.mode === 'place') {
      cfg.pool = pool;
      cfg.count = +$('b-count').value;
      cfg.skip = $('b-skip').checked ? tax.skipTermsByDefault || [] : [];
      cfg.title = `File it: ${where}`;
    } else {
      cfg.title = `Write-in: ${where}`;
    }
    return cfg;
  }

  function updateBuilderSummary() {
    const isPlace = mode() === 'place';
    for (const fs of form().querySelectorAll('fieldset[data-for]')) fs.hidden = fs.dataset.for !== mode();
    const out = $('b-summary');
    const submit = form().querySelector('button[type="submit"]');
    try {
      const cfg = builderConfig();
      const tax = taxCache.get(cfg.taxonomy);
      const v = Tax.view(tax, { scope: cfg.scope, levels: cfg.levels });
      for (const { kind } of tax.pools || []) {
        const n = Tax.promptPool(v, { kinds: [kind], skip: cfg.skip || [] }).reduce((a, p) => a + p.terms.length, 0);
        const em = $('pool-n-' + kind);
        if (em) em.textContent = `(${n.toLocaleString()})`;
      }
      if (isPlace) {
        const pool = Tax.promptPool(v, { kinds: cfg.pool, skip: cfg.skip });
        out.textContent = pool.length
          ? `${v.levels.length} layers deep. Draws ${Math.min(cfg.count || pool.length, pool.length)} of ${pool.length.toLocaleString()} possible answers, one term each.`
          : 'Nothing to file with these settings. Pick a kind of term.';
        submit.disabled = !pool.length;
      } else {
        const asked = v.nodes.filter((n) => !(v.passThrough(v.parent(n) || v.root) || tax.isCatchAll(n))).length;
        out.textContent = `${v.levels.length} rounds, ${asked.toLocaleString()} names to write in.`;
        submit.disabled = false;
      }
    } catch (e) {
      out.textContent = e.message;
      submit.disabled = true;
    }
  }

  function wireBuilder() {
    $('btn-new-quiz').addEventListener('click', openBuilder);
    $('b-cancel').addEventListener('click', goHome);
    $('b-taxonomy').addEventListener('change', fillScopes);
    $('b-scope').addEventListener('change', renderBuilderLevels);
    form().addEventListener('change', (e) => {
      if (e.target.id !== 'b-scope' && e.target.id !== 'b-taxonomy') updateBuilderSummary();
    });
    form().addEventListener('submit', (e) => {
      e.preventDefault();
      play(builderConfig());
    });
  }

  // ---------- boot ----------
  async function boot() {
    try {
      catalog = await loadJSON('data/index.json');
      presets = await loadJSON('data/presets.json');
      for (const p of presets) p.taxonomy ||= catalog.taxonomies[0].id;
      const saved = recall();
      current = catalog.taxonomies.some((t) => t.id === saved) ? saved : catalog.taxonomies[0].id;
    } catch (e) {
      error(`Couldn't load the game data (${e.message}). Serve the folder with node tools/serve.mjs; browsers block data files opened directly from disk.`);
      return;
    }
    $('btn-home').addEventListener('click', goHome);
    $('btn-exit-play').addEventListener('click', goHome);
    $('btn-end-home').addEventListener('click', goHome);
    $('btn-explore').addEventListener('click', explore);
    $('btn-map').addEventListener('click', openMap);
    $('ex-all-levels').addEventListener('change', explore);
    wireBuilder();
    // ?play=<preset> (local) or #<preset> (the artifact build can't use query strings);
    // #map, #explore, or #map.<taxonomy-id> for the browsers.
    const route = async (want, force) => {
      const preset = presets.find((p) => p.id === want);
      if (preset) {
        if (preset !== lastConfig || force) {
          if (preset.taxonomy !== current) { current = preset.taxonomy; remember(current); await renderHome(); }
          play(preset);
        }
        return true;
      }
      const [view, taxId] = want.split('.');
      if (view !== 'map' && view !== 'explore') return false;
      if (taxId && catalog.taxonomies.some((t) => t.id === taxId) && taxId !== current) {
        current = taxId;
        remember(taxId);
        await renderHome();
      } else if (!force && document.body.dataset.view === view) return true;
      if (view === 'map') await openMap(); else await explore();
      return true;
    };
    await renderHome();
    const want = new URLSearchParams(location.search).get('play') || location.hash.slice(1);
    if (!(await route(want, true))) show('home');
    window.addEventListener('hashchange', () => route(location.hash.slice(1), false));
  }

  boot();
})();
