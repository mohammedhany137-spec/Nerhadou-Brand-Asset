'use strict';

/* GeoShare on the server: the lines (one per Group Product Manager) and the same
 * arithmetic as the Geo-share Dashboard, used for the "budget share is used up" message.
 *
 * A line is a GPM's team: its product managers and their products. An area manager belongs
 * to one line, so his budget share is his geo-share % of THAT line's budget, and only the
 * gimmicks, conferences and events of that line's products count as his consumption.
 *
 * How a cost reaches the area managers of its line:
 *   one region          -> the manager of that region (several managers of one region share it by geo-share)
 *   several regions     -> divided equally between the regions, then as above
 *   "All regions"       -> every manager of the line, in proportion to his geo-share
 *   no region / a region nobody covers -> nobody (the dashboard lists it apart)
 */
const { teams, teamFor, brandsFor, normBrand, findUser, roster } = require('./team');

const CATS = ['Gimmicks', 'Conferences', 'Events'];
const ALL = 'all regions';
const arr = v => Array.isArray(v) ? v : [];
const num = v => +v || 0;
const key = s => String(s || '').trim().toLowerCase();
const list = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
const live = r => r && r.status !== 'Rejected';
const yearOf = r => String(r.year || r.month || r.date || '').slice(0, 4);

/* [{ key, gpm, gpmEmail, brands }] - brands are spelled as in the portfolio when it is given. */
function lines(assign, portfolio) {
  const names = arr(portfolio).map(p => p && p.brand).filter(Boolean);
  return Object.keys(teams()).map(k => {
    const t = teamFor(k);
    const set = new Set();
    const spelled = [];
    t.members.filter(p => p.role === 'pm').forEach(p => {
      (brandsFor({ email: p.email, role: p.role, brands: p.brands || [], team: p.team || '' }, assign) || []).forEach(b => {
        const n = normBrand(b);
        if (n && !set.has(n)) { set.add(n); spelled.push(b); }
      });
    });
    const g = t.gpm ? findUser(t.gpm) : null;
    const inPortfolio = names.filter(b => set.has(normBrand(b)));
    return { key: k, gpm: (g && g.name) || t.name || k, gpmEmail: (g && g.email) || '', brands: inPortfolio.length || names.length ? inPortfolio : spelled };
  });
}

/* The Region of an expense line; a line generated from a conference or an event takes its parent's. */
function regionOf(e, data) {
  if (e.regions) return String(e.regions);
  if (e.auto && (e.ck === 'conferences' || e.ck === 'events')) {
    const p = arr(data[e.ck]).find(x => x && String(x.id) === String(e.conf));
    if (p) return String(p.regions || p.city || '');
  }
  return String(e.city || '');
}

function calc(data, lineList, year) {
  const Y = String(year);
  const budget = arr(data.budget).filter(r => live(r) && yearOf(r) === Y);
  const spend = arr(data.expenses).filter(r => live(r) && yearOf(r) === Y && CATS.includes(r.cat));
  const out = [];
  lineList.forEach(L => {
    const mine = new Set(L.brands.map(normBrand));
    const total = budget.filter(r => mine.has(normBrand(r.brand))).reduce((a, r) => a + num(r.amount), 0);
    const rows = arr(data.geoshare).filter(g => g && g.name && g.line === L.key).map(g => ({ g, line: L, pct: num(g.pct), ent: total * num(g.pct) / 100, used: 0 }));
    if (!rows.length) return;
    const covers = (x, reg) => { const R = list(x.g.regions).map(key); return R.includes(ALL) || R.includes(key(reg)); };
    const give = (M, amt) => { const w = M.reduce((a, x) => a + x.pct, 0); M.forEach(x => { x.used += w > 0 ? amt * x.pct / w : amt / M.length; }); };
    spend.filter(e => mine.has(normBrand(e.brand))).forEach(e => {
      const amt = num(e.amount), R = list(regionOf(e, data));
      if (!amt || !R.length) return;
      if (R.map(key).includes(ALL)) return give(rows, amt);
      const per = amt / R.length;
      R.forEach(reg => { const M = rows.filter(x => covers(x, reg)); if (M.length) give(M, per); });
    });
    rows.forEach(x => out.push(x));
  });
  return out;
}

/* One message per area manager whose consumption has reached his budget share. */
function overMessages(data, lineList, year, url, fmt) {
  const admins = roster().admins.slice();
  return calc(data, lineList, year).filter(x => x.ent > 0 && x.used >= x.ent).map(x => ({
    id: String(x.g.id),
    to: [...new Set(admins.concat(x.line.gpmEmail ? [x.line.gpmEmail] : []))],
    title: x.g.name + ' has used up his budget share (' + Math.round(x.used / x.ent * 100) + '%)',
    url,
    lines: [
      'Area manager ' + x.g.name + (x.g.gm ? ' (GM: ' + x.g.gm + ')' : '') + ', line of ' + x.line.gpm + ', region ' + (x.g.regions || 'not set') + '.',
      'Budget share ' + year + ': ' + fmt(x.ent) + ' EGP (' + x.pct + '% of the line\'s budget).',
      'Consumed by gimmicks, conferences and events: ' + fmt(x.used) + ' EGP.' + (x.used > x.ent ? ' Over by ' + fmt(x.used - x.ent) + ' EGP.' : ''),
      'Open the Geo-share Dashboard in the Hub for the details.'
    ]
  }));
}

module.exports = { lines, calc, overMessages, regionOf, CATS };
