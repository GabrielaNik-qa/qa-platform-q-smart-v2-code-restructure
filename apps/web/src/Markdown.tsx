// A small, safe Markdown reader for the Knowledge Base (today's md.js): headings (#, ##, ###), paragraphs, bulleted and
// numbered lists, quotes, rules, **bold**, *italic*, `code` and [links](https://…). It builds React elements, never HTML
// text, so nothing in an article can run as a script; only http and https links become links. The reading of the blocks
// is shared with the server (the ZIP export writes the same HTML).
import { MD_TOKEN, markdownBlocks } from '@qsmart/shared';
import type { ReactNode } from 'react';

/** The words inside a line: bold, italic, code and links. */
export function inline(text: string): ReactNode[] {
  return text.split(MD_TOKEN).map((part, i) => {
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

export const blocks = markdownBlocks;

export function Markdown({ source }: { source: string }) {
  return (
    <div className="grid gap-3 text-[15px] leading-relaxed">
      {markdownBlocks(source).map((b, i) => {
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
