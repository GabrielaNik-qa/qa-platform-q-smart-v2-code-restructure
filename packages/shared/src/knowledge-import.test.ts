import { describe, expect, it } from 'vitest';
import {
  dropBlocks,
  fileSlug,
  guessTopics,
  htmlToText,
  markdownToHtml,
  splitAtHeadings,
  titleFromFile,
} from './knowledge-import.js';

describe('HTML to text', () => {
  it('keeps headings as # lines, drops scripts and styles, and decodes the few entities', () => {
    const text = htmlToText(
      '<style>p{x:y}</style><h1>Title</h1><p>One &amp; two &lt;b&gt;</p><script>alert(1)</script><h2>Part</h2><div>Text</div>',
    );
    expect(text).toContain('# Title');
    expect(text).toContain('## Part');
    expect(text).toContain('One & two <b>');
    expect(text).not.toContain('alert');
    expect(text).not.toContain('p{x:y}');
    expect(htmlToText('&amp;lt;')).toBe('&lt;');
  });

  it('takes the rest of the text with a script that never closes, and is fast on a crafted file', () => {
    expect(dropBlocks('before <script>never closed and more')).toBe('before ');
    const started = Date.now();
    htmlToText('<script'.repeat(50_000) + '<h1'.repeat(50_000));
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('splitting a text into articles', () => {
  it('splits at # and ## headings, with the words before the first one as an article named after the file', () => {
    const parts = splitAtHeadings(
      'Intro words\n# First\nAbout greetings and greetings.\n## Second\nMore here\n### Not a split',
      'My_policy-notes.docx',
    );
    expect(parts.map((p) => p.title)).toEqual(['My policy notes', 'First', 'Second']);
    expect(parts.every((p) => p.folder === 'My policy notes')).toBe(true);
    expect(parts[1]?.body).toBe('About greetings and greetings.');
    expect(parts[2]?.body).toContain('### Not a split');
    expect(parts[1]?.topics).toContain('Greetings');
  });

  it('puts a single article in the chosen folder, not in one named after the file', () => {
    const parts = splitAtHeadings('Just some words, nothing else.', 'notes.txt');
    expect(parts).toEqual([
      { title: 'notes', folder: '', topics: ['Notes', 'Words', 'Nothing'], body: 'Just some words, nothing else.' },
    ]);
    expect(splitAtHeadings('   \n ', 'x.txt')).toEqual([]);
  });

  it('names a file and guesses topics', () => {
    expect(titleFromFile('')).toBe('Imported document');
    expect(titleFromFile('a_b-c.md')).toBe('a b c');
    expect(guessTopics('Greeting', 'greeting customers politely, greeting again')).toEqual([
      'Greeting',
      'Customers',
      'Politely',
    ]);
    expect(fileSlug('Prix: très élevé ?')).toBe('Prix-tres-eleve');
    expect(fileSlug('???')).toBe('item');
  });
});

describe('Markdown as HTML (the ZIP export)', () => {
  it('writes the same blocks as safe HTML', () => {
    const html = markdownToHtml('## Title\n\n- a\n- b\n\n**bold** [x](https://example.com)');
    expect(html).toContain('<h3>Title</h3>');
    expect(html).toContain('<ul><li>a</li><li>b</li></ul>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<a href="https://example.com">x</a>');
  });

  it('never lets a text become a tag or a dangerous link', () => {
    const html = markdownToHtml(
      '<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1)) "quoted"',
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href="javascript');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;quoted&quot;');
  });
});
