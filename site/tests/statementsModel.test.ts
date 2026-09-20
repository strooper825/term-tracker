import { describe, expect, it } from 'vitest';
import { buildStatements, decodeEntities, htmlToText, STATEMENT_TEXT_CAP } from '@/lib/model';
import type { StatementItem, StatementsResponse } from '@/lib/types';

describe('press release text', () => {
  it('decodes named, decimal and hex references and leaves unknown ones alone', () => {
    expect(
      decodeEntities('Sanders &amp; Takano &#8211; &#x201C;32 hours&#x201D; &rsquo;s &bogus; &#99999999999;'),
    ).toBe('Sanders & Takano – “32 hours” ’s &bogus; &#99999999999;');
  });

  it('turns paragraphs and breaks into blank lines and line breaks, and drops every tag', () => {
    expect(htmlToText('<p>One <strong>bold</strong> line.</p><p>Two<br/>lines &amp; more.</p>')).toBe(
      'One bold line.\n\nTwo\nlines & more.',
    );
  });

  it('drops script and style bodies and comments, and cannot turn an entity into a tag', () => {
    expect(htmlToText('<style>p{color:red}</style><!-- note --><p>Hi</p><script>alert(1)</script>')).toBe('Hi');
    expect(htmlToText('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')).toBe('<script>alert(1)</script>');
  });
});

describe('buildStatements', () => {
  const base: Omit<StatementsResponse, 'mode' | 'items'> = {
    bioguide_id: 'S000033',
    label: 'sanders.senate.gov',
    press_url: 'https://www.sanders.senate.gov/press-releases/',
    feed_url: 'https://www.sanders.senate.gov/press-releases/feed/',
    total: 1,
    newest_published_at: '2026-09-19T15:39:36Z',
    sources: [
      {
        source: 'press_feed',
        source_url: 'https://www.sanders.senate.gov/press-releases/',
        fetched_at: '2026-09-19T23:00:00Z',
      },
    ],
  };
  const item = (over: Partial<StatementItem> = {}): StatementItem => ({
    guid: 'g1',
    title: 'Sanders &amp; Warren',
    published_at: '2026-09-19T15:39:36Z',
    published_date: '2026-09-19',
    url: 'https://www.sanders.senate.gov/press-releases/x/',
    author: null,
    categories: ['Press Releases', 'Uncategorized', ' Health &amp; Care '],
    description: '<p>Excerpt only</p>',
    content_html: null,
    ...over,
  });

  it('is null for a member outside the seed', () => {
    expect(buildStatements({ ...base, mode: 'none', items: [], total: 0 })).toBeNull();
  });

  it('a link member has no statements and keeps the press page', () => {
    const m = buildStatements({ ...base, mode: 'link', items: [], total: 0 })!;
    expect(m).toMatchObject({ mode: 'link', statements: [], pressUrl: base.press_url, label: base.label });
  });

  it('a feed member with nothing loaded yet falls back to the link', () => {
    expect(buildStatements({ ...base, mode: 'feed', items: [], total: 0 })!.mode).toBe('link');
  });

  it('cleans the title and topics, drops generic topics, and falls back to the excerpt', () => {
    const m = buildStatements({ ...base, mode: 'feed', items: [item()] })!;
    expect(m.mode).toBe('feed');
    expect(m.newest).toBe('Sep 19, 2026');
    expect(m.statements[0]).toMatchObject({
      title: 'Sanders & Warren',
      categories: ['Health & Care'],
      text: 'Excerpt only',
      dateLabel: 'Sep 19, 2026',
    });
  });

  it('cuts long text at the cap on a word boundary', () => {
    const long = `<p>${'word '.repeat(2000)}</p>`;
    const [{ text }] = buildStatements({ ...base, mode: 'feed', items: [item({ content_html: long })] })!.statements;
    expect(text.length).toBeLessThanOrEqual(STATEMENT_TEXT_CAP + 1);
    expect(text.endsWith('word…')).toBe(true);
  });
});
