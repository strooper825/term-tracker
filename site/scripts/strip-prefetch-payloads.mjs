// Removes the React Server Component payload files Next writes beside every exported page, and
// reports what the deployment weighs. Run after the build, before the upload. See ADR 0017.
//
// Next 16 emits four payload files per route on top of the HTML: `<route>.txt` and, under
// `<route>/`, `__next._full.txt`, `__next._tree.txt` and a `__next.<segment>/.../__PAGE__.txt`.
// They exist only so a <Link> can navigate without a page load. They were 307 MB of the 495 MB
// export and 18,464 of its 23,102 files on 2026-09-20, and Vercel counts the unpacked
// deployment against the storage allowance, so they are dropped and navigation falls back to an
// ordinary page load.
//
// Only payload files go: a `.txt` is removed when the page it belongs to sits beside it, so a
// real asset (robots.txt, a text fixture) is left alone even though it shares the extension.
import { readdirSync, realpathSync, rmdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Every file under `dir`, with the directories that held them, deepest first. */
function walk(dir, files = [], dirs = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path, files, dirs);
      dirs.push(path);
    } else {
      files.push(path);
    }
  }
  return { files, dirs };
}

/** True when `path` is an RSC payload rather than a file the site serves. */
export function isPrefetchPayload(path, exists) {
  if (!path.endsWith('.txt')) return false;
  const parts = path.split(/[\\/]/);
  // `<route>/__next._full.txt`, and everything under a `__next.<segment>` directory
  if (parts.some((part) => part.startsWith('__next.'))) return true;
  // `<route>.txt` beside the `<route>.html` it carries
  return exists(`${path.slice(0, -'.txt'.length)}.html`);
}

export function stripPrefetchPayloads(outDir) {
  const { files, dirs } = walk(outDir);
  const present = new Set(files);
  const exists = (path) => present.has(path);

  let removed = 0;
  let removedBytes = 0;
  let keptBytes = 0;
  let pages = 0;
  for (const file of files) {
    const size = statSync(file).size;
    if (isPrefetchPayload(file, exists)) {
      unlinkSync(file);
      removed += 1;
      removedBytes += size;
    } else {
      keptBytes += size;
      if (file.endsWith('.html')) pages += 1;
    }
  }
  // `__next.<segment>` directories are left empty; drop them so the upload has no dead entries.
  for (const dir of dirs) {
    try {
      rmdirSync(dir);
    } catch {
      // not empty: a directory the site still serves from
    }
  }
  return { pages, removed, removedBytes, kept: files.length - removed, keptBytes };
}

const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;

/** True when this file was run as a command rather than imported by a test. */
function runAsCommand() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (runAsCommand()) {
  const outDir = process.argv[2] ?? 'out';
  const result = stripPrefetchPayloads(outDir);
  if (result.pages === 0) {
    console.error(`no HTML pages under ${outDir}`);
    process.exit(1);
  }
  const before = result.keptBytes + result.removedBytes;
  const share = before === 0 ? 0 : Math.round((result.removedBytes / before) * 100);
  console.log(
    `- Dropped ${result.removed.toLocaleString('en-US')} prefetch payloads, ` +
      `${mb(result.removedBytes)} (${share}% of the build)`,
  );
  console.log(
    `- Deploying ${result.pages.toLocaleString('en-US')} pages, ` +
      `${result.kept.toLocaleString('en-US')} files, ${mb(result.keptBytes)} unpacked`,
  );
}
