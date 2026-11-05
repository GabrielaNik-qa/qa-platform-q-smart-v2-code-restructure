// The default scorecard (used the first time the app starts and by seed.js) and the scoring function.
// A scorecard is: { id, name, desc, cats: [ { n: 'Category', k: false, it: [ { t: 'Criterion text', p: points, k: false } ] } ] }
//   item.k = critical item     -> if it is answered "No", the whole category scores 0 points
//   cat.k  = critical category -> if any item in it is answered "No", the whole review scores 0%
// The points of all items must add up to 100.
const DEFAULT_SC = {
  id: 'sc-default',
  name: 'Standard Scorecard - 7 categories',
  desc: 'Evaluation criteria for sales and support calls',
  cats: [
    { n: 'Greeting & Introduction', it: [
      { t: 'Greeted the customer warmly and introduced themselves and the company', p: 6 },
      { t: "Adapted tone and energy to the customer's mood (calm, serious, upbeat)", p: 4 } ] },
    { n: 'Vocabulary & Professionalism', it: [
      { t: 'Used clear, respectful language with no jargon, slang or banned phrases', p: 6 },
      { t: "Acknowledged the customer's recent activity or good news in a genuine way", p: 7 },
      { t: 'Asked open questions to understand what the customer wants', p: 7 } ] },
    { n: 'Empathy & Active Listening', it: [
      { t: 'Listened without interrupting and gave the customer space to speak', p: 5 },
      { t: "Used empathetic, reassuring language and paraphrased the customer's concerns", p: 6 },
      { t: 'Handled sensitive situations with care', p: 4 } ] },
    { n: 'Documentation & Reasoning', it: [
      { t: 'Selected the correct disposition status in the CRM', p: 5 } ] },
    { n: 'Process Adherence', it: [
      { t: 'Sent the follow-up SMS or email required by the workflow', p: 7 },
      { t: 'Confirmed the correct offer was set up before the call', p: 7 },
      { t: 'Confirmed the next step clearly before ending the call', p: 6 } ] },
    { n: 'Persuasion & Objection Handling', it: [
      { t: "Explored the customer's interest in continuing and framed a clear next opportunity", p: 7 },
      { t: 'Stayed calm and encouraging when the customer hesitated; handled objections professionally', p: 7 },
      { t: 'Suggested a suitable alternative and confirmed when the next conversation would take place', p: 6 } ] },
    { n: 'Closing & Positive Outcome', it: [
      { t: 'Closed the call politely and encouraged further engagement', p: 6 },
      { t: 'Recapped the actions taken or agreed during the call when needed', p: 4 } ] }
  ]
};

// answers: one array per category, one [ 'y' | 'n' | 'na', 'comment', 'root cause' ] per item.
// N/A means "not applicable": the item is left out of the possible points, so it never lowers the score.
// opt.all (decision 14, 4 November): every question must have Yes, No or N/A - nothing is counted as Yes in silence.
// When every question is N/A there is nothing to score: the review is "not scored" (ns) and stays out of every average.
function build(sc, ans, opt = {}) {
  if (!Array.isArray(ans) || ans.length !== sc.cats.length) throw new Error('bad answers');
  let zeroAll = false;
  const cs = sc.cats.map((c, ci) => {
    const row = ans[ci];
    if (!Array.isArray(row) || row.length !== c.it.length) throw new Error('bad answers');
    let e = 0, m = 0, critFail = false, anyNo = false;
    const it = c.it.map((i, ii) => {
      const x = Array.isArray(row[ii]) ? row[ii] : [];
      if (opt.all && !['y', 'n', 'na'].includes(x[0])) { const er = new Error('Answer every question before you save the review'); er.code = 'ANSWER'; throw er; }
      const a = ['y', 'n', 'na'].includes(x[0]) ? x[0] : 'y';
      if (a !== 'na') { m += i.p; if (a === 'y') e += i.p; }
      if (a === 'n') { anyNo = true; if (i.k) critFail = true; }
      return { t: i.t, p: i.p, k: !!i.k, cp: !!i.cp, a, cm: String(x[1] || '').slice(0, 300), rc: a === 'n' ? String(x[2] || '').slice(0, 60) : '' };   // rc = root cause (only kept for "No" answers)
    });
    if (critFail) e = 0;                       // critical item answered No -> category = 0 pts
    if (c.k && anyNo) zeroAll = true;          // critical category failed -> whole review = 0%
    return { n: c.n, k: !!c.k, e, m, z: critFail ? 1 : 0, it };
  });
  if (zeroAll) cs.forEach(c => { c.e = 0; c.z = 1; });
  const E = cs.reduce((a, c) => a + c.e, 0), M = cs.reduce((a, c) => a + c.m, 0);
  if (!zeroAll && !M) return { cs, sc: null, zero: false, ns: true };
  return { cs, sc: zeroAll ? 0 : Math.round(E / M * 1000) / 10, zero: zeroAll };
}
module.exports = { DEFAULT_SC, build };
