// ===================== Loading animations: the Q logo with a letter inside, and dots =====================
// 1 · Heartbeat (signing in, until the first page is ready): the wavy lines become a heartbeat trace and the ( ) brackets beat.
// 2 · Drawn by hand (opening a panel, like a slide transition): the Q draws itself with the panel's letter inside — L Learning,
//     W Workforce, C Compliance & CX, A Admin (S Set-up for non-admins).
// 3 · Sonar (anything slower than expected, and opening the AI Simulator panel with "AI" inside): the brackets travel outward.
// Each shows at least a short moment so it never flickers; with "reduce motion" switched on in the system, the logo stays still.
const QLSP = { learn: 'L', wf: 'W', cx: 'C', ai: 'AI', qi: 'Q' };
const qlLetter = s => QLSP[s] || (s === 'admin' ? (ME && ME.role === 'admin' ? 'A' : 'S') : 'Q');
const QLBR = (cls, l, r) => `<g class="${cls}" fill="none" stroke-linecap="round" stroke-width="6"><path ${l ? `style="--dx:-30px"` : ''} d="M182,42 Q172,62 182,82" stroke="#FFD447"/><path ${l ? `style="--dx:-30px;animation-delay:.25s"` : ''} d="M166,32 Q152,62 166,92" stroke="#FF9A1F"/><path ${l ? `style="--dx:-30px;animation-delay:.5s"` : ''} d="M150,24 Q132,62 150,100" stroke="#FF5C8A"/></g>`
  + `<g class="${cls}" fill="none" stroke-linecap="round" stroke-width="6"><path ${r ? `style="--dx:30px"` : ''} d="M298,42 Q308,62 298,82" stroke="#FFD447"/><path ${r ? `style="--dx:30px;animation-delay:.25s"` : ''} d="M314,32 Q328,62 314,92" stroke="#FF9A1F"/><path ${r ? `style="--dx:30px;animation-delay:.5s"` : ''} d="M330,24 Q348,62 330,100" stroke="#FF6B00"/></g>`;
const qlTxt = t => `<text class=qlt x="240" y="${t.length > 1 ? 72 : 75}" text-anchor="middle" style="font-size:${t.length > 1 ? 30 : 36}px">${esc(t)}</text>`;
const QLV = {
  beat: t => `<path class=qlecg d="M4,62 L70,62 L82,62 L90,40 L98,86 L106,30 L114,62 L140,62" stroke="#FF5C8A"/><path class=qlecg d="M340,62 L366,62 L374,30 L382,86 L390,40 L398,62 L410,62 L476,62" stroke="#FF6B00"/>`
    + QLBR('qlbeat') + `<circle cx="240" cy="62" r="40" fill="none" stroke="#FF6B00" stroke-width="10"/><path d="M266,90 L286,110" stroke="#FF5C8A" stroke-width="10" stroke-linecap="round"/>` + qlTxt(t),
  draw: t => QLBR('qlrp') + `<circle class=qldraw cx="240" cy="62" r="40" fill="none" stroke="#FF6B00" stroke-width="10" stroke-linecap="round" transform="rotate(-90 240 62)"/><path class=qlrp d="M266,90 L286,110" stroke="#FF5C8A" stroke-width="10" stroke-linecap="round"/>` + qlTxt(t).replace('class=qlt', 'class="qlt qlpop"'),
  sonar: t => QLBR('qlson', 1, 1).replace(/class="qlson"/g, 'class=qlsg').replace(/<path style/g, '<path class=qlson style') + `<g class=qlblink><circle cx="240" cy="62" r="40" fill="none" stroke="#FF6B00" stroke-width="10"/><path d="M266,90 L286,110" stroke="#FF5C8A" stroke-width="10" stroke-linecap="round"/></g>` + qlTxt(t)
};
let QL = null;   // the animation on screen: { el, at (when it appeared), kind }
function qlShow(kind, letter) {
  let el = document.getElementById('qload');
  if (!el) { el = document.createElement('div'); el.id = 'qload'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  clearTimeout(qlShow.t);
  el.innerHTML = `<svg viewBox="0 0 480 130" aria-hidden="true" style="overflow:visible">${QLV[kind](letter || 'Q')}</svg><div class=qldots><i></i><i></i><i></i></div><span class=sr-only>${esc(tr('Loading…'))}</span>`;
  el.className = 'on ql-' + kind; QL = { el, at: Date.now(), kind };
}
// hide once it has been on screen at least `min` ms (a panel change plays its whole drawing, sign-in a full heartbeat)
function qlHide(min = 0) {
  if (!QL) return; const q = QL, wait = Math.max(0, min - (Date.now() - q.at));
  qlShow.t = setTimeout(() => { if (QL !== q) return; q.el.className = 'off'; QL = null; }, wait);
}
// run a page change with the right animation: a new panel = drawn by hand; the AI simulator = sonar with "AI"; anything slower than
// 1.5 s = sonar with the letter of where you are going
async function qlRun(work, to, from) {
  const sp = spaceOf(to), panel = sp !== 'main' && sp !== spaceOf(from);
  const ai = (sp === 'ai' || sp === 'qi') && panel;            // the AI panels open with the sonar
  if (ai) qlShow('sonar', qlLetter(sp)); else if (panel) qlShow('draw', qlLetter(sp));
  const slow = QL ? null : setTimeout(() => qlShow('sonar', qlLetter(sp)), 1500);
  try { await work(); } finally { clearTimeout(slow); qlHide(ai ? 1300 : panel ? 1100 : 300); }
}
