/* CIP 2020 (education programs) → data/taxonomies/cip-2020.json
 *
 *   node tools/build-cip.mjs [--refresh]
 *
 * Source: NCES, Classification of Instructional Programs 2020 (public domain),
 * https://nces.ed.gov/ipeds/cipcode/ — one CSV with every 2-, 4-, and 6-digit
 * code, its definition, and (for some programs) example program names.
 */
import { readCsv } from './csv.mjs';
import { cached, writeTaxonomy, clean } from './download.mjs';

const refresh = process.argv.includes('--refresh');
const file = await cached('https://nces.ed.gov/ipeds/cipcode/Files/CIPCode2020.csv', 'cip2020.csv', { refresh });


const LEVELS = [
  { key: 'series', name: 'Series', plural: 'series', default: true },
  { key: 'group', name: 'Program group', plural: 'program groups', default: true },
  { key: 'program', name: 'Program', plural: 'programs', default: true },
];

// 2-digit series titles are in capitals ("LEGAL PROFESSIONS AND STUDIES").
const SMALL = new Set(['and', 'or', 'of', 'the', 'in', 'for', 'to', 'with', 'a', 'an', 'on', 'at', 'by']);
const titleCase = (s) => s.toLowerCase().replace(/[a-z][a-z'’]*/g, (w, i) =>
  (i > 0 && SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1)));
const fixTitle = (s) => {
  const t = clean(s).replace(/\.$/, '');
  return t === t.toUpperCase() ? titleCase(t).replace(/\(([a-z]+)\)/gi, (m, w) => `(${w.toUpperCase()})`) : t;
};

const nodes = [];
const known = new Set();
const terms = [];
const seen = new Map();
const code = (r) => clean(r.CIPCode).replace(/^="?|"$/g, '');
// "Moved from" rows are the retired old codes ("Moved from 45.1401 to 45.1103");
// the code they moved to is a "Moved to" row and is live, as are new ones.
// Moved codes can also sit out of order, so parents are linked after sorting.
const live = readCsv(file).filter((r) => code(r) && !/^(Deleted|Moved from)/i.test(clean(r.Action)))
  .sort((a, b) => code(a).localeCompare(code(b)));
for (const r of live) {
  const c = code(r);
  const level = c.length === 2 ? 0 : c.length === 5 ? 1 : 2;
  const parent = level === 0 ? null : c.slice(0, level === 1 ? 2 : 5);
  if (parent && !known.has(parent)) throw new Error(`${c}: parent ${parent} not seen yet`);
  known.add(c);
  const def = clean(r.CIPDefinition);
  nodes.push([c, level, parent, fixTitle(r.CIPTitle), c,
    def && !/^Instructional content is defined in code/i.test(def) ? def : null]);
  // "Examples: - Agroecology, - Sustainable Agriculture, - Organic Farming"
  for (const ex of clean(r.Examples).replace(/^Examples:\s*/i, '').split(/(?:^|,)\s*-\s+/)) {
    const t = clean(ex).replace(/[.,]$/, '');
    if (!t) continue;
    const k = t.toLowerCase();
    seen.set(k, seen.has(k) ? null : [t, c]);
  }
}
for (const v of seen.values()) if (v) terms.push(v);

const EXAMPLE = 'Arc Welding';
const example = terms.find(([t]) => t === EXAMPLE);
if (!example) throw new Error(`example "${EXAMPLE}" not in the data`);

const counts = writeTaxonomy({
  id: 'cip-2020',
  name: 'CIP 2020',
  label: 'Education programs',
  fullName: 'Classification of Instructional Programs (2020)',
  subject: 'instructional programs',
  tagline: 'Every course of study has a CIP code. Learn where it files.',
  blurb: `CIP sorts every postsecondary program of study into ${'{programs}'} six-digit programs, ` +
    `inside ${'{groups}'} program groups and ${'{series}'} two-digit series. Write in the names from the ` +
    'top down, or take a program and file it.',
  termNoun: 'CIP example program name',
  termNounPlural: 'CIP example program names',
  fileNoun: 'program name',
  termExamples: ['Arc Welding', 'Agroeconomics'],
  termSets: [{ key: 'examples', noun: 'CIP example program name', nounPlural: 'CIP example program names' }],
  pools: [
    { kind: 'leaves', label: 'Program names' },
    { kind: 'examples', label: 'NCES example program names' },
    { kind: 'groups', label: 'Group names (you also pick the layer)' },
  ],
  defaultPool: ['leaves', 'examples', 'groups'],
  findPlaceholder: 'Find a program: nursing, welding, linguistics…',
  boardLevels: ['series', 'group', 'program'],
  catchAll: ', Other$',
  skipTermsByDefault: [],
  example: { term: EXAMPLE, node: example[1] },
  source: 'U.S. Department of Education, National Center for Education Statistics — Classification of ' +
    'Instructional Programs (CIP) 2020.',
  sourceUrl: 'https://nces.ed.gov/ipeds/cipcode/',
  levels: LEVELS,
  nodes,
  terms,
}, (tax, counts) => {
  tax.blurb = tax.blurb.replace('{programs}', counts[2].toLocaleString('en-US'))
    .replace('{groups}', counts[1]).replace('{series}', counts[0]);
});
console.log(`  ${terms.length} example terms`);
