// ===================== Admin › Account › Support › Contact support (Gabriela, 3 November) =====================
// A form: e-mail, subject, type of request, description, one file or picture (under 1 MB), Submit. Below it: my requests and their
// status. Admins see every request, open the file and set the status.
let SUPR = [], SUPD = null;
const SUPTYPES = [['question', 'A question'], ['problem', 'Something does not work'], ['idea', 'An idea'], ['billing', 'Billing'], ['other', 'Something else']];
const SUPSTS = { new: ['New', 'ac'], open: ['Being handled', 'wn'], answered: ['Answered', 'ok'], closed: ['Closed', 'mu'] };
function supFile(inp) { const f = inp.files && inp.files[0]; if (!f) { SUPD.file = null; return; }
  if (!/^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/plain)$/.test(f.type)) { inp.value = ''; return toast('Attach a picture (PNG, JPG, WEBP, GIF), a PDF or a text file', true); }
  if (f.size > 1048576) { inp.value = ''; return toast('The file must be smaller than 1 MB', true); }
  const rd = new FileReader(); rd.onload = () => { SUPD.file = { name: f.name, type: f.type, data: String(rd.result).split(',')[1] }; }; rd.readAsDataURL(f); }
async function supSend() { const d = SUPD; if (!d.subject.trim() || !d.desc.trim()) return toast('Write a subject and describe your request', true);
  await once('sup', async () => { const r = await api('/api/support', d); if (!r.ok) return toast(await errOf(r, 'Could not send'), true); SUPD = null; await load(); render(); toast('Thank you, your request was sent'); }); }
async function supStatus(id, status) { const r = await api('/api/support/' + id, { status }, 'PUT'); if (!r.ok) return toast(await errOf(r, 'Could not save'), true); await load(); render(); }
PG.cs_contact = function () {
  SUPD = SUPD || { email: ME.email || '', subject: '', type: 'question', desc: '', file: null }; const adm = ME.role === 'admin';
  const form = card('Send a request', `<div class=form style="max-width:none"><label>${tr('Your e-mail address')} <i class=rq>*</i><input type=email id=supe value="${esc(SUPD.email)}" oninput="SUPD.email=this.value"></label>`
    + `<label>${tr('Type of request')}<select onchange="SUPD.type=this.value">${SUPTYPES.map(([k, n]) => `<option value="${k}" ${SUPD.type === k ? 'selected' : ''}>${tr(n)}</option>`).join('')}</select></label>`
    + `<label>${tr('Subject')} <i class=rq>*</i><input id=sups maxlength=150 value="${esc(SUPD.subject)}" oninput="SUPD.subject=this.value"></label>`
    + `<label>${tr('Description')} <i class=rq>*</i><textarea id=supd rows=6 maxlength=5000 placeholder="${tr('What happened, on which page, and what you expected')}" oninput="SUPD.desc=this.value">${esc(SUPD.desc)}</textarea></label>`
    + `<label>${tr('A file or a picture (optional, under 1 MB)')}<input type=file accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain" onchange="supFile(this)"></label></div><div class=acts><button class=btn onclick="supSend()">${tr('Submit')}</button></div>`);
  const rows = SUPR.map(x => { const [sn, sc] = SUPSTS[x.status] || SUPSTS.new; return [`<b data-noi18n>${esc(x.subject)}</b><br><small class=mu>${esc(tr((SUPTYPES.find(t => t[0] === x.type) || ['', x.type])[1]))}${adm ? ' · ' + esc(x.byName || x.by) + ' · ' + esc(x.email) : ''}</small>${adm ? `<div class=mu data-noi18n style="white-space:pre-wrap;margin-top:4px">${esc(x.desc)}</div>` : ''}`,
    `<span class=mono>${fdt(x.at)}</span>`, x.file ? `<a href="/api/support/${x.id}/file">${esc(x.file.name)}</a>` : '—',
    adm ? `<select aria-label="Status" onchange="supStatus('${x.id}',this.value)">${Object.entries(SUPSTS).map(([k, [n]]) => `<option value="${k}" ${x.status === k ? 'selected' : ''}>${tr(n)}</option>`).join('')}</select>` : pill(sn, sc)]; });
  return head('Contact support', adm ? 'Send a request to the Q-smart team, and see every request of your company' : 'Send a request to the Q-smart team and follow your requests', bellBtn())
    + `<div class="g g2" style="align-items:start">${form}${card(`${tr(adm ? 'All requests' : 'My requests')} <span class=bg>${SUPR.length}</span>`, SUPR.length ? tbl(['Request', 'Sent', 'File', 'Status'], rows) : `<p class=mu style="margin:0">${tr('Nothing here yet.')}</p>`)}</div>`;
};
