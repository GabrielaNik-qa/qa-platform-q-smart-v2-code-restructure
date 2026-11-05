// Auto QA engine (rule based). It reads what the AGENT said in a transcript and rates every enabled Auto QA category from 0 to 100.
//  - a category with "good phrases": 30 if none of them is found, 70 + 15 per phrase found (max 100)
//  - a category without good phrases starts at 100
//  - every "bad phrase" found takes 35 points off
// The total is the weighted average of the categories. (With the AI connected, the same categories can be rated by Claude instead.)
const agentText = text => { const l = String(text || '').split('\n').filter(x => /^\s*agent\s*:/i.test(x)); return (l.length ? l.join('\n') : String(text || '')).toLowerCase(); };
const scoreRules = (t, c) => {
  const hits = (c.pos || []).filter(p => t.includes(String(p).toLowerCase())), bad = (c.neg || []).filter(p => t.includes(String(p).toLowerCase()));
  let s = (c.pos && c.pos.length) ? (hits.length ? Math.min(100, 70 + hits.length * 15) : 30) : 100; s -= bad.length * 35;
  return { s: Math.max(0, Math.min(100, s)), hits, bad };
};
function scoreConv(text, cats) {
  const t = agentText(text), scores = {}; let w = 0, tot = 0;
  cats.filter(c => c.enabled !== false).forEach(c => { const r = scoreRules(t, c), wt = Number(c.weight) || 1; scores[c.id] = r; w += wt; tot += r.s * wt; });
  return { scores, total: w ? Math.round(tot / w) : 0, mode: 'rules', at: new Date().toISOString() };
}
module.exports = { scoreConv, scoreRules, agentText };
