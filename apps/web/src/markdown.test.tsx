import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { blocks, Markdown } from './Markdown';

const html = (s: string) => renderToStaticMarkup(<Markdown source={s} />);

describe('the Markdown reader', () => {
  it('reads headings, paragraphs, lists, quotes and words', () => {
    expect(blocks('## Title\n\nOne\ntwo\n\n- a\n- b\n\n1. x\n2. y\n\n> quote\n> more')).toEqual([
      { kind: 'h', level: 2, text: 'Title' },
      { kind: 'p', text: 'One two' },
      { kind: 'ul', items: ['a', 'b'] },
      { kind: 'ol', items: ['x', 'y'] },
      { kind: 'quote', text: 'quote more' },
    ]);
    const out = html('**bold** and *italic* and `code`');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>italic</em>');
    expect(out).toContain('code</code>');
  });

  it('never lets an article run a script or hide a dangerous link', () => {
    const out = html(
      '<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1)) [ok](https://example.com)',
    );
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('href="javascript');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="noreferrer noopener"');
  });

  it('shows an empty text as nothing', () => {
    expect(blocks('')).toEqual([]);
    expect(blocks('   \n\n ')).toEqual([]);
  });
});
