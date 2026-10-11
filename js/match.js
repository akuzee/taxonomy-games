/*
 * Write-in answer matching — no DOM. Runs in the browser (window.Match) and in
 * node so it can be calibrated against the real titles (tools/test.mjs).
 *
 * Official titles are long ("Healthcare Practitioners and Technical
 * Occupations"), so exact matching would make the game about typing. Instead a
 * guess is a bag of words, and it names a node when:
 *   1. every guess word fits some word of the title (exactly, as an abbreviation
 *      like "admin", or as an inflection like "teaching"/"teacher"), and
 *   2. it rules out every other candidate at that level — or, if several fit,
 *      exactly one of them is covered word-for-word ("registered nurses"), or
 *      exactly one fits without leaning on abbreviations or inflections.
 * "healthcare" at major-group level fits both 29-0000 and 31-0000 and so is
 * ambiguous, which is the point: you have to know which one you mean.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Match = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const STOP = new Set(('and or the of a an in for to on with by all other occupation worker ' +
    'related miscellaneous including').split(' '));
  // Applied to guesses only: the vocabulary people actually use for these jobs.
  const SYN = {
    it: 'computer', doctor: 'physician', doctors: 'physician', cop: 'police', cops: 'police',
    hr: 'human resource', pr: 'public relation', ceo: 'chief executive', rn: 'registered nurse',
    lpn: 'licensed practical nurse', vet: 'veterinarian', vets: 'veterinarian', math: 'mathematical',
    maths: 'mathematical', ed: 'education', mgmt: 'management', ag: 'agricultural',
    tv: 'television', emt: 'emergency medical technician', ems: 'emergency medical',
  };
  // Word endings that leave the meaning intact (manage-r/manage-ment, teach-er/teach-ing).
  const INFLECT = new Set(['', 'e', 'y', 'r', 'er', 'ers', 'ing', 'on', 'ion', 'ment', 'al',
    'ial', 'ic', 'ical', 'ive', 've', 'ce', 'tist', 'or', 'ed', 'ance', 'ant']);

  function singular(w) {
    if (w.length <= 3 || /(ss|us|is)$/.test(w)) return w;
    if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
    if (/(ch|sh|x|ss)es$/.test(w)) return w.slice(0, -2);
    if (w.endsWith('s')) return w.slice(0, -1);
    return w;
  }
  const words = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/'s\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const squash = (s) => words(s).map(singular).join(' ');

  const tokenCache = new Map();
  function titleTokens(title) {
    let t = tokenCache.get(title);
    if (!t) {
      // "Dispatchers, Except Police, Fire, and Ambulance": the except-clause
      // names what the node is *not*, so it shouldn't help a guess match it.
      // NAICS puts it mid-title instead: "Oilseed (except Soybean) Farming".
      const core = title.replace(/\(except[^)]*\)/gi, ' ').replace(/,?\s+except\b.*$/i, '')
        .replace(/,\s*all other$/i, '');
      t = [...new Set(words(core).map(singular).filter((w) => !STOP.has(w)))];
      tokenCache.set(title, t);
    }
    return t;
  }
  function guessTokens(guess) {
    const out = [];
    for (const w of words(guess)) for (const s of (SYN[w] || w).split(' ')) out.push(singular(s));
    return [...new Set(out.filter((w) => !STOP.has(w) && w.length >= 2))];
  }

  function editDistance1(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  }

  function wordFit(g, n) {
    if (g === n) return 1;
    if (g.length >= 4 && n.startsWith(g)) return 0.9;              // abbreviation: "admin"
    let p = 0;
    while (p < g.length && p < n.length && g[p] === n[p]) p++;
    if (p >= 4 && INFLECT.has(g.slice(p)) && INFLECT.has(n.slice(p))) return 0.85;
    if (g.length >= 6 && g[0] === n[0] && editDistance1(g, n)) return 0.8; // one typo
    return 0;
  }

  // How a guess fits one title: null if any guess word fits nowhere; else
  // whether it covers every title word, and whether every guess word was exact.
  function fit(gTokens, title) {
    const nTokens = titleTokens(title);
    const best = new Array(nTokens.length).fill(0);
    let exact = true;
    for (const g of gTokens) {
      let top = 0;
      nTokens.forEach((n, i) => {
        const s = wordFit(g, n);
        if (s) { top = Math.max(top, s); best[i] = Math.max(best[i], s); }
      });
      if (!top) return null;
      if (top < 1) exact = false;
    }
    return { full: best.every((s) => s > 0), exact };
  }

  // Anything starting with a digit is read as a code. Codes compare without
  // punctuation, so "232011" finds 23-2011 and "1a1" finds 1.a.1. Two shortcuts:
  // trailing zeros may be dropped ("23" → 23-0000), and a range code answers to
  // either end ("31" → 31-33).
  const normCode = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  function codeForms(code) {
    const n = normCode(code);
    const forms = [n, n.replace(/0+$/, '')];
    const range = /^(\d+)[-–](\d+)$/.exec(code);
    if (range && range[1].length === range[2].length && range[1].length <= 2) forms.push(range[1], range[2]);
    return forms;
  }
  const isCode = (g) => /^\s*\d[\w.\-–]*\s*$/.test(g);
  const sameCode = (g, code) => !!code && normCode(g) === normCode(code);

  /*
   * guess → { node } | { ambiguous: [nodes] } | { none: true }
   * candidates: every node at the level being asked (already-named ones too, so
   * the caller can say "already named" instead of handing out a second match).
   */
  function match(guess, candidates) {
    if (isCode(guess)) {
      const g = normCode(guess);
      const hit = candidates.find((n) => sameCode(guess, n.code)) ||
        candidates.find((n) => n.code && codeForms(n.code).includes(g));
      return hit ? { node: hit } : { none: true };
    }
    const sq = squash(guess);
    const same = candidates.filter((n) => squash(n.title) === sq);
    if (same.length === 1) return { node: same[0] };

    const g = guessTokens(guess);
    if (!g.length) return { none: true };
    const fits = [];
    for (const n of candidates) {
      const f = fit(g, n.title);
      if (f) fits.push({ n, ...f });
    }
    if (!fits.length) return { none: true };
    if (fits.length === 1) return { node: fits[0].n };
    const full = fits.filter((f) => f.full);
    if (full.length === 1) return { node: full[0].n };
    // "accountant" fits Accountants and Auditors exactly, Accounting Clerks only
    // by inflection; the exact reading wins.
    const exact = fits.filter((f) => f.exact);
    if (exact.length === 1) return { node: exact[0].n };
    return { ambiguous: fits.map((f) => f.n) };
  }

  return { match, titleTokens, guessTokens, squash, isCode, sameCode };
});
