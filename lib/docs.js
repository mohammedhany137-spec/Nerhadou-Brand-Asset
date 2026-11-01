'use strict';

/* The doctor lists of a conference live in their own Redis key.
 *
 * A list of a hundred names weighs more than the conference row it belongs to, and
 * the whole conferences table has to stay small enough to travel on every save and
 * to fit under the value limit this deployment was built with.
 *
 * The page never notices: the fields are put back onto the row before it is sent
 * out and taken off again when it comes back, so the multi-doctor editor and the
 * paste-from-Excel box keep working exactly as they were written.
 */

const FIELDS = ['registeredDoctors', 'registeredDoctorsAmt', 'accommodationDoctors', 'accommodationDoctorsAmt'];

const blank = v => !Array.isArray(v) || !v.filter(x => String(x === null || x === undefined ? '' : x).trim()).length;
const entryOf = r => { const e = {}; FIELDS.forEach(f => { e[f] = Array.isArray(r[f]) ? r[f] : []; }); return e; };

/* [rows without the lists, { "conference id": the lists, or null when cleared }] */
function separate(rows) {
  const map = {}, plain = [];
  (Array.isArray(rows) ? rows : []).forEach(r => {
    if (!r || typeof r !== 'object' || r.id === undefined) { plain.push(r); return; }
    /* a row that does not carry the fields at all says nothing about the lists */
    if (FIELDS.some(f => Object.prototype.hasOwnProperty.call(r, f))) {
      const e = entryOf(r);
      map[String(r.id)] = FIELDS.some(f => !blank(e[f])) ? e : null;
    }
    const copy = Object.assign({}, r);
    FIELDS.forEach(f => { delete copy[f]; });
    plain.push(copy);
  });
  return [plain, map];
}

/* Only the lists of conferences that still exist are kept. */
function prune(map, rows) {
  const live = new Set((Array.isArray(rows) ? rows : []).map(r => r && String(r.id)));
  const out = {};
  Object.keys(map || {}).forEach(k => { if (live.has(k)) out[k] = map[k]; });
  return out;
}

function attach(rows, map) {
  return (Array.isArray(rows) ? rows : []).map(r => {
    const e = r && (map || {})[String(r.id)];
    if (!e) return r;
    const copy = Object.assign({}, r);
    FIELDS.forEach(f => { copy[f] = e[f] || []; });
    return copy;
  });
}

/* Compared without the order of the fields, so putting the lists back on a row is
   not mistaken for a change of that row. */
function canon(r) {
  if (!r || typeof r !== 'object') return String(r);
  return Object.keys(r).sort().map(k => k + ':' + JSON.stringify(r[k] === undefined ? null : r[k])).join(',');
}

module.exports = { FIELDS, separate, prune, attach, canon };
