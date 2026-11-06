// Q Trainer (until 4 November: the Call Simulator): practice calls for any company, not one industry. Scenarios grouped by
// segment (Customer service, Sales, Retention) and level, a written customer (or the AI customer when an admin switched it on),
// indicators that are ticked while the agent speaks, and at the end the agent chooses how the call ended. Each indicator trains
// one scorecard category, so an agent who is weak in a category is suggested the scenarios that train it.
// Everything here is plain rules, no AI: the same call always gets the same score.
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

// the languages the AI customer can speak (the written customer speaks the language its lines are written in)
const LANGS = { en: 'English', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian', pt: 'Portuguese', el: 'Greek', bg: 'Bulgarian' };
const OUT_CS = ['Solved', 'Escalated to a colleague', 'The customer will call back', 'Not solved'];
const OUT_SA = ['Sale: the customer said yes', 'Follow-up: send the offer and call back', 'Not interested', 'Do not call again'];
const OUT_RE = ['Won back: the customer accepted the offer', 'Callback: call again later', 'Not interested', 'Do not call again'];
// the scorecard categories an indicator trains, found in any company's category names (English names of the 7 usual ones, or similar)
const CAT = { greet: /greet|intro|open/i, empathy: /empath|listen|understand/i, persuade: /persua|objection|sell|offer|negotiat/i, process: /process|complian|procedure|adherence|policy/i,
  close: /clos|outcome|result|next step/i, vocab: /vocab|professional|language|writ|clarity/i };
// the checklists the built-in scenarios share: an indicator is met when the agent says one of its words; c = the category it trains
const I = {
  greet: ['Greets and says their name', ['hello', 'good morning', 'good afternoon', 'my name is', 'this is', "i'm calling", 'i am calling'], 'greet'],
  rec: ['Says the call is recorded', ['recorded', 'recording'], 'process'],
  empathy: ['Shows understanding', ['understand', 'sorry', 'i see', 'i hear you', 'apologi', 'frustrat'], 'empathy'],
  ask: ['Asks a question', ['?', 'could you tell', 'can you tell', 'may i ask'], 'empathy'],
  offer: ['Explains the offer clearly', ['offer', 'discount', '%', 'free', 'plan', 'package', 'special price'], 'persuade'],
  terms: ['Gives the conditions', ['terms', 'conditions', 'contract', 'per month', 'valid until', 'minimum', 'no commitment', 'cancel anytime'], 'process'],
  value: ['Shows the value', ['include', 'value', 'benefit', 'save', 'worth'], 'persuade'],
  option: ['Offers an option or a solution', ['option', 'instead', 'offer you', 'i can', 'we can', 'discount', 'pause', 'refund'], 'persuade'],
  next: ['Agrees the next step', ['send', 'e-mail', 'email', 'sms', 'text you', 'call you back', 'tomorrow', 'next step', 'meeting'], 'close'],
  close: ['Closes politely', ['thank you', 'thanks for', 'have a nice', 'have a great', 'goodbye', 'bye'], 'close'],
  verify: ['Checks the identity', ['date of birth', 'security', 'verify', 'confirm your', 'postcode'], 'process'],
  steps: ['Gives simple steps', ['first', 'then', 'step', 'tap', 'click', 'open the'], 'vocab']
};
const ind = (...k) => k.map(x => ({ t: I[x][0], kw: I[x][1], c: I[x][2] }));
const CS = (level, inds, lines, correct) => ({ seg: 'Customer service', level, inds: ind(...inds), lines, outcomes: OUT_CS, correct });
// a built-in scenario of sales or retention: seg, its outcomes and the right one, and the indicators it checks
const MK = (seg, out, right, keys) => (id, name, who, level, brief, open, lines) => ({ id, seg, name, who, persona: who.toLowerCase(), level, brief, open, lines, inds: ind(...keys), outcomes: out, correct: right });
const SA = MK('Sales', OUT_SA, OUT_SA[0], ['greet', 'ask', 'value', 'offer', 'terms', 'next', 'close']);
const FU = MK('Sales', OUT_SA, OUT_SA[1], ['greet', 'rec', 'ask', 'value', 'next', 'close']);
const RT = MK('Retention', OUT_RE, OUT_RE[0], ['greet', 'rec', 'ask', 'offer', 'terms', 'next', 'close']);
// what the built-in scenarios of routes-ai.js get on top of their name, customer and first sentence
const EXTRA = {
  price: CS(2, ['greet', 'empathy', 'ask', 'value', 'option', 'close'],
    ['I saw the same thing cheaper somewhere else, to be honest.', 'Hm. And what would that cost me per month?', 'OK, that sounds fair. Send me the details and I will think about it.'], 'The customer will call back'),
  late: CS(3, ['greet', 'empathy', 'ask', 'option', 'next', 'close'],
    ['I wrote to you twice! I need it for a birthday on Saturday.', 'So can you get it to me before Saturday or not?', 'Fine. Please make sure it really arrives this time.'], 'Solved'),
  cancel: CS(3, ['greet', 'empathy', 'ask', 'option', 'next', 'close'],
    ['I hardly use it any more, it is a waste of money.', 'A cheaper plan? What would that look like?', 'OK, let us try that for a month then.'], 'Solved'),
  tech: CS(2, ['greet', 'empathy', 'ask', 'steps', 'next', 'close'],
    ["I don't know which version I have, I'm not good with phones.", 'OK… I tapped it. Now what?', 'Oh, it works now! Thank you.'], 'Solved'),
  ident: CS(1, ['greet', 'empathy', 'verify', 'next', 'close'],
    ['Why do you need all that? I just want the address changed.', 'Fine. My date of birth is the 3rd of May 1985.', 'Good. Thanks, that was quick in the end.'], 'Solved')
};
// sales and retention calls that fit any product: a subscription, a service, a shop, software, insurance …
const MORE = [
  SA('inbound', 'Inbound enquiry', 'Interested customer', 1, 'You saw the product online and want to know what it costs and what is included. You buy if the agent asks what you need and explains a fitting plan clearly.', 'Hi, I saw your website and I would like to know more.',
    ['Mostly for my small team, about five people.', 'And how much is that per month? Is there a contract?', 'OK, that works for me. Let us do it.']),
  SA('upsell', 'Upgrade an existing customer', 'Happy customer on a basic plan', 2, 'You have used the basic plan for a year and you like it. You upgrade if the agent shows what the bigger plan adds for you and what it costs.', 'Hello, yes, I am a customer. What is this about?',
    ['It works fine, but we are growing a bit.', 'What would I get more, and what would it cost?', 'Sounds good. Send me the details and we upgrade.']),
  FU('cold', 'Cold call to a business', 'Busy office manager', 4, 'You did not expect the call and you have five minutes. You agree to a follow-up only if the agent is quick, asks about your needs and gives a real reason.', 'Yes? Who is calling?',
    ['We already have a supplier for that.', 'Hm. What would be different with you?', 'Fine, send me something by e-mail and call me next week.']),
  RT('wb30', 'Recently inactive customer (8-30 days)', 'Customer who stopped recently', 1, 'You stopped using the service two weeks ago because you were busy. You come back easily if the offer is good and clear.', 'Hello?',
    ['Yes, I have been busy lately. What is it about?', 'That sounds nice. What are the conditions?', 'Fine, send me the offer, I will start again this week.']),
  RT('wb90', 'Inactive customer (31-90 days)', 'Customer who is drifting away', 3, 'You stopped two months ago because a competitor was cheaper. You need a concrete reason and a fair offer to come back.', 'Hello, who am I speaking to?',
    ['I use another company now, they were cheaper.', 'Hm, and is there a contract with that?', 'Alright, send it over, I will compare.']),
  RT('wb120', 'Long-inactive customer (90 days+)', 'Long-gone customer', 5, 'You left half a year ago and you are annoyed to be called. You stay polite only if the agent is respectful, quick and clear.', 'Who gave you my number?',
    ['I really have not used it in ages.', 'Okay, okay. What is the offer then?', 'Just send it to my e-mail, I have to go.']),
  RT('vip', 'Key account that went quiet', 'Important customer', 4, 'You are one of the biggest customers but nobody called you since your account manager changed. You expect personal attention and a clear plan.', 'Hello, yes?',
    ['Nobody has called me for weeks. My old manager always did.', 'And what is in it for us now?', 'Good. Send me the details and call me next week.'])
];
// a scenario as the simulator uses it: the extra parts are added to a built-in one, or taken from one a trainer wrote
const full = s => ({ seg: 'Customer service', level: 2, inds: [], lines: [], outcomes: OUT_CS, correct: '', ...s, ...(EXTRA[s.id] || {}) });
// does a scenario train this scorecard category? (through the category of its indicators; one a trainer wrote names its categories)
const trains = (sc, cat) => (sc.cats || []).some(c => String(c).toLowerCase() === String(cat).toLowerCase()) || (sc.inds || []).some(x => x.c && CAT[x.c] && CAT[x.c].test(cat));

// what a trainer writes in Q Trainer › Scenarios, cleaned: indicators are "label: word, word", one per line
const extraBody = b => {
  const lines = (Array.isArray(b.lines) ? b.lines : String(b.lines || '').split('\n')).map(x => str(x, 400)).filter(Boolean).slice(0, 12);
  const inds = (Array.isArray(b.inds) ? b.inds : []).slice(0, 12).map(x => ({ t: str(x && x.t, 80), kw: (Array.isArray(x && x.kw) ? x.kw : String((x && x.kw) || '').split(',')).map(k => str(k, 40).toLowerCase()).filter(Boolean).slice(0, 12) })).filter(x => x.t && x.kw.length);
  const outcomes = (Array.isArray(b.outcomes) ? b.outcomes : String(b.outcomes || '').split('\n')).map(x => str(x, 80)).filter(Boolean).slice(0, 8);
  const level = Math.max(1, Math.min(5, Math.round(Number(b.level) || 2)));
  const cats = (Array.isArray(b.cats) ? b.cats : String(b.cats || '').split(',')).map(x => str(x, 80)).filter(Boolean).slice(0, 10);   // the scorecard categories it trains
  return { seg: str(b.seg, 40) || 'Customer service', level, lines, inds, outcomes, correct: outcomes.includes(str(b.correct, 80)) ? str(b.correct, 80) : '', cats };
};

// the indicators met by the agent's replies, with the reply that met each one first
function grade(sc, msgs, outcome) {
  const mine = msgs.filter(m => m.r === 'a').map(m => ' ' + m.t.toLowerCase() + ' ');
  const inds = (sc.inds || []).map(x => { const turn = mine.findIndex(t => x.kw.some(k => t.includes(k))); return { t: x.t, ok: turn >= 0, turn: turn + 1 }; });
  const has = (sc.outcomes || []).length && sc.correct, right = has ? outcome === sc.correct : null;
  const met = inds.filter(x => x.ok).length, n = inds.length;
  // the indicators count for 80 points and the right outcome for 20; a scenario without a right outcome is scored on its indicators only
  const score = !n && !has ? 0 : Math.round(has ? (n ? met / n * 80 : 80) + (right ? 20 : 0) : met / n * 100);
  const fb = mine.map((t, i) => { const hit = inds.filter(x => x.turn === i + 1).map(x => x.t); return { turn: i + 1, hit }; });
  return { inds, score, right, fb, good: inds.filter(x => x.ok).map(x => x.t).slice(0, 6), tips: inds.filter(x => !x.ok).map(x => 'Next time: ' + x.t.charAt(0).toLowerCase() + x.t.slice(1)).slice(0, 6) };
}
module.exports = { LANGS, MORE, full, extraBody, grade, trains };
