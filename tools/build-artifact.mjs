/* Artifact build → dist/taxonomy-games.html, for publishing on claude.ai.
 * The CSS and scripts are inlined; the data files are published alongside the
 * page as separate files (12 MB total, too much to inline), and js/app.js
 * fetches them by relative path exactly as it does locally.
 *
 * The output is a page *fragment*: the Artifact host wraps it in its own
 * doctype/head/body, so those tags are stripped here. Publish with
 *   files: { 'data/index.json', 'data/presets.json', 'data/taxonomies/*.json' }
 * (each mapped to itself). GitHub Pages serves the repo root as-is instead.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const html = read('index.html')
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<\/?(html|body)[^>]*>\s*/gi, '')
  .replace(/<\/?head>\s*/gi, '')
  .replace(/<meta [^>]*>\s*/gi, '')
  .replace('<link rel="stylesheet" href="css/styles.css">', () => `<style>\n${read('css/styles.css')}</style>`)
  .replace(/<script src="(js\/[\w-]+\.js)"><\/script>/g, (_, src) => `<script>\n${read(src)}</script>`);

const out = path.join(root, 'dist/taxonomy-games.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
const files = ['data/index.json', 'data/presets.json',
  ...JSON.parse(read('data/index.json')).taxonomies.map((t) => t.file)];
console.log(`wrote dist/taxonomy-games.html (${(fs.statSync(out).size / 1024).toFixed(0)} KB); publish with files:`);
console.log(JSON.stringify(Object.fromEntries(files.map((f) => [f, f]))));
