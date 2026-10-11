/* Minimal zero-dependency .xlsx reader: first sheet → array of row arrays.
 * Shells out to `unzip -p` (macOS/Linux) rather than pulling in a zip library;
 * the statistical-agency spreadsheets we read are flat tables, so shared strings,
 * inline strings, and numbers are all that matter.
 */
import { execFileSync } from 'node:child_process';

const unzip = (file, entry) =>
  execFileSync('unzip', ['-p', file, entry], { maxBuffer: 512 * 1024 * 1024 }).toString('utf8');

const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&amp;/g, '&');

// A shared string may be split into rich-text runs (<r><t>…</t></r>); join them.
const textOf = (xml) => [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');

function colIndex(ref) {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function readSheet(file, sheet = 1) {
  let shared = [];
  try {
    shared = [...unzip(file, 'xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)]
      .map((m) => textOf(m[1]));
  } catch { /* workbooks with only inline strings have no sharedStrings part */ }
  const xml = unzip(file, `xl/worksheets/sheet${sheet}.xml`);
  const rows = [];
  for (const [, rowXml] of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const [, attrs, body] of rowXml.matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /t="(\w+)"/.exec(attrs)?.[1];
      const v = body && /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let val = null;
      if (type === 's') val = shared[+v];
      else if (type === 'inlineStr') val = textOf(body);
      else if (type === 'str') val = v != null ? decode(v) : null;
      else if (v != null) val = Number(v);
      row[ref ? colIndex(ref) : row.length] = val;
    }
    rows.push(Array.from(row, (x) => (x === undefined ? null : x)));
  }
  return rows;
}
