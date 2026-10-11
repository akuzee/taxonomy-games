/* Cached downloads for the build scripts. Government sites (bls.gov, census.gov)
 * answer 403 to anything that doesn't look like a browser navigation — a
 * User-Agent alone isn't enough, the Sec-Fetch-* headers matter — and a blocked
 * request can still come back as a small HTML page, so a spreadsheet that isn't
 * a zip is never cached.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const cache = path.join(root, 'tools/cache');

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-Dest': 'document',
  'Upgrade-Insecure-Requests': '1',
};

// url → local path in tools/cache (downloaded once unless refresh)
export async function cached(url, name, { refresh = false } = {}) {
  fs.mkdirSync(cache, { recursive: true });
  const dest = path.join(cache, name);
  if (fs.existsSync(dest) && !refresh) return dest;
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok || (name.endsWith('.xlsx') && buf.subarray(0, 2).toString() !== 'PK')) {
    throw new Error(`${url}: HTTP ${res.status}, not a spreadsheet (blocked, or the file moved)`);
  }
  fs.writeFileSync(dest, buf);
  console.log(`downloaded ${name} (${(buf.length / 1024).toFixed(0)} KB)`);
  return dest;
}

// prepare(tax, counts) runs just before writing, for copy that quotes the counts.
export function writeTaxonomy(tax, prepare) {
  const out = path.join(root, `data/taxonomies/${tax.id}.json`);
  const counts = tax.levels.map((_, i) => tax.nodes.filter((n) => n[1] === i).length);
  prepare?.(tax, counts);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(tax));
  console.log(`wrote ${path.relative(root, out)}: ${counts.join(' / ')} nodes, ${tax.terms.length} terms, ` +
    `${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
  return counts;
}

// U+FFFD is a character the source already lost (APQC 7.4 has one where a space
// belongs: "production\uFFFDalternatives"); it's never intended text.
export const clean = (s) => String(s ?? '').replace(/\uFFFD/g, ' ').replace(/\s+/g, ' ').trim();
