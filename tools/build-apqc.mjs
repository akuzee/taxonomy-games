/* APQC Process Classification Framework → data/taxonomies/apqc-pcf.json
 *
 *   node tools/build-apqc.mjs [path/to/PCF.xlsx]
 *
 * Source: APQC Process Classification Framework (PCF), Cross-Industry, Excel
 * version 7.4 (https://www.apqc.org/pcf). The download needs a free APQC
 * account, so it can't be fetched here: save it as
 *   tools/cache/apqc_pcf_cross_industry_7.4.xlsx
 * or pass its path.
 *
 * License: the workbook's "Copyright and attribution" notice grants a perpetual,
 * worldwide, royalty-free license to use, copy, publish, modify, and create
 * derivative works, "provided that all copies of the PCF and any derivative
 * works contain a copy of this notice". The notice is read out of the workbook
 * (it lives in a text box, not a cell) and stored verbatim in the data file,
 * and the home page shows it with the Business processes tab.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readSheet } from './xlsx.mjs';
import { cache, writeTaxonomy, clean } from './download.mjs';

const file = process.argv[2] || path.join(cache, 'apqc_pcf_cross_industry_7.4.xlsx');
if (!fs.existsSync(file)) {
  throw new Error(`${file} not found. Download the cross-industry PCF Excel from apqc.org/pcf ` +
    '(free account) and save it there.');
}

// The notice is a drawing's text box; find the paragraph that starts with ©.
function notice() {
  const entries = execFileSync('unzip', ['-Z1', file]).toString().split('\n').filter((e) => /^xl\/drawings\/drawing\d+\.xml$/.test(e));
  for (const e of entries) {
    const xml = execFileSync('unzip', ['-p', file, e], { maxBuffer: 64 << 20 }).toString('utf8');
    for (const [, p] of xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)) {
      const text = [...p.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]).join('')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
      // The heading and the notice share a paragraph, split by a line break.
      const line = text.split(/\r?\n/).find((l) => l.trim().startsWith('©') && /APQC/.test(l));
      if (line) return clean(line);
    }
  }
  throw new Error('copyright notice not found in the workbook; refusing to build without it');
}
const NOTICE = notice();

// Sheets in workbook order: …, "Combined" (every element), "Metrics".
const sheets = execFileSync('unzip', ['-p', file, 'xl/workbook.xml']).toString().match(/<sheet [^>]*name="[^"]+"/g)
  .map((s) => /name="([^"]+)"/.exec(s)[1]);
const sheetNo = (name) => {
  const i = sheets.indexOf(name);
  if (i < 0) throw new Error(`sheet "${name}" missing`);
  return i + 1;
};
const combined = readSheet(file, sheetNo('Combined'));
const metrics = readSheet(file, sheetNo('Metrics'));
if (combined[0][1] !== 'Hierarchy ID' || metrics[0][1] !== 'Hierarchy ID') throw new Error('unexpected sheet layout');

const LEVELS = [
  { key: 'category', name: 'Category', plural: 'categories', default: true },
  { key: 'group', name: 'Process group', plural: 'process groups', default: true },
  { key: 'process', name: 'Process', plural: 'processes', default: true },
  { key: 'activity', name: 'Activity', plural: 'activities', default: true },
  { key: 'task', name: 'Task', plural: 'tasks', default: true },
];

// Hierarchy IDs: categories are "9.0", their process groups "9.1", then "9.1.1"…
const levelOf = (h) => (/^\d+\.0$/.test(h) ? 0 : h.split('.').length - 1);
const parentOf = (h) => {
  const parts = h.split('.');
  if (/^\d+\.0$/.test(h)) return null;
  return parts.length === 2 ? `${parts[0]}.0` : parts.slice(0, -1).join('.');
};

const nodes = [];
const known = new Set();
for (const r of combined.slice(1)) {
  const h = clean(r[1]);
  if (!h) continue;
  const parent = parentOf(h);
  if (parent && !known.has(parent)) throw new Error(`${h}: parent ${parent} not seen yet`);
  known.add(h);
  nodes.push([h, levelOf(h), parent, clean(r[2]), h, clean(r[6]) || null]);
}

// Benchmark metrics, each attached to one process element at any level.
const terms = [];
for (const r of metrics.slice(1)) {
  const h = clean(r[1]);
  const name = clean(r[5]);
  if (name && known.has(h)) terms.push([name, h]);
}

const EXAMPLE = 'Identify competitors';
const exNode = nodes.find((n) => n[3] === EXAMPLE);
if (!exNode) throw new Error(`example "${EXAMPLE}" missing`);

const counts = writeTaxonomy({
  id: 'apqc-pcf',
  name: 'APQC PCF 7.4',
  label: 'Business processes',
  fullName: 'APQC Process Classification Framework, Cross-Industry (7.4)',
  subject: 'business processes',
  tagline: 'Everything a company does, filed by process. Learn the map.',
  blurb: 'APQC’s Process Classification Framework sorts the work of any organization into 13 ' +
    'categories, 72 process groups, 350 processes, and over a thousand activities and tasks. Write ' +
    'in the names from the top down, or take an activity and file it.',
  termNoun: 'APQC benchmark metric',
  termNounPlural: 'APQC benchmark metrics',
  fileNoun: 'process, activity, or task',
  termExamples: ['Identify competitors', 'Generate sales forecast'],
  // Metrics measure elements at every level, so this set files onto groups too.
  termSets: [{ key: 'metrics', noun: 'APQC benchmark metric', nounPlural: 'APQC benchmark metrics', long: true, onGroups: true }],
  pools: [
    { kind: 'leaves', label: 'The most detailed processes, activities, and tasks' },
    { kind: 'groups', label: 'Group names (you also pick the layer)' },
    { kind: 'metrics', label: 'APQC benchmark metrics (filed on the element they measure)' },
  ],
  defaultPool: ['leaves', 'groups'],
  findPlaceholder: 'Find a process: invoice, recruit, forecast…',
  boardLevels: ['category', 'group', 'process', 'activity'],
  catchAll: null,
  skipTermsByDefault: [],
  example: { term: EXAMPLE, node: exNode[0] },
  // Shown verbatim on the home page, as the license requires.
  source: NOTICE,
  notice: NOTICE,
  sourceUrl: 'https://www.apqc.org/pcf',
  levels: LEVELS,
  nodes,
  terms,
});
console.log(`  notice: ${NOTICE.slice(0, 70)}…`);
const expect = [13, 72, 350, 1297, 189];
if (counts.join() !== expect.join()) throw new Error(`level counts ${counts} ≠ ${expect}`);
