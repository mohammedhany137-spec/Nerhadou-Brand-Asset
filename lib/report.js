'use strict';

/* The figures of the monthly report and of the approval digest, worked out on the
 * server from the stored tables with the same rules as the Tracking System Dashboard:
 *
 *   company sales   actual units x unit price (XF), months up to the last one with sales
 *   target          the year's target units / 12 per month x unit price (a row's own
 *                   target when the product has no line in Targets)
 *   Ach% vs target  company sales / target, rounded
 *   budget, spend   planned budget lines and expenses of the year; rejected rows are left out
 *
 * These are company sales. In-market (IQVIA) figures are not part of this report.
 */
const { normBrand, roster, findUser, brandsFor, teams } = require('./team');
const { specIndex, filterValue } = require('./scope');

const PENDING = 'Waiting for Admin Approval';
const APPROVAL_KEYS = ['budget', 'sales', 'conferences', 'events', 'expenses'];
const TITLES = { budget: 'Budget', sales: 'Sales', conferences: 'Conferences', events: 'Events and Campaigns', expenses: 'Expenses' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const num = v => +v || 0;
const sum = (a, f) => a.reduce((x, r) => x + num(f(r)), 0);
const live = r => r && r.status !== 'Rejected';
const yearOf = r => String(r.year || r.month || r.date || '').slice(0, 4);
const pct = (a, b) => b > 0 ? Math.round(a / b * 100) : 0;
const fmt = v => Math.round(num(v)).toLocaleString('en-US');
const arr = v => Array.isArray(v) ? v : [];

/* The page keeps one sales row per brand per month; rows that were never merged are added up here the same way. */
function oneRowPerMonth(rows) {
  const by = new Map();
  rows.forEach(r => {
    const k = String(r.brand || '') + '|' + String(r.month || '');
    const x = by.get(k);
    if (!x) by.set(k, Object.assign({}, r));
    else { x.actual = num(x.actual) + num(r.actual); x.target = num(x.target) + num(r.target); }
  });
  return [...by.values()];
}

/* One line per brand that has sales, a target or a budget in `year`. */
function brandReport(data, year) {
  const Y = String(year);
  const sales = oneRowPerMonth(arr(data.sales).filter(r => live(r) && yearOf(r) === Y));
  const budget = arr(data.budget).filter(r => live(r) && yearOf(r) === Y);
  const spendRows = arr(data.expenses).filter(r => live(r) && yearOf(r) === Y);
  const targets = arr(data.target).filter(r => String(r.year || '2026') === Y);
  const monthNo = r => +String(r.month || '').replace('-', '') || 0;
  const last = Math.max(0, ...sales.filter(r => num(r.actual) > 0).map(monthNo));
  const ytd = sales.filter(r => monthNo(r) <= last);
  const perMonth = r => { const t = targets.filter(x => x.brand === r.brand); return t.length ? sum(t, x => x.units) / 12 : num(r.target); };

  const names = [];
  const seen = new Set();
  arr(data.portfolio).map(p => p && p.brand).concat(sales.map(r => r.brand), budget.map(r => r.brand)).forEach(b => {
    const k = normBrand(b);
    if (k && !seen.has(k)) { seen.add(k); names.push(b); }
  });

  const rows = names.map(b => {
    const s = ytd.filter(r => r.brand === b);
    const target = sum(s, r => perMonth(r) * num(r.price));
    const actual = sum(s, r => num(r.actual) * num(r.price));
    const planned = sum(budget.filter(r => r.brand === b), r => r.amount);
    const spent = sum(spendRows.filter(r => r.brand === b), r => r.amount);
    return { brand: b, target, actual, ach: pct(actual, target), budget: planned, spent, used: pct(spent, planned) };
  }).filter(r => r.target || r.actual || r.budget || r.spent);

  const mo = last % 100;
  return { year: Y, ytd: last && mo >= 1 && mo <= 12 ? 'YTD ' + MONTHS[mo - 1] : 'YTD', rows };
}

function totals(rows) {
  const t = { brand: 'Total', target: sum(rows, r => r.target), actual: sum(rows, r => r.actual), budget: sum(rows, r => r.budget), spent: sum(rows, r => r.spent) };
  t.ach = pct(t.actual, t.target); t.used = pct(t.spent, t.budget);
  return t;
}

function reportTable(rep, rows, esc) {
  const th = 'style="text-align:right;padding:6px 10px;border-bottom:2px solid #c7d2fe;color:#1e3a8a;font-size:12px"';
  const td = 'style="text-align:right;padding:6px 10px;border-bottom:1px solid #e2e8f0;font-variant-numeric:tabular-nums"';
  const left = s => s.replace('text-align:right', 'text-align:left');
  const colour = r => r.target > 0 ? (r.ach >= 100 ? '#047857' : r.ach >= 80 ? '#b45309' : '#b91c1c') : '#64748b';
  const line = (r, bold) => '<tr' + (bold ? ' style="font-weight:700;background:#f1f5f9"' : '') + '><td ' + left(td) + '>' + esc(r.brand) + '</td><td ' + td + '>' + fmt(r.actual) + '</td><td ' + td + '>' + fmt(r.target) + '</td><td ' + td.replace('style="', 'style="font-weight:700;color:' + colour(r) + ';') + '>' + (r.target > 0 ? r.ach + '%' : '—') + '</td><td ' + td + '>' + fmt(r.spent) + '</td><td ' + td + '>' + fmt(r.budget) + '</td><td ' + td + '>' + (r.budget > 0 ? r.used + '%' : '—') + '</td></tr>';
  return '<table style="border-collapse:collapse;width:100%;margin:12px 0;font-size:13px"><thead><tr><th ' + left(th) + '>Brand</th><th ' + th + '>Company sales (' + esc(rep.ytd) + ', XF)</th><th ' + th + '>Target (' + esc(rep.ytd) + ')</th><th ' + th + '>Ach% vs target</th><th ' + th + '>Spent (EGP)</th><th ' + th + '>Budget (EGP)</th><th ' + th + '>Budget used</th></tr></thead><tbody>' +
    rows.map(r => line(r, false)).join('') + (rows.length > 1 ? line(totals(rows), true) : '') + '</tbody></table>';
}

/* Everybody who receives something, with the set of brands each may see (null = all). */
function people(assign) {
  const R = roster();
  return Object.values(R.byEmail).map(p => {
    const u = findUser(p.email);
    const brands = brandsFor({ email: u.email, role: u.role, brands: u.brands, team: u.team }, assign);
    return { email: u.email, name: u.name, role: u.role, team: u.team, manager: u.manager, scope: brands === null ? null : new Set(brands.map(normBrand).filter(Boolean)) };
  });
}

/* The monthly report as one message per person: an admin gets every brand, a GPM the
   brands of his team, a product manager his own. People with nothing to show are skipped. */
function monthlyMessages(data, assign, year, url) {
  const rep = brandReport(data, year);
  const out = [];
  people(assign).forEach(p => {
    const rows = p.scope ? rep.rows.filter(r => p.scope.has(normBrand(r.brand))) : rep.rows;
    if (!rows.length) return;
    const t = totals(rows);
    const title = 'Monthly report · ' + rep.ytd + ' ' + rep.year;
    const lines = [
      'Hello ' + p.name + ', here is where your ' + (rows.length === 1 ? 'brand stands' : rows.length + ' brands stand') + '.',
      'Company sales ' + rep.ytd + ': ' + fmt(t.actual) + ' XF of a ' + fmt(t.target) + ' target — Ach% vs target ' + (t.target > 0 ? t.ach + '%' : 'n/a') + '.',
      'Spend: ' + fmt(t.spent) + ' EGP of a ' + fmt(t.budget) + ' EGP budget' + (t.budget > 0 ? ' (' + t.used + '% used).' : '.'),
      'These are company sales, not in-market (IQVIA) figures.'
    ];
    const teamsLines = lines.slice(0, 3).concat(rows.slice(0, 12).map(r => r.brand + ': Ach% vs target ' + (r.target > 0 ? r.ach + '%' : 'n/a') + ' · budget used ' + (r.budget > 0 ? r.used + '%' : 'n/a')));
    out.push({ to: [p.email], title, lines, teamsLines, url, table: reportTable(rep, rows, require('./notify').esc) });
  });
  return out;
}

/* Rows waiting for a decision, per approver: every GPM for the brands of his team, every
   admin for everything. Product managers do not approve, so they get nothing. */
function pendingMessages(data, assign, url) {
  const specM = specIndex(data.specshare);
  const out = [];
  people(assign).filter(p => p.role !== 'pm').forEach(p => {
    const parts = [];
    let n = 0, oldest = 0;
    APPROVAL_KEYS.forEach(k => {
      const rows = arr(filterValue(k, arr(data[k]), p.scope, specM)).filter(r => r && r.status === PENDING && !r.auto);
      if (!rows.length) return;
      n += rows.length;
      parts.push(TITLES[k] + ': ' + rows.length);
      rows.forEach(r => { const d = Date.parse(r.date || r.start || '') || 0; if (d && (!oldest || d < oldest)) oldest = d; });
    });
    if (!n) return;
    const age = oldest ? Math.max(0, Math.floor((Date.now() - oldest) / 864e5)) : 0;
    out.push({ to: [p.email], title: n + ' item' + (n === 1 ? ' is' : 's are') + ' waiting for your approval', url,
      lines: ['Hello ' + p.name + ',', parts.join(' · ') + '.'].concat(age > 7 ? ['The oldest one is dated ' + age + ' days ago.'] : []).concat(['Open Approvals in the Hub to approve, reject or ask for changes.']) });
  });
  return out;
}

/* Who decides on what `email` submits: his GPM, otherwise the admins. */
function approversOf(email) {
  const u = findUser(email);
  if (u && u.manager) return [u.manager];
  return roster().admins.slice();
}

/* Rows this save put into the waiting state (new, or changed into it). */
function newlyPending(key, before, after) {
  if (!APPROVAL_KEYS.includes(key)) return [];
  const prev = new Map();
  arr(before).forEach(r => { if (r) prev.set(String(r.id), r); });
  return arr(after).filter(r => r && !r.auto && r.status === PENDING && (prev.get(String(r.id)) || {}).status !== PENDING);
}

const label = r => r.name || r.desc || r.campaign || r.activity || r.month || r.brand || 'item';

module.exports = { brandReport, totals, monthlyMessages, pendingMessages, approversOf, newlyPending, label, TITLES, PENDING, fmt, _teams: teams };
