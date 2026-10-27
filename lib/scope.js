'use strict';

/* Server-side product scoping.
 *
 * Every stored row belongs to one or more products. A user only receives the
 * rows of the products he owns (a GPM: the products of his team), and when he
 * saves, the untouched rows of other products are kept as they are on the
 * server, so nothing can be erased by accident.
 */

const { normBrand } = require('./team');

/* Rows that carry their products in different fields. */
function rowBrands(r) {
  const out = new Set();
  const add = v => { const k = normBrand(v); if (k) out.add(k); };
  if (!r || typeof r !== 'object') return out;
  add(r.brand);
  add(r.prod);
  if (typeof r.prods === 'string' && r.prods) {
    r.prods.split(';').forEach(p => { const i = p.lastIndexOf(':'); add((i > 0 ? p.slice(0, i) : p).trim()); });
  }
  if (Array.isArray(r.split)) r.split.forEach(x => add(Array.isArray(x) ? x[0] : x));
  return out;
}

/* { specialty -> Set(brand) } from the Conference Shares table. */
function specIndex(share) {
  const m = new Map();
  if (!Array.isArray(share)) return m;
  share.forEach(s => {
    if (!s || !s.spec) return;
    const k = String(s.spec);
    if (!m.has(k)) m.set(k, new Set());
    const b = normBrand(s.prod);
    if (b) m.get(k).add(b);
  });
  return m;
}

function visible(r, scope, specM) {
  if (!scope) return true;
  let b = rowBrands(r);
  if (!b.size && r && r.spec && specM) b = specM.get(String(r.spec)) || b;
  if (!b.size) return true; // a record with no product attached stays visible to everybody
  for (const x of b) if (scope.has(x)) return true;
  return false;
}

/* What a user may read from one key. */
function filterValue(key, value, scope, specM) {
  if (!scope) return value;
  if (Array.isArray(value)) return value.filter(r => visible(r, scope, specM));
  if (value && typeof value === 'object') {
    if (key === 'meta') return value;            // shared settings
    const out = {};
    Object.keys(value).forEach(k => { if (scope.has(normBrand(k))) out[k] = value[k]; });
    return out;
  }
  return value;
}

/* Rows that the app generates from a conference / event / campaign. They belong
   to the source record, so the person who edits that record drives them. */
const derived = r => !!(r && r.auto && r.conf !== undefined && r.conf !== null && r.conf !== '');

/* Merge what a user saved with the rows of the other products (kept as they are). */
function mergeValue(key, prev, next, scope, specM) {
  if (!scope || !Array.isArray(next) || !Array.isArray(prev)) return next;
  const inScope = r => visible(r, scope, specM) || derived(r);
  const prevIds = new Map();
  prev.forEach(r => prevIds.set(r && r.id, r));
  const nextIds = new Map();
  next.forEach(r => { if (r && r.id !== undefined) nextIds.set(r.id, r); });

  const out = [];
  prev.forEach(r => {
    if (!inScope(r)) { out.push(r); return; }                         // somebody else's row: untouched
    if (nextIds.has(r && r.id)) out.push(nextIds.get(r.id));          // his row, maybe edited
    // else: deleted by the user
  });
  next.forEach(r => {
    if (!r || r.id === undefined) return;
    if (!prevIds.has(r.id) && inScope(r)) out.push(r);                // added row
  });
  return out;
}

module.exports = { rowBrands, specIndex, visible, filterValue, mergeValue };
