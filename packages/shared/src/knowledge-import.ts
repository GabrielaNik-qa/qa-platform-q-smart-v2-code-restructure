// Importing documents into Knowledge Base articles (today's import), the parts that need no AI and no server:
// HTML becomes text with its headings kept as "#" lines, and a text is split into articles at its headings (# and ##).
// Everything takes time in step with the size of the text: a crafted file with thousands of "<script" or "<h1" that never
// close cannot keep the server busy.

/** The text with <script> and <style> blocks taken out; one that is never closed takes the rest of the text with it. */
export function dropBlocks(html: string): string {
  const lower = html.toLowerCase();
  let out = '';
  let i = 0;
  let script = lower.indexOf('<script');
  let style = lower.indexOf('<style');
  for (;;) {
    if (script >= 0 && script < i) script = lower.indexOf('<script', i);
    if (style >= 0 && style < i) style = lower.indexOf('<style', i);
    const at = script < 0 ? style : style < 0 ? script : Math.min(script, style);
    if (at < 0) return out + html.slice(i);
    const close = lower.indexOf(`</${at === script ? 'script' : 'style'}`, at);
    out += html.slice(i, at);
    if (close < 0) return out;
    const end = lower.indexOf('>', close);
    i = end < 0 ? lower.length : end + 1;
  }
}

/** HTML to plain text: h1 to h3 become "#" headings (where articles are split), the other tags are removed. */
export function htmlToText(html: string): string {
  return dropBlocks(String(html))
    .replace(/<\/(p|div|h[1-6]|li|br)>/gi, '\n')
    .replace(/<h([1-3])[^<>]*>/gi, (_m, n: string) => `\n${'#'.repeat(Number(n))} `)
    .replace(/<[^<>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&'); // &amp; last, so "&amp;lt;" stays "&lt;"
}

export interface DraftArticle {
  title: string;
  /** a folder path such as "Processes/Objection handling" ('' : the folder chosen for the import) */
  folder: string;
  topics: string[];
  body: string;
}

const STOP = new Set(
  'about after again also because been before being between both could does doing during each from have here into just more most must only other over same should some such than that their them then there these they this those through under very were what when where which while will with would your'.split(
    ' ',
  ),
);

/** Up to three topics from the most frequent longer words of an article. */
export function guessTopics(title: string, body: string): string[] {
  const freq = new Map<string, number>();
  for (const w of `${title} ${body}`.toLowerCase().match(/[a-zà-ÿ]{5,}/g) ?? [])
    if (!STOP.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));
}

/** A file's name as a title: no ending, underscores and dashes as spaces. */
export const titleFromFile = (name: string): string =>
  name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim() || 'Imported document';

/**
 * Splits a text into articles at its headings (# and ##): the words before the first heading become an article named after
 * the file. More than one article go into a folder named after the file.
 */
export function splitAtHeadings(text: string, filename: string): DraftArticle[] {
  if (!text.trim()) return [];
  const base = titleFromFile(filename);
  const parts: { title: string; body: string }[] = [];
  let current: { title: string; body: string } | null = null;
  for (const line of text.replace(/\r/g, '').trim().split('\n')) {
    const heading = /^#{1,2}\s+(.*)/.exec(line);
    if (heading) {
      if (current) parts.push(current);
      current = { title: (heading[1] ?? '').trim(), body: '' };
    } else {
      current ??= { title: base, body: '' };
      current.body += `${line}\n`;
    }
  }
  if (current) parts.push(current);
  return parts
    .filter((p) => p.body.trim() || p.title)
    .map((p) => ({
      title: p.title.slice(0, 150) || base,
      folder: parts.length > 1 ? base : '',
      topics: guessTopics(p.title, p.body),
      body: p.body.trim(),
    }));
}

/** A name for a file in a ZIP: letters and digits, and dashes. */
export const fileSlug = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'item';

// ---------------------------------------------------------------------------------------------- Markdown

/** The marks inside a line: **bold**, *italic*, `code` and [links](https://…). The pages and the HTML export read the same. */
export const MD_TOKEN = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g;

export type MdBlock =
  | { kind: 'h'; level: 1 | 2 | 3; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'hr' };

/** The blocks of a Markdown text, line by line: headings, paragraphs, quotes, lists and rules. */
export function markdownBlocks(source: string): MdBlock[] {
  const out: MdBlock[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) out.push({ kind: 'p', text: paragraph.join(' ') });
    paragraph = [];
  };
  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.*\S)\s*$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*\S)\s*$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*\S)\s*$/.exec(line);
    const last = out.at(-1);
    if (!line.trim()) flush();
    else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flush();
      out.push({ kind: 'hr' });
    } else if (heading) {
      flush();
      out.push({ kind: 'h', level: heading[1]?.length as 1 | 2 | 3, text: heading[2] ?? '' });
    } else if (quote) {
      flush();
      if (last?.kind === 'quote') last.text += ` ${quote[1] ?? ''}`;
      else out.push({ kind: 'quote', text: quote[1] ?? '' });
    } else if (bullet || numbered) {
      flush();
      const text = (bullet ?? numbered)?.[1] ?? '';
      if (bullet) {
        if (last?.kind === 'ul') last.items.push(text);
        else out.push({ kind: 'ul', items: [text] });
      } else if (last?.kind === 'ol') last.items.push(text);
      else out.push({ kind: 'ol', items: [text] });
    } else paragraph.push(line.trim());
  }
  flush();
  return out;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A line's marks as HTML: everything is escaped first, so nothing in a text can be a tag; only http(s) links. */
function inlineHtml(text: string): string {
  return text
    .split(MD_TOKEN)
    .map((part) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) return `<strong>${escapeHtml(part.slice(2, -2))}</strong>`;
      if (/^\*[^*]+\*$/.test(part)) return `<em>${escapeHtml(part.slice(1, -1))}</em>`;
      if (/^`[^`]+`$/.test(part)) return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part);
      if (link) return `<a href="${escapeHtml(link[2] ?? '')}">${escapeHtml(link[1] ?? '')}</a>`;
      return escapeHtml(part);
    })
    .join('');
}

/** A Markdown text as safe HTML (for the ZIP export): the same blocks and marks the pages show. */
export function markdownToHtml(source: string): string {
  return markdownBlocks(source)
    .map((b) => {
      if (b.kind === 'h') return `<h${b.level + 1}>${inlineHtml(b.text)}</h${b.level + 1}>`;
      if (b.kind === 'quote') return `<blockquote>${inlineHtml(b.text)}</blockquote>`;
      if (b.kind === 'ul' || b.kind === 'ol')
        return `<${b.kind}>${b.items.map((i) => `<li>${inlineHtml(i)}</li>`).join('')}</${b.kind}>`;
      if (b.kind === 'hr') return '<hr>';
      return `<p>${inlineHtml(b.text)}</p>`;
    })
    .join('\n');
}
