import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadArticles, loadPage, loadSite } from '@/lib/content';

function contentDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'tt-content-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const SITE = JSON.stringify({
  headline: ' Headline ',
  intro: 'Intro',
  mission: 'Mission',
  kofiUrl: 'https://ko-fi.com/example',
  contactEmail: 'hello@example.org',
  socials: [
    { label: 'Bluesky', url: 'https://bsky.app/profile/example' },
    { label: 'Broken', url: 'javascript:alert(1)' },
    { label: '', url: 'https://example.org' },
  ],
});

describe('loadSite', () => {
  it('trims the words and keeps only usable links', () => {
    const site = loadSite(contentDir({ 'site.json': SITE }));
    expect(site.headline).toBe('Headline');
    expect(site.kofiUrl).toBe('https://ko-fi.com/example');
    expect(site.contactEmail).toBe('hello@example.org');
    expect(site.socials).toEqual([{ label: 'Bluesky', url: 'https://bsky.app/profile/example' }]);
  });

  it('treats a missing Ko-fi page, email and socials as not set', () => {
    const site = loadSite(
      contentDir({ 'site.json': JSON.stringify({ headline: 'H', kofiUrl: 'ko-fi.com/x', contactEmail: 'nope' }) }),
    );
    expect(site.kofiUrl).toBe('');
    expect(site.contactEmail).toBe('');
    expect(site.socials).toEqual([]);
  });

  it('reads the real site.json the build uses', () => {
    const site = loadSite();
    expect(site.headline.length).toBeGreaterThan(0);
    expect(site.mission.length).toBeGreaterThan(0);
  });
});

describe('loadPage', () => {
  it('renders the Markdown body under the front-matter title', () => {
    const dir = contentDir({
      'pages/about.md': '---\ntitle: About us\ndescription: Who we are\n---\n\n## Heading\n\nA [link](/methodology).\n',
    });
    const page = loadPage('about', dir);
    expect(page.title).toBe('About us');
    expect(page.description).toBe('Who we are');
    expect(page.html).toContain('<h2>Heading</h2>');
    expect(page.html).toContain('<a href="/methodology">link</a>');
  });

  it.each(['about', 'methodology', 'privacy'])('the real %s page has a title and a body', (slug) => {
    const page = loadPage(slug);
    expect(page.title.length).toBeGreaterThan(0);
    expect(page.html.length).toBeGreaterThan(100);
  });
});

describe('loadArticles', () => {
  const article = (fm: string, body = 'Body text.') => `---\n${fm}\n---\n\n${body}\n`;

  it('lists published articles newest first and skips drafts, README and incomplete files', () => {
    const dir = contentDir({
      'articles/README.md': '# How to write an article',
      'articles/older.md': article('title: Older\ndate: 2026-10-01\nauthor: A\ncategory: Congress'),
      'articles/newer.md': article("title: Newer\ndate: '2026-11-02'\nsummary: Short\nimage: /uploads/x.jpg"),
      'articles/draft.md': article('title: Draft\ndate: 2026-11-05\ndraft: true'),
      'articles/undated.md': article('title: No date'),
      'articles/untitled.md': article('date: 2026-11-06'),
      'articles/notes.txt': 'not markdown',
    });
    const articles = loadArticles(dir);
    expect(articles.map((a) => a.slug)).toEqual(['newer', 'older']);
    const [newer, older] = articles;
    expect(newer).toMatchObject({ title: 'Newer', date: '2026-11-02', summary: 'Short', image: '/uploads/x.jpg' });
    expect(older).toMatchObject({ date: '2026-10-01', author: 'A', category: 'Congress', image: null });
    expect(older.html).toContain('<p>Body text.</p>');
  });

  it('is empty when there is no articles folder', () => {
    expect(loadArticles(contentDir({ 'site.json': SITE }))).toEqual([]);
  });

  it('the real articles folder loads without error', () => {
    expect(Array.isArray(loadArticles())).toBe(true);
  });
});
