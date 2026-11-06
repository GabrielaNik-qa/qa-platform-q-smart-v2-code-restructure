// Optional AI helpers (Anthropic API). Without a key everything still works: the import falls back to a simple splitter and
// quiz generation and AI rating are switched off. The key, the model and the monthly budget come from Admin › Integrations
// (server.js hands them over with setConfig); $env:ANTHROPIC_API_KEY / ANTHROPIC_MODEL still work when nothing is set there.
// Prices per million tokens (in, out) — used to keep the monthly budget.
const PRICE = { 'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5] };
let CFG = () => ({ key: process.env.ANTHROPIC_API_KEY || '', model: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5', budget: 0, used: 0 });
let USE = () => {};
const setConfig = (cfg, onUse) => { CFG = cfg; if (onUse) USE = onUse; };
const MODEL = () => CFG().model;
const enabled = () => !!CFG().key;
const costOf = (model, u) => { const p = PRICE[model] || PRICE['claude-opus-5-5'], i = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0); return (i * p[0] + (u.output_tokens || 0) * p[1]) / 1e6; };

// opt.model: another model for this call (Quinn always uses Haiku); opt.info: filled with the tokens and the cost of the call
async function ask(system, content, max = 8000, opt = {}) {
  const c = CFG(), model = opt.model || c.model;
  if (!c.key) throw new Error('The AI is not connected. An admin can add the key in Admin › Integrations.');
  if (c.budget > 0 && c.used >= c.budget) throw new Error("This month's AI budget is used up. An admin can raise it in Admin › Integrations.");
  const r = await fetch((process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: max, system, messages: [{ role: 'user', content }] }),
    signal: AbortSignal.timeout(180000)                                           // a request that hangs gives up after 3 minutes instead of waiting forever
  }).catch(e => { throw new Error(e.name === 'TimeoutError' ? 'The AI took too long to answer. Try again or use a shorter text.' : 'Could not reach the AI service'); });
  const j = await r.json().catch(() => null);
  if (r.ok && (!j || !Array.isArray(j.content))) throw new Error('The AI answer could not be read. Try again later.');   // a broken answer is an error, never an empty result
  if (r.status === 401 || r.status === 403) throw new Error('The AI key was not accepted. Check it in Admin › Integrations.');
  if (r.status === 429 || r.status === 529) throw new Error('The AI service is busy right now. Try again in a minute.');
  if (!r.ok) throw new Error('The AI service answered with an error (' + r.status + '). Try again later.');
  if (j && j.usage) { const usd = costOf(model, j.usage); USE(usd); if (opt.info) Object.assign(opt.info, { in: j.usage.input_tokens || 0, out: j.usage.output_tokens || 0, usd }); }                                  // counts towards this month's budget
  if (j.stop_reason === 'refusal') throw new Error('The AI declined this request. Try a different text.');
  return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
}
const parseJson = t => {
  t = String(t).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
};
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const cleanArticle = a => ({ title: str(a.title, 150) || 'Untitled', folder: str(a.folder, 200), topics: (Array.isArray(a.topics) ? a.topics : []).map(x => str(x, 40)).filter(Boolean).slice(0, 8), body: str(a.body, 200000) });
const cleanQs = qs => (Array.isArray(qs) ? qs : []).map(q => ({ q: str(q.q, 400), opts: (Array.isArray(q.opts) ? q.opts : []).map(o => str(o, 200)).filter(Boolean).slice(0, 6), a: Number(q.a), why: str(q.why, 400) }))
  .filter(q => q.q && q.opts.length >= 2 && Number.isInteger(q.a) && q.a >= 0 && q.a < q.opts.length).slice(0, 30);

// ---- no AI: split a text into articles at its headings
const STOP = new Set('about after again also because before being between could does doing during each from have having into more most other should that their them then there these they this those through very were what when where which while will with would your'.split(' '));
function splitText(text, filename) {
  const base = String(filename || 'Imported document').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim() || 'Imported document';
  text = String(text || '').replace(/\r/g, '').trim();
  const parts = []; let cur = null;
  for (const line of text.split('\n')) {
    const m = line.match(/^(#{1,2})\s+(.*)/);
    if (m) { if (cur) parts.push(cur); cur = { title: m[2].trim(), body: '' }; } else { if (!cur) cur = { title: base, body: '' }; cur.body += line + '\n'; }
  }
  if (cur) parts.push(cur);
  return parts.filter(p => p.body.trim() || p.title).map(p => {
    const words = (p.title + ' ' + p.body).toLowerCase().match(/[a-zà-ÿ]{5,}/g) || [], freq = Object.create(null);   // a plain counter: "constructor" is just a word here
    words.forEach(w => { if (!STOP.has(w)) freq[w] = (freq[w] || 0) + 1; });
    const topics = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w[0].toUpperCase() + w.slice(1));
    return cleanArticle({ title: p.title, folder: parts.length > 1 ? base : '', topics, body: p.body.trim() });
  });
}

async function draftArticles({ text, pdf, filename, folders }) {
  if (!enabled()) {
    if (!text) throw new Error('Without the AI connection only text, Markdown, HTML and Word files can be imported.');
    return { ai: false, articles: splitText(text, filename) };
  }
  const system = 'You are a knowledge base editor for a call-center quality team. Turn the source material into clear, well structured knowledge base articles. '
    + 'Stay faithful to the source: never invent facts. Split long material into several focused articles. Write in the same language as the source. '
    + 'Use Markdown for the body (## headings, - lists, **bold**). For each article choose 1-5 short topics and suggest a folder path such as "Processes/Objection handling" '
    + (folders && folders.length ? '(prefer one of these existing folders when it fits: ' + folders.slice(0, 60).join('; ') + ')' : '') + '. '
    + 'Reply with JSON only: {"articles":[{"title":"","folder":"","topics":[""],"body":""}]}';
  const content = [];
  if (pdf) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf } });
  content.push({ type: 'text', text: (filename ? 'File name: ' + filename + '\n\n' : '') + (text ? String(text).slice(0, 120000) : 'Analyse the attached document.') });
  const j = parseJson(await ask(system, content));
  const articles = (j.articles || []).map(cleanArticle).filter(a => a.body);
  if (!articles.length) throw new Error('The AI did not return any article. Try again or paste a shorter text.');
  return { ai: true, articles };
}

async function draftQuiz({ text, count }) {
  if (!enabled()) throw new Error('Connect the AI (Admin › Integrations) to generate questions automatically, or add them by hand.');
  const n = Math.min(20, Math.max(3, Number(count) || 5));
  const system = `You write multiple-choice quiz questions for call-center agents. Use ONLY the material you are given. Write exactly ${n} questions, each with 4 options, one correct answer and a one-sentence explanation. `
    + 'Write in the same language as the material. Reply with JSON only: {"questions":[{"q":"","opts":["","","",""],"a":0,"why":""}]} where "a" is the index (0-3) of the correct option.';
  const j = parseJson(await ask(system, [{ type: 'text', text: String(text).slice(0, 100000) }], 6000));
  const questions = cleanQs(j.questions);
  if (!questions.length) throw new Error('The AI did not return usable questions. Try again.');
  return { questions };
}

// rate one conversation for every Auto QA category (0-100 each)
async function scoreConversation(text, cats) {
  if (!enabled()) throw new Error('Connect the AI (Admin › Integrations) to rate conversations with AI.');
  const system = 'You are a call-center quality analyst. Rate ONLY what the agent said in the conversation for each category from 0 (very poor) to 100 (excellent). '
    + 'Be strict and consistent. Reply with JSON only: {"scores":{"<categoryId>":{"score":0,"reason":"one short sentence"}}}';
  const list = cats.map(c => `- ${c.id}: ${c.name}${c.desc ? ' (' + c.desc + ')' : ''}`).join('\n');
  const j = parseJson(await ask(system, [{ type: 'text', text: 'Categories:\n' + list + '\n\nConversation:\n' + String(text).slice(0, 30000) }], 2000));
  const scores = {}; let w = 0, tot = 0;
  cats.forEach(c => { const x = (j.scores || {})[c.id]; if (x && Number.isFinite(Number(x.score))) { const s = Math.max(0, Math.min(100, Math.round(Number(x.score)))), wt = Number(c.weight) || 1; scores[c.id] = { s, hits: [], bad: [], why: str(x.reason, 200) }; w += wt; tot += s * wt; } });
  if (!w) throw new Error('The AI did not return scores.');
  return { scores, total: Math.round(tot / w), mode: 'ai', at: new Date().toISOString() };
}
// a tiny request to check that the key and the model work (Admin › Integrations › Test)
const ping = async () => { const t = await ask('Reply with the single word OK.', [{ type: 'text', text: 'Test' }], 64); return { ok: true, model: MODEL(), reply: str(t, 20) }; };

// AI QA reviewer: answers every item of the company's scorecard for one conversation, as a careful reviewer would.
// It only makes a draft: a person approves it (changing answers if needed) or rejects it.
async function reviewDraft({ text, sc, playbook }) {
  if (!enabled()) throw new Error('Connect the AI (Admin › Integrations) to draft reviews with AI.');
  const list = sc.cats.map((c, ci) => `${ci + 1}. ${c.n}${c.k ? ' (critical category: one No fails the whole review)' : ''}\n` + c.it.map((i, ii) => `   ${ci + 1}.${ii + 1} ${i.t}${i.k ? ' [critical item]' : ''}`).join('\n')).join('\n');
  const system = 'You are an experienced call-center quality reviewer. Score the conversation with the company scorecard exactly as a careful human reviewer would. '
    + 'For every item answer "y" (done well), "n" (not done, or done badly) or "na" (the situation did not come up). Judge ONLY what the agent said; never invent facts. '
    + 'For every "n" write one short comment that points to the moment in the conversation. Then write a short overall comment for the agent: what went well and the one thing to improve, warm and specific. '
    + 'Give your confidence from 0 to 100. Write the comments in the language of the conversation. '
    + (playbook ? 'Follow these company rules:\n' + String(playbook).slice(0, 4000) + '\n' : '')
    + 'Reply with JSON only: {"answers":[[{"a":"y","cm":""}]],"comment":"","confidence":80} with one inner list per category in the order given, one object per item.';
  const j = parseJson(await ask(system, [{ type: 'text', text: 'Scorecard:\n' + list + '\n\nConversation:\n' + String(text).slice(0, 40000) }], 6000));
  const a = sc.cats.map((c, ci) => c.it.map((i, ii) => { const x = ((j.answers || [])[ci] || [])[ii] || {}; return [['y', 'n', 'na'].includes(x.a) ? x.a : 'na', str(x.cm, 300), '']; }));
  return { a, comment: str(j.comment, 1000), confidence: Math.max(0, Math.min(100, Math.round(Number(j.confidence) || 0))) };
}

// AI team lead: a short weekly summary of a team from the numbers it is given (never invents any)
async function teamSummary(stats, playbook) {
  const system = 'You are an experienced call-center team lead writing the weekly quality summary for your manager and your team. '
    + 'Use ONLY the numbers and facts given. Write in plain, friendly English, at most 180 words, as Markdown with four short parts: '
    + '"**How the week went**", "**What changed**", "**Who needs attention**" (names and why), "**Next week**" (three concrete actions). '
    + (playbook ? 'Company rules to keep in mind:\n' + String(playbook).slice(0, 4000) + '\n' : '');
  return str(await ask(system, [{ type: 'text', text: JSON.stringify(stats) }], 3000), 4000);
}
// AI team lead: a coaching plan draft for one agent (a person approves it before it becomes a coaching session)
async function coachPlan(data, playbook) {
  const system = 'You are an experienced call-center team lead. Draft a short, practical coaching plan for one agent from the review data given. '
    + 'Focus on the one or two weakest areas. Base everything ONLY on the data; never invent facts. Write in plain, encouraging English. '
    + (playbook ? 'Company rules to keep in mind:\n' + String(playbook).slice(0, 4000) + '\n' : '')
    + 'Reply with JSON only: {"title":"","goals":"","focus":["category name"],"actions":[{"t":"what the agent does","days":7}],"notes":"what to discuss in the session"} with 2 to 4 actions, days = days from today.';
  const j = parseJson(await ask(system, [{ type: 'text', text: JSON.stringify(data) }], 3000));
  return { title: str(j.title, 150) || 'Coaching plan', goals: str(j.goals, 2000), focus: (Array.isArray(j.focus) ? j.focus : []).map(x => str(x, 80)).filter(Boolean).slice(0, 6),
    actions: (Array.isArray(j.actions) ? j.actions : []).map(a => ({ t: str(a && a.t, 200), days: Math.max(1, Math.min(60, Math.round(Number(a && a.days) || 7))) })).filter(a => a.t).slice(0, 6), notes: str(j.notes, 3000) };
}
// AI trainer: plays the customer in a practice call (role-play), then scores what the agent did
const talk = msgs => msgs.map(m => (m.r === 'a' ? 'Agent: ' : 'Customer: ') + m.t).join('\n');
const rules = playbook => playbook ? '\nCompany rules the agent should follow:\n' + String(playbook).slice(0, 4000) : '';
async function roleCustomer(sc, msgs, playbook) {
  const system = 'You play the CUSTOMER in a call-center training role-play; the trainee is the agent. Stay in character: never act as the agent, never give advice, never say that this is a role-play or that you are an AI. '
    + 'Who you are: ' + sc.persona + '. Your situation: ' + sc.brief + ' '
    + 'Reply with 1 to 3 short, natural sentences, in the same language as the agent. Be realistic: push back when the agent is vague or ignores you, calm down when they listen and offer a real solution. '
    + 'When your problem is fully handled, or the agent has clearly lost you, end your reply with the tag [END].' + rules(playbook);
  const t = await ask(system, [{ type: 'text', text: 'The call so far:\n' + talk(msgs) + "\n\nWrite only the customer's next reply." }], 400);
  return { reply: str(t.replace(/\[END\]/gi, '').replace(/^\s*customer:\s*/i, ''), 600) || '…', end: /\[END\]/i.test(t) };
}
async function roleScore(sc, msgs, playbook) {
  const system = 'You are an experienced call-center trainer. Score how well the AGENT handled this practice call, from 0 to 100. Judge only what the agent said: listening and empathy, clear questions, a real solution, the company rules, a good close. '
    + 'Write in plain, encouraging words, in the language of the call.' + rules(playbook)
    + '\nReply with JSON only: {"score":0,"good":["what went well"],"tips":["one concrete thing to do differently"]} with 1 to 3 items in each list.';
  const j = parseJson(await ask(system, [{ type: 'text', text: 'Scenario: ' + sc.name + '. ' + sc.brief + '\n\nThe call:\n' + talk(msgs).slice(0, 30000) }], 1500));
  const l = v => (Array.isArray(v) ? v : []).map(x => str(x, 200)).filter(Boolean).slice(0, 3);
  return { score: Math.max(0, Math.min(100, Math.round(Number(j.score) || 0))), good: l(j.good), tips: l(j.tips) };
}
// AI analyst: answers a question about the quality data from the numbers it is given (never invents any)
async function analystReport(pack, question, playbook) {
  const system = 'Your name is Quinn, the AI assistant of Q-smart. You are a senior data analyst for a call-center quality team. Answer the question using ONLY the numbers in the data you are given; never invent numbers, names or causes. '
    + 'Compare with the previous period when it helps. If the data cannot answer the question, say so plainly and say what data would be needed. '
    + 'Write in plain English for managers, in Markdown: a one-line answer first, then short sections with ## headings and bullet points, at most 300 words, and end with "## Recommended actions" (2 or 3 bullets).'
    + (playbook ? '\nCompany rules (use them to judge what matters):\n' + String(playbook).slice(0, 4000) : '');
  return str(await ask(system, [{ type: 'text', text: 'Question: ' + question + '\n\nData (JSON):\n' + JSON.stringify(pack).slice(0, 60000) }], 3000), 8000);
}
// AI team lead: the morning brief of a team for its team lead, from the facts of the day (never invents any), in the lead's language
async function morningBrief(facts, playbook, lang) {
  const L = { bg: 'Bulgarian', fr: 'French' }[lang] || 'English';
  const system = 'You write the morning brief of a call-center team for its team lead. Use ONLY the facts given; never invent names, numbers or reasons. '
    + 'Write in ' + L + ', in Markdown, at most 150 words: one line that sums up the morning, then short bullet points under the headings Right now, To watch, This week and Waiting for you '
    + '(translate the headings, leave out a heading with nothing under it). Be kind and practical, and end with one concrete thing to do first.'
    + (playbook ? '\nCompany rules:\n' + String(playbook).slice(0, 4000) : '');
  return str(await ask(system, [{ type: 'text', text: JSON.stringify(facts).slice(0, 30000) }], 1200), 4000);
}
module.exports = { ask, enabled, MODEL, PRICE, setConfig, ping, reviewDraft, teamSummary, coachPlan, roleCustomer, roleScore, talk, analystReport, morningBrief, draftArticles, draftQuiz, splitText, cleanQs, scoreConversation };
