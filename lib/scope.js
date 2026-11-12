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
  /* The Conference Shares table is read by everybody in full: a product manager has to see
     who else shares a specialty and with how much, not only his own line. Writing it stays
     with the Marketing Director/Manager (the key is in the admin list). */
  if (key === 'specshare') return value;
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
   to the source record, so only the server - which sees every product - may add
   or remove them. A user leaving one out of his list must never delete it. */
const derived = r => !!(r && r.auto && r.conf !== undefined && r.conf !== null && r.conf !== '');

/* Rows the user may add or edit: his own products, and the generated lines whose
   source he can touch (so a conference owner can repost its lines). */
const touchable = (r, scope, specM) => visible(r, scope, specM) || derived(r);

/* Merge what a user saved with the rows of the other products (kept as they are).
   `deleted` is the list of ids the user really removed - deletion by omission is
   not trusted for rows that belong to somebody else or that the server generates. */
function mergeValue(key, prev, next, scope, specM, deleted) {
  if (!scope || !Array.isArray(next) || !Array.isArray(prev)) return next;
  const del = deleted || new Set();
  const prevIds = new Map();
  prev.forEach(r => prevIds.set(r && r.id, r));
  const nextIds = new Map();
  next.forEach(r => { if (r && r.id !== undefined) nextIds.set(r.id, r); });

  const out = [];
  prev.forEach(r => {
    const id = r && r.id;
    if (del.has(String(id))) return;                                  // he deleted it on purpose
    if (nextIds.has(id)) { out.push(nextIds.get(id)); return }        // his row, maybe edited
    if (!touchable(r, scope, specM)) { out.push(r); return }          // somebody else's row: untouched
    if (derived(r)) { out.push(r); return }                           // server-generated: stays
    // else: a visible row he left out - he deleted it
  });
  next.forEach(r => {
    if (!r || r.id === undefined) return;
    if (!prevIds.has(r.id) && touchable(r, scope, specM)) out.push(r); // added row
  });
  return out;
}

/* The same, for a reader who sees every product (admin, GPM of all teams).
   Rows that appeared on the server since his last load are kept instead of being
   overwritten, so two people editing at the same time do not lose each other's work. */
function mergeById(prev, next, deleted) {
  if (!Array.isArray(next) || !Array.isArray(prev)) return next;
  const del = deleted || new Set();
  const byId = new Map();
  next.forEach(r => { if (r && r.id !== undefined) byId.set(String(r.id), r); });
  const prevIds = new Set(prev.map(r => r && String(r.id)));
  const out = [];
  prev.forEach(r => {
    const id = String(r && r.id);
    if (del.has(id)) return;
    out.push(byId.has(id) ? byId.get(id) : r);
  });
  next.forEach(r => { if (r && r.id !== undefined && !prevIds.has(String(r.id))) out.push(r); });
  return out;
}

module.exports = { rowBrands, specIndex, visible, filterValue, mergeValue, mergeById, derived };
