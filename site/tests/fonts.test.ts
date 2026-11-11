import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|css)$/.test(name) ? [path] : [];
  });
}

describe('fonts', () => {
  // next/font/google downloads the font while building. When that download failed, the build
  // failed and the nightly's deploy with it (2026-10-01, 2026-11-10).
  it('the build fetches no font from the network', () => {
    for (const path of sourceFiles(SRC)) {
      const text = readFileSync(path, 'utf-8');
      expect(text, path).not.toMatch(/from\s+['"]next\/font\/google['"]/);
      expect(text, path).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    }
  });

  it('every font file the layout names is in the repository', () => {
    const layout = join(SRC, 'app/layout.tsx');
    const paths = [...readFileSync(layout, 'utf-8').matchAll(/path:\s*'([^']+\.woff2)'/g)];
    expect(paths.length).toBe(4);
    for (const [, relative] of paths) {
      expect(existsSync(resolve(dirname(layout), relative)), relative).toBe(true);
    }
  });
});
