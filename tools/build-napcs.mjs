/* NAPCS Canada 2022 (products) → data/taxonomies/napcs-2022.json
 *
 *   node tools/build-napcs.mjs [--refresh]
 *
 * Sources: Statistics Canada, North American Product Classification System
 * (NAPCS) Canada 2022 Version 1.0, under the Statistics Canada Open Licence:
 * https://www.statcan.gc.ca/en/subjects/standard/napcs/2022/index
 *   structure CSV   158 groups → 515 classes → 1,477 subclasses → 3,049 details
 *   element CSV     45,661 example products, each under one detail (15,207 of
 *                   them flagged as the "illustrative" ones)
 *
 * Why Canada's version: the U.S. Census Bureau publishes only the trilateral
 * product codes and a concordance, without titles for the upper levels.
 */
import { readCsv } from './csv.mjs';
import { cached, writeTaxonomy, clean } from './download.mjs';

const refresh = process.argv.includes('--refresh');
const BASE = 'https://www.statcan.gc.ca/en/subjects/standard/standard/napcs/2022/index/';
const structFile = await cached(BASE + 'napcs-scpan-2022-structure-v1-eng.csv', 'napcs_structure.csv', { refresh });
const elemFile = await cached(BASE + 'napcs-scpan-2022-element-v1-eng.csv', 'napcs_element.csv', { refresh });


const LEVELS = [
  { key: 'family', name: 'Code family (map only)', plural: 'code families (map only)', default: false },
  { key: 'group', name: 'Group', plural: 'groups', default: true },
  { key: 'class', name: 'Class', plural: 'classes', default: true },
  { key: 'subclass', name: 'Subclass', plural: 'subclasses', default: true },
  { key: 'detail', name: 'Detailed product', plural: 'detailed products', default: true },
];
const LEVEL_OF = { Group: 1, Class: 2, Subclass: 3, Detail: 4 };

// NAPCS Canada starts at 158 groups — too many tiles for one map. Group codes'
// first digit clusters them, so the map tiles by it. These names are ours, not
// Statistics Canada's; the layer is off everywhere except the map.
const FAMILIES = {
  1: 'Farm, fish, forest, energy, mineral, and food products',
  2: 'Beverages, textiles, wood, paper, petroleum, chemicals, and plastics',
  3: 'Metals, machinery, electronics, appliances, and furniture',
  4: 'Vehicles, building materials, fabricated goods, publishing, and software',
  5: 'Transportation, trade, repair, and rental services',
  6: 'Construction, research, intellectual property, and production support',
  7: 'Information, finance, real estate, and professional services',
  8: 'Health, education, recreation, hospitality, and public services',
};

const nodes = [];
const known = new Set();
for (const [d, title] of Object.entries(FAMILIES)) {
  nodes.push([`F${d}`, 0, null, title, `${d}xx`,
    `An unofficial grouping of the NAPCS groups whose codes start with ${d}, used only to lay out the map.`]);
  known.add(`F${d}`);
}
for (const r of readCsv(structFile)) {
  const level = LEVEL_OF[r['Hierarchical structure']];
  const code = clean(r.Code);
  if (level === undefined || !code) continue;
  const parent = level === 1 ? `F${code[0]}` : clean(r.Parent);
  if (!known.has(parent)) throw new Error(`${code}: parent ${parent} not seen yet`);
  known.add(code);
  nodes.push([code, level, parent, clean(r['Code title']), code, clean(r['Code definition']) || null]);
}

// Examples are lowercase fragments ("live beef cows"); capitalize for display.
// One phrased identically under two details has no single answer and is dropped.
const found = new Map();
for (const r of readCsv(elemFile)) {
  const type = r['Element Type Label English'];
  if (type !== 'All examples' && !type.startsWith('Illustrative')) continue;
  const text = clean(r['Element Description English']);
  const code = clean(r.Code);
  if (!text || !known.has(code)) continue;
  const k = text.toLowerCase();
  if (!found.has(k)) found.set(k, { text: text[0].toUpperCase() + text.slice(1), codes: new Set(), flag: false });
  const f = found.get(k);
  f.codes.add(code);
  if (type.startsWith('Illustrative')) f.flag = true;
}
const terms = [...found.values()].filter((f) => f.codes.size === 1)
  .map((f) => (f.flag ? [f.text, [...f.codes][0], 1] : [f.text, [...f.codes][0]]));

const EXAMPLE = 'Live dairy cows';
const example = terms.find(([t]) => t === EXAMPLE);
if (!example) throw new Error(`example "${EXAMPLE}" not in the data`);

const counts = writeTaxonomy({
  id: 'napcs-2022',
  name: 'NAPCS Canada 2022',
  label: 'Products',
  fullName: 'North American Product Classification System, Canada 2022 v1.0',
  subject: 'products',
  tagline: 'Everything a business sells has a product code. Learn where it goes.',
  blurb: 'NAPCS sorts every good and service an economy produces into 3,049 detailed products, ' +
    'inside 1,477 subclasses, 515 classes, and 158 groups. Write in the names from the top down, ' +
    'or take an example product and file it.',
  termNoun: 'NAPCS example product',
  termNounPlural: 'NAPCS example products',
  termExamples: ['Live dairy cows', 'Wheat flour tortilla shells'],
  termSets: [{ key: 'examples', noun: 'NAPCS example product', nounPlural: 'NAPCS example products' }],
  pools: [
    { kind: 'examples*', label: 'Illustrative example products' },
    { kind: 'examples', label: 'Every example product' },
    { kind: 'leaves', label: 'Detailed product names' },
    { kind: 'groups', label: 'Group names (you also pick the layer)' },
  ],
  defaultPool: ['examples*', 'groups'],
  findPlaceholder: 'Find a product: bicycles, dairy cows, tax preparation…',
  boardLevels: ['family', 'group', 'class', 'subclass'],
  catchAll: '^(Other|All other) ',
  skipTermsByDefault: [],
  example: { term: EXAMPLE, node: example[1] },
  source: 'Adapted from Statistics Canada, North American Product Classification System (NAPCS) Canada ' +
    '2022 Version 1.0, under the Statistics Canada Open Licence. This does not constitute an endorsement ' +
    'by Statistics Canada of this product. The map’s eight code families are our own grouping.',
  sourceUrl: 'https://www.statcan.gc.ca/en/subjects/standard/napcs/2022/index',
  levels: LEVELS,
  nodes,
  terms,
});
const expect = [8, 158, 515, 1477, 3049];
if (counts.join() !== expect.join()) throw new Error(`level counts ${counts} ≠ ${expect}`);
