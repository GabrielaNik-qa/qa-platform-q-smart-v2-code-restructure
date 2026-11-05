// A tiny, safe Markdown renderer. It runs in the browser (articles) and on the server (ZIP export).
// Everything is HTML-escaped first, so nobody can inject scripts through an article. The link text cannot contain "[": otherwise
// a text of thousands of "[" makes the search start again at every one of them and the page (or the server) freezes.
(function (g) {
  const esc = s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
  const inline = s => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/\[([^[\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  function md(src) {
    const out = []; let list = null, code = false, para = [];
    const flushP = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
    const closeL = () => { if (list) { out.push('</' + list + '>'); list = null; } };
    for (const raw of String(src || '').replace(/\r/g, '').split('\n')) {
      if (/^```/.test(raw)) { flushP(); closeL(); out.push(code ? '</code></pre>' : '<pre><code>'); code = !code; continue; }
      if (code) { out.push(esc(raw) + '\n'); continue; }
      const l = raw.trimEnd(); let m;
      if (!l.trim()) { flushP(); closeL(); continue; }
      if ((m = l.match(/^(#{1,4})\s+(.*)/))) { flushP(); closeL(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
      if (/^(-{3,}|\*{3,})$/.test(l.trim())) { flushP(); closeL(); out.push('<hr>'); continue; }
      if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { flushP(); if (list !== 'ul') { closeL(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + inline(m[1]) + '</li>'); continue; }
      if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { flushP(); if (list !== 'ol') { closeL(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + inline(m[1]) + '</li>'); continue; }
      if ((m = l.match(/^>\s?(.*)/))) { flushP(); closeL(); out.push('<blockquote>' + inline(m[1]) + '</blockquote>'); continue; }
      closeL(); para.push(l.trim());
    }
    flushP(); closeL(); if (code) out.push('</code></pre>');
    return out.join('\n');
  }
  g.md = md;
})(typeof window !== 'undefined' ? window : module.exports);
