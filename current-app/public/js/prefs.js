// Pop-up preferences: which messages a person has switched off ("Don't show me this again"). Runs in the browser and in the tests.
// Only the messages listed here can ever be hidden, each by its own fixed id (never by its text). Errors, permission and network
// problems, security notices and the safeguards (deleting, unsaved changes, passwords, access, disputes, score changes) are NOT
// in this list, so no setting can hide them.
(function (g) {
  const MSGS = {
    // informational: welcome message and "How it works" tips
    welcome: { kind: 'info', name: 'Welcome message', where: 'Home, once after you sign in' },
    'tip.entry': { kind: 'info', name: 'How scoring works', where: 'Quality › QA Entry' },
    'tip.sc-rules': { kind: 'info', name: 'Critical rules', where: 'Scorecards › editing a scorecard' },
    'tip.categories': { kind: 'info', name: 'How it works: categories', where: 'Scorecards › Categories' },
    'tip.roots': { kind: 'info', name: 'How it works: root causes', where: 'Scorecards › Root causes' },
    'tip.aqcats': { kind: 'info', name: 'How it works: Auto QA', where: 'Scorecards › Auto QA categories' },
    'tip.workspaces': { kind: 'info', name: 'How it works: workspaces', where: 'Admin › Workspaces' },
    // routine confirmations: low risk, easy to undo (the action then offers an Undo button instead of asking first)
    'confirm.move-user': { kind: 'confirm', name: 'Moving an agent to another team', where: 'Admin › Teams' },
    'confirm.del-notif': { kind: 'confirm', name: 'Deleting one of your notifications', where: 'Notifications (the bell)' }
  };
  // whatever was saved (missing, broken or from an older version) becomes a safe, complete set of preferences
  const prefsOf = p => {
    p = p && typeof p === 'object' && !Array.isArray(p) ? p : {};
    const off = p.off && typeof p.off === 'object' && !Array.isArray(p.off) ? p.off : {};
    return { info: p.info !== false, confirm: p.confirm !== false, off };
  };
  // true = show it. An id that is not in the list always shows: only registered messages can be switched off.
  const msgOn = (prefs, id) => {
    const m = MSGS[id]; if (!m) return true;
    const p = prefsOf(prefs);
    if (m.kind === 'info' && !p.info) return false;
    if (m.kind === 'confirm' && !p.confirm) return false;
    return !p.off[id];
  };
  const isConfirm = id => !!(MSGS[id] && MSGS[id].kind === 'confirm');
  const isInfo = id => !!(MSGS[id] && MSGS[id].kind === 'info');
  // the messages this person switched off one by one (unknown ids from older versions are left out)
  const offList = prefs => Object.entries(prefsOf(prefs).off).filter(([id]) => MSGS[id]).map(([id, at]) => ({ id, at, ...MSGS[id] }));
  g.PREFMSG = { MSGS, prefsOf, msgOn, isConfirm, isInfo, offList };
})(typeof window !== 'undefined' ? window : module.exports);
