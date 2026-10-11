/* SOC 2018 → data/taxonomies/soc-2018.json
 *
 *   node tools/build-soc.mjs            download (cached) + emit
 *   node tools/build-soc.mjs --refresh  re-download the BLS files first
 *
 * Sources (all U.S. Bureau of Labor Statistics, public domain):
 *   soc_2018_definitions.xlsx           every node, code, title, and definition
 *   soc_2018_direct_match_title_file.xlsx  6,520 job titles → one detailed occupation each
 *   soc_2018_manual.pdf tables 5 & 6    the intermediate and high-level aggregations
 *                                       above major groups (hand-copied below)
 *
 * Plus three more term sets from the O*NET 31.0 Database (USDOL/ETA, CC BY 4.0):
 *   Sample of Reported Titles.xlsx   titles workers reported (flag: shown in My Next Move)
 *   Job Titles.xlsx                  O*NET's full job-title list
 *   Task Statements.xlsx             what each occupation does
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSheet } from './xlsx.mjs';
import { cached } from './download.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cache = path.join(root, 'tools/cache');
const out = path.join(root, 'data/taxonomies/soc-2018.json');
const BASE = 'https://www.bls.gov/soc/2018/';
const FILES = ['soc_2018_definitions.xlsx', 'soc_2018_direct_match_title_file.xlsx'];

// bls.gov answers 403 "Access Denied" to anything that doesn't look like a browser
// navigation — a User-Agent alone isn't enough, the Sec-Fetch-* headers matter too.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-Dest': 'document',
  'Upgrade-Insecure-Requests': '1',
};

async function download(refresh) {
  fs.mkdirSync(cache, { recursive: true });
  for (const f of FILES) {
    const dest = path.join(cache, f);
    if (fs.existsSync(dest) && !refresh) continue;
    const res = await fetch(BASE + f, { headers: BROWSER_HEADERS });
    const buf = Buffer.from(await res.arrayBuffer());
    // A blocked request still comes back as a small HTML page; never cache that.
    if (!res.ok || buf.subarray(0, 2).toString() !== 'PK') {
      throw new Error(`${f}: HTTP ${res.status} — BLS blocked the request (see BROWSER_HEADERS)`);
    }
    fs.writeFileSync(dest, buf);
    console.log(`downloaded ${f} (${(buf.length / 1024).toFixed(0)} KB)`);
  }
}

// SOC 2018 manual, table 6 (high-level) and table 5 (intermediate). Major-group
// ranges are inclusive two-digit prefixes.
const HIGH = [
  ['H1', 'Management, Business, Science, and Arts Occupations', 11, 29],
  ['H2', 'Service Occupations', 31, 39],
  ['H3', 'Sales and Office Occupations', 41, 43],
  ['H4', 'Natural Resources, Construction, and Maintenance Occupations', 45, 49],
  ['H5', 'Production, Transportation, and Material Moving Occupations', 51, 53],
  ['H6', 'Military Specific Occupations', 55, 55],
];
const INTERMEDIATE = [
  ['I1', 'Management, Business, and Financial Occupations', 11, 13],
  ['I2', 'Computer, Engineering, and Science Occupations', 15, 19],
  ['I3', 'Education, Legal, Community Service, Arts, and Media Occupations', 21, 27],
  ['I4', 'Healthcare Practitioners and Technical Occupations', 29, 29],
  ['I5', 'Service Occupations', 31, 39],
  ['I6', 'Sales and Related Occupations', 41, 41],
  ['I7', 'Office and Administrative Support Occupations', 43, 43],
  ['I8', 'Farming, Fishing, and Forestry Occupations', 45, 45],
  ['I9', 'Construction and Extraction Occupations', 47, 47],
  ['I10', 'Installation, Maintenance, and Repair Occupations', 49, 49],
  ['I11', 'Production Occupations', 51, 51],
  ['I12', 'Transportation and Material Moving Occupations', 53, 53],
  ['I13', 'Military Specific Occupations', 55, 55],
];

const LEVELS = [
  { key: 'high', name: 'High-level group', plural: 'high-level groups', default: false },
  { key: 'intermediate', name: 'Intermediate group', plural: 'intermediate groups', default: false },
  { key: 'major', name: 'Major group', plural: 'major groups', default: true },
  { key: 'minor', name: 'Minor group', plural: 'minor groups', default: true },
  { key: 'broad', name: 'Broad occupation', plural: 'broad occupations', default: true },
  { key: 'detailed', name: 'Detailed occupation', plural: 'detailed occupations', default: true },
];
const LEVEL_OF = { Major: 2, Minor: 3, Broad: 4, Detailed: 5 };

const range = (a, b) => (a === b ? String(a) : `${a}–${b}`);
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

function emit(onet) {
  const defRows = readSheet(path.join(cache, 'soc_2018_definitions.xlsx'));
  const header = defRows.findIndex((r) => r[0] === 'SOC Group');
  const nodes = [];
  const parentAt = [];

  const inRange = (major, [, , a, b]) => major >= a && major <= b;
  for (const h of HIGH) nodes.push([h[0], 0, null, h[1], range(h[2], h[3]), null]);
  for (const i of INTERMEDIATE) {
    const h = HIGH.find((x) => inRange(i[2], x));
    nodes.push([i[0], 1, h[0], i[1], range(i[2], i[3]), null]);
  }

  // Parent links come from row order, not code arithmetic: minor groups like
  // 15-1200 and 51-5100 break the XX-X000 pattern.
  for (const r of defRows.slice(header + 1)) {
    const [group, code, title, def] = r.map(clean);
    if (!code) continue;
    const level = LEVEL_OF[group];
    if (level === undefined) throw new Error(`unknown SOC group "${group}" at ${code}`);
    let parent;
    if (level === 2) parent = INTERMEDIATE.find((x) => inRange(+code.slice(0, 2), x))[0];
    else parent = parentAt[level - 1];
    parentAt[level] = code;
    nodes.push([code, level, parent, title, code, def || null]);
  }

  const dmtRows = readSheet(path.join(cache, 'soc_2018_direct_match_title_file.xlsx'));
  const dHeader = dmtRows.findIndex((r) => r[0] === '2018 SOC Code');
  const known = new Set(nodes.map((n) => n[0]));
  const terms = [];
  for (const r of dmtRows.slice(dHeader + 1)) {
    const [code, , title, illustrative] = r.map(clean);
    if (!code) continue;
    if (!known.has(code)) throw new Error(`direct match title "${title}" → unknown code ${code}`);
    // BLS flags ~2,400 titles as the illustrative examples printed with each
    // definition; they're the recognizable ones, so they make the "common" pool.
    terms.push(illustrative === 'x' ? [title, code, 1] : [title, code]);
  }

  // O*NET keys everything by O*NET-SOC codes like 11-1011.03, whose first seven
  // characters are the SOC 2018 detailed occupation. A text listed under two
  // different occupations has no single right answer and is dropped; a text
  // already in an earlier set isn't repeated.
  const taken = new Set(terms.map(([t]) => t.toLowerCase()));
  function addSet(file, setIdx, textCol, isFlagged = () => false) {
    const found = new Map();
    for (const r of readSheet(file).slice(1)) {
      const code = clean(r[0]).slice(0, 7);
      const text = clean(r[textCol]).replace(/\.$/, '');
      if (!text || !known.has(code)) continue;
      const k = text.toLowerCase();
      if (!found.has(k)) found.set(k, { text, codes: new Set(), flag: false });
      const f = found.get(k);
      f.codes.add(code);
      f.flag ||= isFlagged(r);
    }
    let added = 0, ambiguous = 0;
    for (const [k, { text, codes, flag }] of found) {
      if (codes.size > 1) { ambiguous++; continue; }
      if (taken.has(k)) continue;
      taken.add(k);
      terms.push([text, [...codes][0], flag ? 1 : 0, setIdx]);
      added++;
    }
    console.log(`  set ${setIdx}: +${added} terms (${ambiguous} dropped as ambiguous)`);
  }
  addSet(onet.reported, 1, 2, (r) => clean(r[3]) === 'Y');
  addSet(onet.titles, 2, 2);
  addSet(onet.tasks, 3, 3);

  const counts = LEVELS.map((_, i) => nodes.filter((n) => n[1] === i).length);
  const expect = [6, 13, 23, 98, 459, 867];
  if (counts.join() !== expect.join()) throw new Error(`level counts ${counts} ≠ ${expect}`);

  const tax = {
    id: 'soc-2018',
    name: 'SOC 2018',
    label: 'Occupations',
    fullName: 'Standard Occupational Classification (2018)',
    subject: 'occupations',
    tagline: 'Every job in the country has a drawer. Learn where they are.',
    blurb: 'The SOC files every U.S. job into one of 867 detailed occupations, inside 459 broad ' +
      'occupations, 98 minor groups, and 23 major groups. Write in the names from the top down, ' +
      'or take a job title and file it into the right drawer, layer by layer.',
    termNoun: 'job title',
    termNounPlural: 'job titles',
    termExamples: ['Barista', 'Greenskeeper'],
    termSets: [
      { key: 'titles', noun: 'BLS job title', nounPlural: 'BLS job titles' },
      { key: 'reported', noun: 'job title workers reported to O*NET', nounPlural: 'O*NET reported job titles' },
      { key: 'onet', noun: 'O*NET job title', nounPlural: 'O*NET job titles' },
      { key: 'tasks', noun: 'O*NET task statement', nounPlural: 'O*NET task statements', long: true },
    ],
    pools: [
      { kind: 'reported*', label: 'Everyday job titles (the ones O*NET shows in My Next Move)' },
      { kind: 'reported', label: 'Every job title workers reported to O*NET' },
      { kind: 'illustrative', label: 'BLS illustrative job titles' },
      { kind: 'titles', label: 'Every BLS direct-match job title' },
      { kind: 'onet', label: 'Every O*NET job title' },
      { kind: 'tasks', label: 'O*NET task statements' },
      { kind: 'leaves', label: 'Occupation names' },
      { kind: 'groups', label: 'Group names (you also pick the layer)' },
    ],
    defaultPool: ['reported*', 'groups'],
    skipLabel: 'Skip military-specific job titles',
    findPlaceholder: 'Find a job: barista, paralegal, welder…',
    boardLevels: ['major', 'minor', 'broad', 'detailed'],
    source: 'U.S. Bureau of Labor Statistics — 2018 SOC structure, definitions, and Direct Match Title File; ' +
      'aggregations from the SOC 2018 manual, tables 5–6. Job titles and task statements from the O*NET 31.0 ' +
      'Database by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA), used under ' +
      'the CC BY 4.0 license; modified here to drop titles and tasks listed under more than one occupation. ' +
      'O*NET® is a trademark of USDOL/ETA.',
    sourceUrl: 'https://www.bls.gov/soc/2018/',
    levels: LEVELS,
    // Residual buckets ("Engineers, All Other", "Miscellaneous Woodworkers"): real
    // nodes, but nobody recalls them by name, so write-in fills them in for free.
    catchAll: '(, All Other$|^Miscellaneous )',
    // 558 of the 6,520 job titles are military jargon ("Gwot Ia/Ilo Intelligence
    // Support"); place-it skips them unless asked.
    skipTermsByDefault: ['H6'],
    // The path the home page traces through every layer.
    example: { term: 'Paralegal', node: '23-2011' },
    // [id, level index, parent id, title, display code, definition]
    nodes,
    // [text, node id, flag, set index]; flag = BLS illustrative / shown in My Next Move
    terms,
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(tax));
  console.log(`wrote ${path.relative(root, out)}: ${counts.join(' / ')} nodes, ${terms.length} terms ` +
    `(${terms.filter((t) => t[2]).length} common), ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}

const refresh = process.argv.includes('--refresh');
await download(refresh);
const ONET = 'https://www.onetcenter.org/dl_files/database/db_31_0_excel/';
emit({
  reported: await cached(ONET + 'Sample%20of%20Reported%20Titles.xlsx', 'onet_Sample_of_Reported_Titles.xlsx', { refresh }),
  titles: await cached(ONET + 'Job%20Titles.xlsx', 'onet_Job_Titles.xlsx', { refresh }),
  tasks: await cached(ONET + 'Task%20Statements.xlsx', 'onet_Task_Statements.xlsx', { refresh }),
});
