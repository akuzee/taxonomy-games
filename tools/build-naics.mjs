/* NAICS 2022 → data/taxonomies/naics-2022.json
 *
 *   node tools/build-naics.mjs [--refresh]
 *
 * Sources (U.S. Census Bureau, public domain), https://www.census.gov/naics/
 *   2-6 digit_2022_Codes.xlsx       every code and title
 *   2022_NAICS_Descriptions.xlsx    the definition of each code
 *   2022_NAICS_Index_File.xlsx      20k business descriptions → one 6-digit code each
 */
import { readSheet } from './xlsx.mjs';
import { cached, writeTaxonomy, clean } from './download.mjs';

const refresh = process.argv.includes('--refresh');
const BASE = 'https://www.census.gov/naics/2022NAICS/';
const codesFile = await cached(BASE + '2-6%20digit_2022_Codes.xlsx', 'naics_2-6_digit_2022_Codes.xlsx', { refresh });
const descFile = await cached(BASE + '2022_NAICS_Descriptions.xlsx', 'naics_2022_NAICS_Descriptions.xlsx', { refresh });
const indexFile = await cached(BASE + '2022_NAICS_Index_File.xlsx', 'naics_2022_NAICS_Index_File.xlsx', { refresh });

const LEVELS = [
  { key: 'sector', name: 'Sector', plural: 'sectors', default: true },
  { key: 'subsector', name: 'Subsector', plural: 'subsectors', default: true },
  { key: 'group', name: 'Industry group', plural: 'industry groups', default: true },
  { key: 'industry', name: 'NAICS industry', plural: 'NAICS industries', default: true },
  { key: 'national', name: 'National industry', plural: 'national industries', default: true },
];

// A definition is the first real paragraph: sectors open with a "The Sector as a
// Whole" heading, and most then run on into illustrative examples and
// cross-references that don't belong on a card.
function definition(text) {
  const paras = String(text ?? '').split(/\n\s*\n/).map(clean).filter(Boolean);
  const p = paras.find((x) => x.length > 60 && !/^See industry description/i.test(x));
  if (!p) return null;
  if (p.length <= 420) return p;
  const cut = p.slice(0, 420);
  return cut.slice(0, cut.lastIndexOf('. ') + 1) || cut + '…';
}

const descs = new Map();
for (const [code, , text] of readSheet(descFile).slice(1)) if (code) descs.set(clean(code), definition(text));

const nodes = [];
const byCode = new Map();
const sectorOf = new Map();   // two-digit prefix → sector code ('31' → '31-33')
for (const r of readSheet(codesFile).slice(1)) {
  const code = clean(r[1]);
  const title = clean(r[2]).replace(/T$/, '');
  if (!code || !title) continue;
  const digits = code.includes('-') ? 2 : code.length;
  const level = digits - 2;
  let parent = null;
  if (level === 0) {
    const [a, b = a] = code.split('-').map(Number);
    for (let x = a; x <= b; x++) sectorOf.set(String(x), code);
  } else {
    parent = level === 1 ? sectorOf.get(code.slice(0, 2)) : code.slice(0, digits - 1);
    if (!byCode.has(parent)) throw new Error(`${code}: parent ${parent} not seen yet`);
  }
  const node = [code, level, parent, title, code, descs.get(code) || null];
  nodes.push(node);
  byCode.set(code, node);
}

const terms = [];
const seen = new Set();
for (const [code, text] of readSheet(indexFile).slice(1)) {
  const c = clean(code);
  const t = clean(text);
  // "******" rows are cross-reference stubs ("Consultants -- see specific activity").
  if (!/^\d{6}$/.test(c) || !t || seen.has(t.toLowerCase())) continue;
  if (!byCode.has(c)) throw new Error(`index entry "${t}" → unknown code ${c}`);
  seen.add(t.toLowerCase());
  terms.push([t[0].toUpperCase() + t.slice(1), c]);
}

const counts = writeTaxonomy({
  id: 'naics-2022',
  name: 'NAICS 2022',
  label: 'Industries',
  fullName: 'North American Industry Classification System (2022)',
  subject: 'industries',
  tagline: 'Every business has an industry code. Learn where they file.',
  blurb: 'NAICS sorts every business establishment into one of 1,012 national industries, ' +
    'inside 689 NAICS industries, 308 industry groups, 96 subsectors, and 20 sectors. ' +
    'Write in the names from the top down, or take a business and file it.',
  termNoun: 'NAICS index entry',
  termNounPlural: 'NAICS index entries',
  termExamples: ['Coffee shops, on premise brewing', 'Ski resorts without accommodations'],
  pools: [
    { kind: 'titles', label: 'Census index entries (businesses and products)' },
    { kind: 'leaves', label: 'National industry names' },
    { kind: 'groups', label: 'Group names (you also pick the layer)' },
  ],
  defaultPool: ['titles', 'groups'],
  findPlaceholder: 'Find a business: coffee shops, ski resorts, sawmills…',
  boardLevels: ['sector', 'subsector', 'group', 'industry'],
  catchAll: '^All Other ',
  skipTermsByDefault: [],
  example: { term: 'Coffee shops, on premise brewing', node: '722515' },
  source: 'U.S. Census Bureau — 2022 NAICS codes, descriptions, and index file.',
  sourceUrl: 'https://www.census.gov/naics/',
  levels: LEVELS,
  nodes,
  terms,
});
const expect = [20, 96, 308, 689, 1012];
if (counts.join() !== expect.join()) throw new Error(`level counts ${counts} ≠ ${expect}`);
if (!terms.some(([t, c]) => t === 'Coffee shops, on premise brewing' && c === '722515')) throw new Error('example term missing');
