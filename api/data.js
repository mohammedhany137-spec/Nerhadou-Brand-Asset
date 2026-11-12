const { appCfg, PENDING, authUser, redis, revString, bumpRev, getAssign } = require('../lib/core');
const { brandsFor, normBrand } = require('../lib/team');
const { specIndex, filterValue, mergeValue, mergeById } = require('../lib/scope');
const { isAuto, brandIndex, confLines, shareLines, stamp, shareStamp, regen } = require('../lib/split');
const docs = require('../lib/docs');
const notify = require('../lib/notify');
const report = require('../lib/report');
const geo = require('../lib/geo');
const { findUser } = require('../lib/team');

const MAX_SIZE = 900000;          // the Upstash value limit this deployment was built under
const DOCS_MAX = 4000000;         // the doctor lists are their own key, so they are not held to it
const SHARE_TABLE = 'specshare';  // specialty -> product percentages
const PORTFOLIO = 'portfolio';    // canonical product names
const LEDGER = 'expenses';        // where the generated money lines live
const DOCS = 'docs';              // the doctor lists, kept off the conference row
const CONF = 'conferences';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const A = appCfg(req), KEYS = A.keys, APPROVAL = A.approval, rk = k => A.prefix + k;
  let me;
  try { me = authUser(req); } catch (e) { return res.status(500).json({ error: 'server not configured' }); }
  if (!me) return res.status(401).json({ error: 'unauthorized' });
  if (me.fc) return res.status(403).json({ error: 'password_change_required' });

  /* The token gives the role; the products are resolved from the roster, so a
     product change takes effect immediately instead of at the next login. */
  let assign;
  try { assign = await getAssign(A.prefix); } catch (e) { return fail(res, 503, 'data store unavailable'); }
  let scope = null;
  try {
    const brands = brandsFor({ email: me.e, role: me.r, brands: me.b || [], team: me.tm || '' }, assign);
    scope = brands === null ? null : new Set(brands.map(normBrand).filter(Boolean));
    if (scope && !scope.size) scope = new Set(['\u0000none']); // no products -> sees nothing
  } catch (e) { return fail(res, 403, 'not on the team roster'); }

  const readJson = raw => { try { const v = raw ? JSON.parse(raw) : null; return v === null || v === undefined ? [] : v; } catch (e) { return []; } };
  const readObj = raw => { const o = readJson(raw); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; };

  try {
    if (req.method === 'GET') {
      const vals = await redis(['MGET', ...KEYS.map(rk), rk(DOCS)]);
      const raw = {};
      KEYS.forEach((k, i) => { if (vals[i]) { try { raw[k] = JSON.parse(vals[i]); } catch (e) {} } });
      const specM = specIndex(raw.specshare);
      const data = {};
      KEYS.forEach(k => {
        if (raw[k] === undefined) return;
        if (A.adminRead.indexOf(k) >= 0 && me.r !== 'admin') return;
        data[k] = filterValue(k, raw[k], scope, specM);
      });
      /* The lists go back onto their conference rows: the page asks for one table and
         gets its doctors with it, exactly as when they were stored inside the row. */
      if (Array.isArray(data[CONF])) data[CONF] = docs.attach(data[CONF], readObj(vals[KEYS.length]));
      /* The lines (one per GPM, with its products) let the page tie an area manager to the
         products of his own line. Product names only - nothing a signed-in user may not know. */
      let lines = [];
      try { lines = geo.lines(assign, raw.portfolio).map(l => ({ key: l.key, gpm: l.gpm, brands: l.brands })); } catch (e) {}
      /* A product manager is given his own line only, narrowed to his own products, and the
         area managers of that line - not the other lines' people or product lists. */
      if (me.r === 'pm') {
        const own = (findUser(me.e) || {}).team || '';
        lines = lines.filter(l => l.key === own).map(l => Object.assign({}, l, { brands: l.brands.filter(b => scope && scope.has(normBrand(b))) }));
        if (Array.isArray(data.geoshare)) data.geoshare = data.geoshare.filter(g => g && g.line === own);
      }
      return res.status(200).json({ data, role: me.r, rev: await revString(A.prefix), lines });
    }

    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { key, value } = body;
      if (!KEYS.includes(key)) return fail(res, 400, 'bad key');
      if (A.admin.includes(key) && me.r !== 'admin') return fail(res, 403, 'only the Marketing Director/Manager can change this');
      if ((A.managers || []).includes(key) && me.r !== 'admin' && me.r !== 'gpm') return fail(res, 403, 'only a Group Product Manager or the Marketing Director/Manager can change this');
      if (A.objects.includes(key) ? (typeof value !== 'object' || Array.isArray(value) || !value) : !Array.isArray(value))
        return fail(res, 400, 'bad value');

      /* Only the ids the page really removed are deletions. Everything else that is
         missing from this request belongs to somebody else and stays untouched. */
      const deleted = new Set((Array.isArray(body.deleted) ? body.deleted : []).map(x => String(x)));

      /* The money tables are joined: a conference or an event writes lines into the
         ledger, the ledger needs the shares table to split it, and a change in the
         shares table re-splits every conference already stored. */
      const isLedgerParent = key === CONF || key === 'events';
      const need = [key, SHARE_TABLE, PORTFOLIO];
      if (isLedgerParent || key === SHARE_TABLE) need.push(LEDGER);
      if (key === SHARE_TABLE) need.push(CONF, 'events');
      if (key === CONF) need.push(DOCS);
      const got = await redis(['MGET', ...need.map(rk)]);
      const at = name => readJson(got[need.indexOf(name)]);
      const prevArr = at(key);
      const specshare = at(SHARE_TABLE);
      const brands = brandIndex(at(PORTFOLIO));
      const specM = scope ? specIndex(specshare) : specIndex([]);
      const ledgerStored = at(LEDGER);

      /* Generated rows never travel from the browser: whatever arrives with an `auto`
         marker is dropped and rebuilt here from the source record. A product manager
         can therefore no longer post a share of his conference onto another product. */
      const submitted = Array.isArray(value) ? value.filter(r => !isAuto(r)) : value;
      const storedPlain = Array.isArray(prevArr) ? prevArr.filter(r => !isAuto(r)) : prevArr;
      const storedAuto = Array.isArray(prevArr) ? prevArr.filter(isAuto) : [];

      /* A contributor keeps the rows of the other products; the full-array save of an
         admin or a GPM merges by id instead of overwriting the whole table. */
      let merged;
      if (A.objects.includes(key)) merged = value;
      else if (key === LEDGER) merged = scope ? mergeValue(key, storedPlain, submitted, scope, specM, deleted) : mergeById(storedPlain, submitted, deleted);
      else if (scope) merged = mergeValue(key, prevArr, value, scope, specM, deleted);
      else merged = mergeById(prevArr, value, deleted);

      /* A GPM manages the area managers of his own line only: the rows of the other lines stay
         exactly as stored, whatever his page sent. */
      if (key === 'geoshare' && me.r === 'gpm') {
        const own = (findUser(me.e) || {}).team || '';
        merged = prevArr.filter(r => r && r.line !== own).concat(value.filter(r => r && r.line === own));
      }

      if (Array.isArray(submitted) && submitted.length === 0 && filterValue(key, storedPlain, scope, specM).length > 0 && !body.known)
        return fail(res, 409, 'an empty list would erase existing data; reload the page');

      /* A contributor only proposes: every change of his goes to the approver. */
      let forced = false;
      if (me.r !== 'admin' && APPROVAL.includes(key) && Array.isArray(merged)) {
        const before = {};
        storedPlain.forEach(r => { before[r.id] = r; });
        merged = merged.map(r => {
          const p = before[r.id];
          if (r.status === PENDING || (p && p.status === r.status)) return r;
          if (me.r === 'gpm' && (!me.b || !me.b.length || me.b.includes(r.brand))) return r;
          forced = true;
          return Object.assign({}, r, { status: PENDING });
        });
      }

      /* The doctor lists leave the row and go into their own key. A row that carries
         empty lists has them cleared; a row that does not carry them at all keeps what
         is stored, so a page that never received them cannot wipe them out. */
      let rows = merged, docMap = null;
      if (key === CONF) {
        const parts = docs.separate(merged);
        rows = parts[0];
        docMap = Object.assign({}, readObj(at(DOCS)), parts[1]);
        Object.keys(docMap).forEach(id => { if (!docMap[id]) delete docMap[id]; });
        docMap = docs.prune(docMap, rows);
      }

      /* Rebuild the generated lines. A source whose money fields did not change keeps
         the lines it already has, so their ids stay stable across saves; a source with
         no recorded line, or an empty "before" list, is split again from scratch. */
      const shareJob = key === LEDGER ? ['share', storedPlain, merged, shareStamp, p => shareLines(p, me.e)] : null;
      const parentJob = isLedgerParent ? [key, prevArr, rows, stamp, p => confLines(p, key, specshare, brands)] : null;
      const resplit = key === SHARE_TABLE
        ? [[CONF, [], at(CONF), () => '', p => confLines(p, CONF, merged, brands)],
           ['events', [], at('events'), () => '', p => confLines(p, 'events', merged, brands)]]
        : [];
      const jobs = [shareJob, parentJob].concat(resplit).filter(Boolean);
      const build = base => jobs.reduce((a, j) => regen(a, j[1], j[2], j[0], j[3], j[4]), base);
      const out = key === LEDGER ? merged.concat(build(storedAuto)) : rows;
      const ledger = key === LEDGER ? null : (jobs.length ? build(ledgerStored) : null);

      if (Array.isArray(out) && JSON.stringify(out).length > MAX_SIZE) return fail(res, 413, 'too large');
      if (docMap !== null && JSON.stringify(docMap).length > DOCS_MAX) return fail(res, 413, 'the doctor lists are too large');
      if (ledger !== null && JSON.stringify(ledger).length > MAX_SIZE) return fail(res, 413, 'too large');

      await redis(['SET', rk(key), JSON.stringify(out)]);
      if (docMap !== null) await redis(['SET', rk(DOCS), JSON.stringify(docMap)]);
      if (ledger !== null) await redis(['SET', rk(LEDGER), JSON.stringify(ledger)]);
      await bumpRev(A.prefix);
      await audit(A.prefix, me.e, key, key === CONF ? docs.separate(prevArr)[0] : storedPlain, key === LEDGER ? merged : out);

      /* The approver hears about it at once - at most one message per sender every ten
         minutes, because the page saves as you type; the morning reminder covers the rest.
         A channel that is down or not configured never holds the save back. */
      if (me.r !== 'admin' && notify.approvalsOn()) {
        try {
          const fresh = report.newlyPending(key, key === CONF ? prevArr : storedPlain, key === LEDGER ? merged : out);
          if (fresh.length && await redis(['SET', A.prefix + 'ntf:' + me.e, '1', 'NX', 'EX', '600'])) {
            const first = fresh.slice(0, 5).map(r => '• ' + report.label(r) + (r.brand ? ' (' + r.brand + ')' : ''));
            await notify.send({
              to: report.approversOf(me.e), url: notify.hubUrl(req),
              title: (me.n || me.e) + ' sent ' + fresh.length + ' item' + (fresh.length === 1 ? '' : 's') + ' for your approval',
              lines: [(report.TITLES[key] || key) + ':'].concat(first, fresh.length > 5 ? ['… and ' + (fresh.length - 5) + ' more'] : [], ['Open Approvals in the Hub to approve, reject or ask for changes.'])
            });
          }
        } catch (e) { console.error('notify failed:', e.message); }
      }

      /* The page adopts the stored rows whenever this request changed something it
         cannot know about - an approval, a regenerated line, another product's line. */
      const answer = docMap !== null ? docs.attach(out, docMap) : out;
      const visible = filterValue(key, answer, scope, specM);
      const rewrote = Array.isArray(answer) ? differs(visible, value) : false;
      return res.status(200).json(rewrote || forced ? { ok: true, value: visible } : { ok: true });
    }
    res.status(405).end();
  } catch (e) {
    console.error('data api error:', e.message);
    res.status(500).json({ error: 'server error', detail: String(e.message || '').slice(0, 160) });
  }
};

function fail(res, code, message) { return res.status(code).json({ error: message }); }

/* Compared by id and by content, ignoring the order of the rows and of the fields,
   so putting the doctor lists back onto a row is not mistaken for a change. */
function differs(stored, sent) {
  const mine = new Map(), theirs = new Map();
  (Array.isArray(sent) ? sent : []).forEach(r => { if (r && r.id !== undefined) mine.set(String(r.id), docs.canon(r)); });
  (Array.isArray(stored) ? stored : []).forEach(r => { if (r && r.id !== undefined) theirs.set(String(r.id), docs.canon(r)); });
  for (const id of mine.keys()) if (!theirs.has(id)) return true;
  for (const [id, row] of theirs) if (mine.get(id) !== row) return true;
  return false;
}

/* The audit trail lists what this save did to the rows the user really owns. */
async function audit(prefix, who, key, prevArr, nextArr) {
  if (!Array.isArray(prevArr) || !Array.isArray(nextArr)) return;
  try {
    const L = r => r.name || r.desc || r.campaign || r.activity || r.comp || r.month || r.brand || '';
    const pm = {}, nm = {}, ev = [];
    prevArr.forEach(r => { pm[r.id] = r; });
    nextArr.forEach(r => { nm[r.id] = r; const p = pm[r.id]; if (!p) ev.push(['added', r]); else if (JSON.stringify(p) !== JSON.stringify(r)) ev.push([p.status !== r.status ? 'status: ' + r.status : 'edited', r]); });
    prevArr.forEach(r => { if (!nm[r.id]) ev.push(['deleted', r]); });
    if (!ev.length) return;
    await redis(['LPUSH', prefix + 'audit', ...ev.slice(0, 20).map(([a, r]) => JSON.stringify({ t: Date.now(), u: who, k: key, a, l: L(r), b: r.brand || '' }))]);
    await redis(['LTRIM', prefix + 'audit', 0, 499]);
  } catch (e) {}
}
