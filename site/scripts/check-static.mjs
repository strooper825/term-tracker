// Fails when the exported site could reach the API at runtime: no page or script may mention
// the API origin used at build time or the /api/v1 paths. Run after `next build`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'out';
const apiBase = process.env.API_BASE_URL ?? '';
const needles = ['/api/v1/'];
if (apiBase) needles.push(apiBase.replace(/\/$/, ''));

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (/\.(html|js|txt|json)$/.test(name)) files.push(path);
  }
  return files;
}

const files = walk(outDir);
const hits = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const needle of needles) {
    if (text.includes(needle)) hits.push(`${file}: contains "${needle}"`);
  }
}
const pages = files.filter((f) => f.endsWith('.html')).length;
if (pages === 0) {
  console.error(`no HTML pages under ${outDir}`);
  process.exit(1);
}
if (hits.length) {
  console.error(hits.join('\n'));
  process.exit(1);
}
console.log(`${pages} pages, ${files.length} files checked under ${outDir}: no API references`);
