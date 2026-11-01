'use strict';

/* Server-side money split.
 *
 * A conference / event is one record shared by several products, and an expense
 * can be split between products as well. The lines that carry the other products'
 * parts are generated here, from the FULL Conference Shares table, because a
 * product manager is only ever sent the rows of his own products - his browser
 * cannot see (and therefore cannot post) the shares of the others.
 *
 * The rows are exactly what the page used to build locally: same fields, same
 * wording, same AUTO marker - so Budget Tracking, Expenses and the dashboards
 * keep working unchanged.
 */

const { normBrand } = require('./team');

const PENDING = 'Waiting for Admin Approval';
let COUNTER = 0;
const uid = () => Date.now() * 1000 + (++COUNTER) % 1000;
const qOf = d => 'Q' + Math.ceil((+String(d).slice(5, 7) || 1) / 3);
const n = v => Number(v || 0).toLocaleString('en-US');
const isAuto = r => !!(r && r.auto);

/* "Vitatron:70;Octatron:30" -> [["Vitatron",70],["Octatron",30]] */
function prodsString(str) {
  return String(str || '').split(';').map(x => x.trim()).filter(Boolean).map(x => {
    const i = x.lastIndexOf(':');
    return i > 0 ? [x.slice(0, i).trim(), +x.slice(i + 1) || 0] : [x, 0];
  });
}

/* The Conference Shares rows of one specialty: [[product, pct]] */
function specShares(specshare, spec) {
  const out = [];
  (Array.isArray(specshare) ? specshare : []).forEach(s => {
    if (s && String(s.spec) === String(spec) && s.prod) out.push([String(s.prod), +s.pct || 0]);
  });
  return out;
}

/* [[product, amount]] for one conference / event row.
   The per-record split wins, then a legacy prods string, then the specialty table. */
function allocOf(row, specshare) {
  const total = +row.c26 || 0;
  if (!(total > 0)) return [];
  if (Array.isArray(row.split) && row.split.length) {
    return row.split.map(x => {
      const prod = String(Array.isArray(x) ? x[0] : x);
      return [prod, total * (+(Array.isArray(x) ? x[1] : 0) || 0) / 100];
    });
  }
  if (row.prods) return prodsString(row.prods).map(x => [x[0], total * (+x[1] || 0) / 100]);
  return specShares(specshare, row.spec).map(x => [x[0], total * x[1] / 100]);
}

/* Portfolio names, keyed by their normalised spelling, so a share written as
   "methyltechno" is posted under the portfolio name "Methyltechno (Private)". */
function brandIndex(portfolio) {
  const m = new Map();
  (Array.isArray(portfolio) ? portfolio : []).forEach(p => {
    const b = p && p.brand;
    if (!b) return;
    const k = normBrand(b);
    if (k && !m.has(k)) m.set(k, b);
  });
  return m;
}

/* The fields a generated line depends on; the same stamp means the same lines. */
function stamp(r) {
  if (!r) return '';
  return JSON.stringify([r.c26, r.spec, r.date, r.name, r.status, r.type, r.what, r.split || null, String(r.prods || ''),
    r.i_part, r.i_reg, r.i_accom, r.i_talk, r.i_hon, r.i_prod, r.i_activity, r.i_material, r.i_logistics, r.i_other]);
}
function shareStamp(r) {
  if (!r) return '';
  return JSON.stringify([r.amount, r.gross, r.cat, r.name, r.desc, r.date, r.status, r.brand, r.splits || null, r.shareWith || '', r.sharePct]);
}

/* --- conferences / events -> one AUTO expense line per product --- */
function confLines(row, key, specshare, brands) {
  const total = +row.c26 || 0;
  if (!(total > 0)) return [];
  const cat = key === 'events' ? 'Events' : 'Conferences';
  const d = row.date || '';
  let parts = '';
  if (key === 'events') {
    parts = [['Activity / participation', row.i_activity], ['Production', row.i_material], ['Venue / logistics', row.i_logistics],
      ['Honorarium', row.i_hon], ['Other', row.i_other]].filter(x => +x[1] > 0).map(x => x[0] + ': ' + n(x[1]) + ' EGP').join(', ');
  }
  const out = [];
  allocOf(row, specshare).forEach(x => {
    const p = x[0], a = x[1];
    if (!(a > 0)) return;
    const canon = brands.get(normBrand(p));
    if (!canon) return;
    const detail = (key === 'events' ? ['Event', row.type, row.what, parts].filter(Boolean).join(' · ') : 'Conference')
      + ' · ' + row.spec + ' · ' + (Math.round(a / total * 1000) / 10) + '% allocation';
    out.push({
      id: uid(), brand: canon, cat, name: row.name, desc: detail, date: d, q: qOf(d), spec: row.spec,
      unit: 0, qty: 0, amount: Math.round(a), notes: '', status: row.status || 'Approved',
      auto: 1, ck: key, conf: row.id, camp: String(row.id)
    });
  });
  return out;
}

/* --- an expense shared with other products (⚖) --- */
function shareLines(row, by) {
  const gross = +row.gross || +row.amount || 0;
  let pairs = [];
  if (Array.isArray(row.splits) && row.splits.length) {
    pairs = row.splits.filter(x => x && x[0] && +x[1] > 0).map(x => [String(x[0]), +x[1] || 0]);
  } else if (row.shareWith && +row.sharePct > 0) {
    pairs = [[String(row.brand || ''), 100 - (+row.sharePct || 0)], [String(row.shareWith), +row.sharePct || 0]];
  }
  const out = [];
  pairs.forEach(x => {
    const b = x[0], pct = x[1];
    if (!b || b === row.brand) return;
    const amt = gross * pct / 100;
    if (!(amt > 0)) return;
    const d = row.date || '';
    out.push({
      id: uid(), date: d, q: qOf(d), brand: b, cat: row.cat || 'Gimmicks', name: row.name,
      desc: (row.desc || '') + ' · share ' + pct + '% from ' + (row.brand || ''),
      unit: 0, qty: 0, amount: Math.round(amt * 100) / 100, notes: '',
      status: row.status || PENDING, auto: true, ck: 'share', conf: row.id,
      sharedFrom: { brand: row.brand || '', by: by || '', pct }
    });
  });
  return out;
}

/* Rebuild the generated lines of one kind (a `ck` value).
   rows        : the array that will hold the lines, still carrying the old ones
   parentsPrev : the parent rows as they were stored
   parentsNext : the parent rows after this save - every line of the array belongs to one of them
   A parent whose money fields did not change keeps the lines it already has, so ids stay stable. */
function regen(rows, parentsPrev, parentsNext, kind, stampFn, makeFn) {
  const prevParent = new Map();
  parentsPrev.forEach(p => { if (p && p.id !== undefined) prevParent.set(String(p.id), p); });
  const oldChildren = new Map();
  rows.forEach(r => {
    if (!isAuto(r) || r.ck !== kind) return;
    const key = String(r.conf);
    if (!oldChildren.has(key)) oldChildren.set(key, []);
    oldChildren.get(key).push(r);
  });
  const out = rows.filter(r => !(isAuto(r) && r.ck === kind));
  parentsNext.forEach(p => {
    if (!p || p.id === undefined) return;
    const key = String(p.id);
    const old = oldChildren.get(key) || [];
    const before = prevParent.get(key);
    if (before && old.length && stampFn(before) === stampFn(p)) { out.push.apply(out, old); return; }
    out.push.apply(out, makeFn(p));
  });
  return out;
}

module.exports = {
  uid, qOf, allocOf, specShares, prodsString, brandIndex, confLines, shareLines, isAuto,
  stamp, shareStamp, regen
};
