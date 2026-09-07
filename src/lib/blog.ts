import { marked } from 'marked';

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  summary: string;
  tags: string[];
  readingTime: string;
  html: string;
}

interface Frontmatter {
  title?: string;
  date?: string;
  summary?: string;
  tags?: string;
  readingTime?: string;
}

const modules = import.meta.glob('/src/content/blog/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

function parsePost(path: string, source: string): BlogPost {
  const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  const frontmatter: Frontmatter = {};

  if (match) {
    for (const line of match[1].split('\n')) {
      const separator = line.indexOf(':');
      if (separator === -1) continue;

      const key = line.slice(0, separator).trim() as keyof Frontmatter;
      frontmatter[key] = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  }

  const filename = path.split('/').pop() ?? 'post.md';
  const slug = filename.replace(/\.md$/, '');
  const body = match ? match[2] : source;

  return {
    slug,
    title: frontmatter.title ?? slug.replace(/-/g, ' '),
    date: frontmatter.date ?? '',
    summary: frontmatter.summary ?? '',
    tags: frontmatter.tags?.split(',').map((tag) => tag.trim()).filter(Boolean) ?? [],
    readingTime: frontmatter.readingTime ?? 'A short read',
    html: marked.parse(body) as string,
  };
}

export const posts = Object.entries(modules)
  .map(([path, source]) => parsePost(path, source))
  .sort((left, right) => right.date.localeCompare(left.date));