/* Node tests against the real data: taxonomy invariants, view logic, and the
 * write-in matcher's calibration set. Run after touching js/taxonomy.js,
 * js/match.js, or a build script.   node tools/test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const Tax = require('../js/taxonomy.js');
const Match = require('../js/match.js');

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('  ✗ ' + msg); } };

const raw = JSON.parse(fs.readFileSync(path.join(root, 'data/taxonomies/soc-2018.json'), 'utf8'));
const tax = Tax.index(raw);
const L = (key) => tax.levelKeys.indexOf(key);

console.log('taxonomy');
{
  const all = Tax.view(tax, { levels: tax.levelKeys });
  check(tax.levels.map((_, i) => all.atLevel(i).length).join() === '6,13,23,98,459,867', 'level counts');
  check(tax.terms.every((t) => tax.byId.get(t.id)?.children.length === 0), 'every term points at a leaf');
  const para = all.path(tax.byId.get('23-2011')).map((n) => n.id).join(' > ');
  check(para === 'H1 > I3 > 23-0000 > 23-2000 > 23-2010 > 23-2011', 'paralegal path: ' + para);

  // Skipping a level re-parents its children onto the nearest kept ancestor.
  const v = Tax.view(tax, { levels: ['high', 'major', 'detailed'] });
  check(v.parent(tax.byId.get('23-2011')).id === '23-0000', 'detailed → major when minor/broad skipped');
  check(v.children(tax.byId.get('H1')).length === 10, 'H1 has 10 majors when intermediate skipped');
  check(v.resolve('23-2011').id === '23-2011', 'resolve in view');

  const legal = Tax.view(tax, { scope: '23-0000' });
  check(legal.levels.join() === [L('minor'), L('broad'), L('detailed')].join(), 'scoped levels');
  check(legal.resolve('11-1011') === null, 'out-of-scope term resolves to null');
  check(Tax.view(tax, { levels: ['high', 'major'] }).resolve('23-2011').id === '23-0000', 'resolve up to major');

  // Every view lists children alphabetically (DECISIONS.md §10).
  const sorted = (list) => list.every((n, i) => !i || list[i - 1].title.localeCompare(n.title) <= 0);
  const dv = Tax.view(tax);
  check(dv.nodes.every((n) => sorted(dv.children(n))) && sorted(dv.children(dv.root)), 'children alphabetical');
  check(dv.children(dv.root)[0].title === 'Architecture and Engineering Occupations', 'first major alphabetically');
  check(Tax.view(tax, { order: 'code' }).children(dv.root)[0].id === '11-0000', 'code order on request');

  const pool = Tax.promptPool(Tax.view(tax), { kinds: ['illustrative', 'groups'], skip: ['H6'] });
  check(!pool.some((p) => p.target.id.startsWith('55-')), 'military skipped');
  const groups = pool.flatMap((p) => p.terms.filter((t) => t.kind === 'group').map(() => p.target));
  check(groups.every((g) => Tax.view(tax).children(g).length >= 2), 'no pass-through group prompts');
  console.log(`  default pool: ${pool.length} targets, ${groups.length} of them group names`);
}

console.log('matcher');
{
  // [level, guess, expected id | 'ambiguous' | null, scope?]
  const cases = [
    ['high', 'service', 'H2'],
    ['high', 'sales and office', 'H3'],
    ['high', 'military', 'H6'],
    ['high', 'production', 'H5'],
    ['high', 'natural resources construction maintenance', 'H4'],
    ['high', 'management business science arts', 'H1'],
    ['major', 'legal', '23-0000'],
    ['major', 'law', null],
    ['major', 'healthcare', 'ambiguous'],
    ['major', 'healthcare support', '31-0000'],
    ['major', 'healthcare practitioners', '29-0000'],
    ['major', 'computer and math', '15-0000'],
    ['major', 'it', '15-0000'],
    ['major', 'protective service', '33-0000'],
    ['major', 'service', 'ambiguous'],
    ['major', 'food prep', '35-0000'],
    ['major', 'office and admin support', '43-0000'],
    ['major', 'architecture and engineering', '17-0000'],
    ['major', 'engineering', '17-0000'],
    ['major', 'education', '25-0000'],
    ['major', 'educational instruction and library', '25-0000'],
    ['major', 'arts design entertainment sports media', '27-0000'],
    ['major', 'life physical social science', '19-0000'],
    ['major', 'farming fishing forestry', '45-0000'],
    ['major', 'sales', '41-0000'],
    ['major', 'transportation', '53-0000'],
    ['major', '23', '23-0000'],
    ['major', 'managment', '11-0000'],
    ['minor', 'legal support', '23-2000', '23-0000'],
    ['minor', 'lawyers judges', '23-1000', '23-0000'],
    ['minor', 'lawyers', '23-1000', '23-0000'],
    ['minor', 'teachers', 'ambiguous', '25-0000'],
    ['minor', 'postsecondary teachers', '25-1000', '25-0000'],
    ['detailed', 'paralegals', '23-2011'],
    ['detailed', 'paralegal', '23-2011'],
    ['detailed', 'paralegel', '23-2011'],
    ['detailed', 'lawyers', '23-1011'],
    ['detailed', 'nurse', 'ambiguous'],
    ['detailed', 'registered nurses', '29-1141'],
    ['detailed', 'rn', '29-1141'],
    ['detailed', 'nurse practitioner', '29-1171'],
    ['detailed', 'software developers', '15-1252'],
    ['detailed', 'computer programmer', '15-1251'],
    ['detailed', 'physician', 'ambiguous'],
    ['detailed', 'physicists', '19-2012'],
    ['detailed', 'secretaries and administrative assistants', '43-6014'],
    ['detailed', 'cashier', '41-2011'],
    ['detailed', 'retail salespersons', '41-2031'],
    ['detailed', 'barbers', '39-5011'],
    ['detailed', 'chefs', '35-1011'],
    ['detailed', 'chief executives', '11-1011'],
    ['detailed', 'ceo', '11-1011'],
    ['detailed', 'accountant', '13-2011'],
    ['detailed', 'manager', 'ambiguous'],
    ['detailed', 'engineer', 'ambiguous'],
    ['detailed', 'zzz', null],
    ['detailed', '23-2011', '23-2011'],
    ['broad', 'paralegals', '23-2010'],
  ];
  const views = new Map();
  for (const [level, guess, want, scope] of cases) {
    const key = scope || '';
    if (!views.has(key)) views.set(key, Tax.view(tax, { scope, levels: tax.levelKeys }));
    const v = views.get(key);
    const cands = v.atLevel(L(level)).filter((n) => !tax.isCatchAll(n));
    const r = Match.match(guess, cands);
    const got = r.node ? r.node.id : r.ambiguous ? 'ambiguous' : null;
    const show = r.node ? `${r.node.id} ${r.node.title}` : r.ambiguous ? `ambiguous (${r.ambiguous.length})` : 'no match';
    check(got === want, `${level} "${guess}" → ${show}, wanted ${want}`);
  }
  console.log(`  ${cases.length} cases`);
}

// ---------- every taxonomy: shape and the fields the UI reads ----------
const EXPECT = {
  'soc-2018': [6, 13, 23, 98, 459, 867],
  'naics-2022': [20, 96, 308, 689, 1012],
  'onet-wa': [4, 9, 41, 332, 2087],
  'napcs-2022': [8, 158, 515, 1477, 3049],
  'cip-2020': [50, 464, 2173],
};
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/index.json'), 'utf8'));
const taxes = {};
for (const entry of catalog.taxonomies) {
  console.log(entry.id);
  const t = Tax.index(JSON.parse(fs.readFileSync(path.join(root, entry.file), 'utf8')));
  taxes[t.id] = t;
  const all = Tax.view(t, { levels: t.levelKeys });
  check(t.levels.map((_, i) => all.atLevel(i).length).join() === EXPECT[t.id].join(), `${t.id} level counts`);
  check(t.terms.every((x) => t.byId.get(x.id)?.children.length === 0), `${t.id}: every term points at a leaf`);
  for (const f of ['label', 'tagline', 'termNoun', 'termNounPlural', 'pools', 'defaultPool', 'boardLevels', 'findPlaceholder', 'example']) {
    check(t[f] != null, `${t.id}: has ${f}`);
  }
  check(t.boardLevels.every((k) => t.levelKeys.includes(k)), `${t.id}: board levels exist`);
  const ex = t.byId.get(t.example.node);
  check(ex && t.terms.some((x) => x.text === t.example.term && x.id === ex.id), `${t.id}: example term resolves`);
  const pool = Tax.promptPool(Tax.view(t), { kinds: t.defaultPool, skip: t.skipTermsByDefault || [] });
  for (const { kind } of t.pools) {
    const n = Tax.promptPool(Tax.view(t), { kinds: [kind] }).length;
    check(n > 0, `${t.id}: pool "${kind}" is empty`);
  }
  check(pool.length > 100, `${t.id}: default pool has targets (${pool.length})`);
  console.log(`  ${t.terms.length.toLocaleString()} terms, default pool ${pool.length} targets`);
}

console.log('matcher, other taxonomies');
{
  const cases = [
    ['naics-2022', 'sector', 'manufacturing', '31-33'],
    ['naics-2022', 'sector', 'retail', '44-45'],
    ['naics-2022', 'sector', 'construction', '23'],
    ['naics-2022', 'sector', 'professional scientific technical', '54'],
    ['naics-2022', 'sector', 'health care', '62'],
    ['naics-2022', 'sector', '31', '31-33'],
    ['naics-2022', 'sector', '72', '72'],
    ['naics-2022', 'subsector', 'food services and drinking places', '722'],
    ['naics-2022', 'national', '722515', '722515'],
    ['naics-2022', 'national', 'snack bars', '722515'],
    ['naics-2022', 'group', 'oilseed and grain farming', '1111'],
    ['onet-wa', 'gwa', 'getting information', '4.A.1.a.1'],
    ['onet-wa', 'gwa', 'thinking creatively', '4.A.2.b.2'],
    ['onet-wa', 'gwa', '1.a.1', '4.A.1.a.1'],
    ['onet-wa', 'gwa', 'information', 'ambiguous'],
    ['napcs-2022', 'group', 'live animals', '111'],
    ['napcs-2022', 'group', 'coffee and tea', '191'],
    ['cip-2020', 'series', 'legal', '22'],
    ['cip-2020', 'series', '51', '51'],
    ['cip-2020', 'program', '48.0508', '48.0508'],
    ['cip-2020', 'program', 'welder', '48.0508'],
    ['cip-2020', 'program', 'welding', 'ambiguous'],
  ];
  const views = new Map();
  for (const [id, level, guess, want] of cases) {
    const t = taxes[id];
    if (!views.has(id)) views.set(id, Tax.view(t, { levels: t.levelKeys }));
    const cands = views.get(id).atLevel(t.levelKeys.indexOf(level)).filter((n) => !t.isCatchAll(n));
    const r = Match.match(guess, cands);
    const got = r.node ? r.node.id : r.ambiguous ? 'ambiguous' : null;
    const show = r.node ? `${r.node.id} ${r.node.title}` : r.ambiguous ? `ambiguous (${r.ambiguous.length})` : 'no match';
    check(got === want, `${id} ${level} "${guess}" → ${show}, wanted ${want}`);
  }
  console.log(`  ${cases.length} cases`);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
