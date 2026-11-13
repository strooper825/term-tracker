/** The words the site owner writes, read from site/content at build time (ADR 0022).
 *
 *  Everything here is edited in the browser editor at /admin (Sveltia CMS, which commits to the
 *  repository) or by hand, and a change under site/content deploys the site. Data pages never
 *  read these files and these files never hold data: a number belongs in the mart. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

export const CONTENT_DIR = join(process.cwd(), 'content');

export interface Social {
  label: string;
  url: string;
}

export interface SiteContent {
  headline: string;
  intro: string;
  mission: string;
  /** The Ko-fi page the Support button opens; empty until the owner has one. */
  kofiUrl: string;
  /** Shown as Contact in the footer when set. */
  contactEmail: string;
  /** Footer icons; the row is hidden while this is empty. */
  socials: Social[];
}

export interface Page {
  slug: string;
  title: string;
  description: string;
  html: string;
}

export const ARTICLE_CATEGORIES = ['Congress', 'Elections', 'Analysis'] as const;

export interface Article {
  slug: string;
  title: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  author: string;
  category: string;
  summary: string;
  image: string | null;
  html: string;
}

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value.trim() : value == null ? fallback : String(value).trim();

/** YAML reads an unquoted 2026-11-12 as a Date; the editor may write either form. */
function isoDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const s = text(value);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

export function loadSite(dir = CONTENT_DIR): SiteContent {
  const raw = JSON.parse(readFileSync(join(dir, 'site.json'), 'utf8')) as Partial<SiteContent>;
  const socials = Array.isArray(raw.socials)
    ? raw.socials
        .map((s) => ({ label: text(s?.label), url: text(s?.url) }))
        .filter((s) => s.label && /^https?:\/\//.test(s.url))
    : [];
  return {
    headline: text(raw.headline),
    intro: text(raw.intro),
    mission: text(raw.mission),
    kofiUrl: /^https:\/\//.test(text(raw.kofiUrl)) ? text(raw.kofiUrl) : '',
    contactEmail: text(raw.contactEmail).includes('@') ? text(raw.contactEmail) : '',
    socials,
  };
}

export function renderMarkdown(source: string): string {
  return marked.parse(source, { async: false, gfm: true }) as string;
}

export function loadPage(slug: string, dir = CONTENT_DIR): Page {
  const { data, content } = matter(readFileSync(join(dir, 'pages', `${slug}.md`), 'utf8'));
  return {
    slug,
    title: text(data.title, slug),
    description: text(data.description),
    html: renderMarkdown(content),
  };
}

/** Published articles, newest first. A draft, a file without a title or date, and README.md are
 *  left out; the slug is the file name, which the editor makes from the title. */
export function loadArticles(dir = CONTENT_DIR): Article[] {
  const folder = join(dir, 'articles');
  if (!existsSync(folder)) return [];
  const articles: Article[] = [];
  for (const name of readdirSync(folder)) {
    if (!name.endsWith('.md') || name.toLowerCase() === 'readme.md') continue;
    const { data, content } = matter(readFileSync(join(folder, name), 'utf8'));
    const title = text(data.title);
    const date = isoDate(data.date);
    if (data.draft === true || !title || !date) continue;
    articles.push({
      slug: name.slice(0, -3),
      title,
      date,
      author: text(data.author),
      category: text(data.category),
      summary: text(data.summary),
      image: text(data.image) || null,
      html: renderMarkdown(content),
    });
  }
  return articles.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}
