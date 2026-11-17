// A small, safe Markdown reader for the Knowledge Base (today's md.js): headings (#, ##, ###), paragraphs, bulleted and
// numbered lists, quotes, rules, **bold**, *italic*, `code` and [links](https://…). It builds React elements, never HTML
// text, so nothing in an article can run as a script; only http and https links become links.
import type { ReactNode } from 'react';

const TOKEN = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g;

/** The words inside a line: bold, italic, code and links. */
export function inline(text: string): ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    if (/^`[^`]+`$/.test(part))
      return (
        <code key={i} className="rounded-s bg-sunk px-1 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part);
    if (link)
      return (
        <a key={i} href={link[2]} target="_blank" rel="noreferrer noopener" className="text-brand underline">
          {link[1]}
        </a>
      );
    return part;
  });
}

type Block =
  | { kind: 'h'; level: 1 | 2 | 3; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'hr' };

/** The blocks of a text, line by line. */
export function blocks(source: string): Block[] {
  const out: Block[] = [];
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
      const kind = bullet ? 'ul' : 'ol';
      const text = (bullet ?? numbered)?.[1] ?? '';
      if (last?.kind === kind) last.items.push(text);
      else out.push(kind === 'ul' ? { kind: 'ul', items: [text] } : { kind: 'ol', items: [text] });
    } else paragraph.push(line.trim());
  }
  flush();
  return out;
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="grid gap-3 text-[15px] leading-relaxed">
      {blocks(source).map((b, i) => {
        if (b.kind === 'h') {
          const size = b.level === 1 ? 'text-2xl' : b.level === 2 ? 'text-xl' : 'text-lg';
          return (
            <p key={i} role="heading" aria-level={b.level + 1} className={`font-display ${size} font-bold`}>
              {inline(b.text)}
            </p>
          );
        }
        if (b.kind === 'quote')
          return (
            <blockquote key={i} className="border-l-4 border-bd2 pl-3 text-mu">
              {inline(b.text)}
            </blockquote>
          );
        if (b.kind === 'ul')
          return (
            <ul key={i} className="list-disc pl-6">
              {b.items.map((x, j) => (
                <li key={j}>{inline(x)}</li>
              ))}
            </ul>
          );
        if (b.kind === 'ol')
          return (
            <ol key={i} className="list-decimal pl-6">
              {b.items.map((x, j) => (
                <li key={j}>{inline(x)}</li>
              ))}
            </ol>
          );
        if (b.kind === 'hr') return <hr key={i} className="border-bd" />;
        return <p key={i}>{inline(b.text)}</p>;
      })}
    </div>
  );
}
