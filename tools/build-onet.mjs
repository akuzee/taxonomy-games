/* O*NET work activities → data/taxonomies/onet-wa.json
 *
 *   node tools/build-onet.mjs [--refresh]
 *
 * Sources: the O*NET 31.0 Database (USDOL/ETA, CC BY 4.0), https://www.onetcenter.org/database.html
 *   Content Model Reference.xlsx   names and descriptions down the 4.A (Work Activities) branch
 *   Tasks to DWAs.xlsx             which detailed work activity each task statement belongs to
 *
 * Hierarchy: 4 categories → 9 subcategories → 41 Generalized Work Activities →
 * 332 Intermediate → 2,087 Detailed. Element ids are the codes ("4.A.1.a.1").
 */
import { readSheet } from './xlsx.mjs';
import { cached, writeTaxonomy, clean } from './download.mjs';

const refresh = process.argv.includes('--refresh');
const VERSION = '31_0';
const BASE = `https://www.onetcenter.org/dl_files/database/db_${VERSION}_excel/`;
const modelFile = await cached(BASE + 'Content%20Model%20Reference.xlsx', 'onet_Content_Model_Reference.xlsx', { refresh });
const tasksFile = await cached(BASE + 'Tasks%20to%20DWAs.xlsx', 'onet_Tasks_to_DWAs.xlsx', { refresh });

const LEVELS = [
  { key: 'category', name: 'Category', plural: 'categories', default: false },
  { key: 'subcategory', name: 'Subcategory', plural: 'subcategories', default: false },
  { key: 'gwa', name: 'Generalized work activity', plural: 'generalized work activities', default: true },
  { key: 'iwa', name: 'Intermediate work activity', plural: 'intermediate work activities', default: true },
  { key: 'dwa', name: 'Detailed work activity', plural: 'detailed work activities', default: true },
];

// IWA and DWA names are written as sentences ("Review art or design materials.").
const title = (s) => clean(s).replace(/\.$/, '');
// Every id starts "4.A."; dropping it keeps codes short enough to read.
const code = (id) => id.slice(4);

const nodes = [];
const known = new Set();
for (const [id, name, desc] of readSheet(modelFile).slice(1)) {
  const parts = String(id).split('.');
  if (parts[0] !== '4' || parts[1] !== 'A' || parts.length < 3) continue;
  const level = parts.length - 3;
  const parent = level === 0 ? null : parts.slice(0, -1).join('.');
  if (parent && !known.has(parent)) throw new Error(`${id}: parent ${parent} not seen yet`);
  known.add(id);
  nodes.push([id, level, parent, title(name), code(id), clean(desc) || null]);
}

// A task can link to several DWAs, and File it needs one right answer, so only
// tasks with exactly one DWA become prompts (14k of 19k). The same sentence can
// appear under several occupations; it's kept once, and dropped if those
// occurrences disagree about its DWA.
const dwasOf = new Map();
const textOf = new Map();
for (const r of readSheet(tasksFile).slice(1)) {
  const [, , taskId, task, dwa] = r;
  if (!taskId) continue;
  if (!dwasOf.has(taskId)) dwasOf.set(taskId, new Set());
  dwasOf.get(taskId).add(clean(dwa));
  textOf.set(taskId, title(task));
}
const byText = new Map();
for (const [taskId, dwas] of dwasOf) {
  if (dwas.size !== 1) continue;
  const [dwa] = dwas;
  if (!known.has(dwa)) throw new Error(`task ${taskId} → unknown DWA ${dwa}`);
  const t = textOf.get(taskId);
  byText.set(t, byText.has(t) && byText.get(t) !== dwa ? null : dwa);
}
const terms = [...byText].filter(([, dwa]) => dwa).map(([t, dwa]) => [t, dwa]);
const EXAMPLE = 'Bake breads, rolls, or other pastries';
const example = terms.find(([t]) => t === EXAMPLE);
if (!example) throw new Error(`example task "${EXAMPLE}" not in the data`);

const counts = writeTaxonomy({
  id: 'onet-wa',
  name: 'O*NET work activities',
  label: 'Work activities',
  fullName: 'O*NET Work Activities (31.0)',
  subject: 'work activities',
  tagline: 'Every job is made of activities. Learn how they’re sorted.',
  blurb: 'O*NET breaks the work of every occupation into 2,087 detailed work activities, ' +
    'grouped into 332 intermediate and 41 generalized work activities. Write in the names ' +
    'from the top down, or take a real task statement and file it.',
  termNoun: 'O*NET task statement',
  termNounPlural: 'O*NET task statements',
  termExamples: ['Shampoo hair', 'Bathe patients'],
  pools: [
    { kind: 'titles', label: 'Task statements from O*NET occupations' },
    { kind: 'leaves', label: 'Detailed work activity names' },
    { kind: 'groups', label: 'Group names (you also pick the layer)' },
  ],
  defaultPool: ['titles', 'groups'],
  findPlaceholder: 'Find an activity: schedule, weld, negotiate…',
  // The map tiles are the 9 subcategories, so 41 GWAs fit on one screen as rows.
  boardLevels: ['subcategory', 'gwa', 'iwa', 'dwa'],
  catchAll: null,
  skipTermsByDefault: [],
  example: { term: EXAMPLE, node: example[1] },
  source: 'O*NET 31.0 Database by the U.S. Department of Labor, Employment and Training ' +
    'Administration (USDOL/ETA), used under the CC BY 4.0 license; modified here to keep only ' +
    'task statements linked to a single detailed work activity. O*NET® is a trademark of USDOL/ETA.',
  sourceUrl: 'https://www.onetcenter.org/database.html',
  levels: LEVELS,
  nodes,
  terms,
});
const expect = [4, 9, 41, 332, 2087];
if (counts.join() !== expect.join()) throw new Error(`level counts ${counts} ≠ ${expect}`);
