// The build step that decides what ships to Vercel (ADR 0017): every RSC payload goes, every
// file the site actually serves stays. The tree below is the shape a real export has, taken
// from the 2026-09-20 build.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error - plain .mjs build script, no type declarations
import { stripPrefetchPayloads } from '../scripts/strip-prefetch-payloads.mjs';

let out: string;

function write(relative: string, body: string) {
  const path = join(out, relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, body);
}

beforeEach(() => {
  out = mkdtempSync(join(tmpdir(), 'strip-'));
  // a bill route, as Next writes it: the page plus four payloads
  write('bills/119/hr/1.html', '<html>H.R. 1</html>');
  write('bills/119/hr/1.txt', 'rsc payload');
  write('bills/119/hr/1/__next._full.txt', 'rsc payload');
  write('bills/119/hr/1/__next._tree.txt', 'rsc payload');
  write('bills/119/hr/1/__next.bills/$d$congress/$d$type/$d$number/__PAGE__.txt', 'rsc payload');
  // a member route and the index
  write('members/S001213.html', '<html>Steil</html>');
  write('members/S001213.txt', 'rsc payload');
  write('members.html', '<html>Members</html>');
  write('members.txt', 'rsc payload');
  // assets that must survive, including one that only looks like a payload
  write('robots.txt', 'User-agent: *');
  write('_next/static/chunk.js', 'console.log(1)');
  write('_next/static/site.css', 'body{}');
});

afterEach(() => rmSync(out, { recursive: true, force: true }));

describe('stripPrefetchPayloads', () => {
  it('removes every RSC payload and keeps the pages and assets', () => {
    const result = stripPrefetchPayloads(out);

    expect(result.removed).toBe(6);
    expect(result.pages).toBe(3);
    for (const gone of [
      'bills/119/hr/1.txt',
      'bills/119/hr/1/__next._full.txt',
      'bills/119/hr/1/__next._tree.txt',
      'bills/119/hr/1/__next.bills/$d$congress/$d$type/$d$number/__PAGE__.txt',
      'members/S001213.txt',
      'members.txt',
    ]) {
      expect(existsSync(join(out, gone)), gone).toBe(false);
    }
    for (const kept of [
      'bills/119/hr/1.html',
      'members/S001213.html',
      'members.html',
      'robots.txt',
      '_next/static/chunk.js',
      '_next/static/site.css',
    ]) {
      expect(existsSync(join(out, kept)), kept).toBe(true);
    }
  });

  it('leaves a .txt that is not a page payload, so robots.txt survives', () => {
    // robots.txt has no robots.html beside it, which is what tells the two apart
    stripPrefetchPayloads(out);
    expect(existsSync(join(out, 'robots.txt'))).toBe(true);
  });

  it('removes the directories a payload left empty but keeps ones still in use', () => {
    write('bills/119/hr/1/attachment.pdf', 'kept');
    stripPrefetchPayloads(out);
    // the __next.* tree held payloads only, so it goes
    expect(existsSync(join(out, 'bills/119/hr/1/__next.bills'))).toBe(false);
    // this one still has a file, so it stays
    expect(existsSync(join(out, 'bills/119/hr/1/attachment.pdf'))).toBe(true);
    expect(existsSync(join(out, 'members'))).toBe(true);
  });

  it('reports the bytes dropped and the bytes left', () => {
    const result = stripPrefetchPayloads(out);
    expect(result.removedBytes).toBeGreaterThan(0);
    expect(result.keptBytes).toBeGreaterThan(0);
    expect(result.kept).toBe(6);
  });

  it('is safe to run twice, so a re-run of the build step changes nothing', () => {
    const first = stripPrefetchPayloads(out);
    const second = stripPrefetchPayloads(out);
    expect(second.removed).toBe(0);
    expect(second.keptBytes).toBe(first.keptBytes);
    expect(second.pages).toBe(3);
  });
});
