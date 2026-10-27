const { appCfg, PENDING, authUser, redis, revString, bumpRev } = require('../lib/core');
const { brandsFor, normBrand } = require('../lib/team');
const { specIndex, filterValue, mergeValue } = require('../lib/scope');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const A = appCfg(req), KEYS = A.keys, APPROVAL = A.approval, rk = k => A.prefix + k;
  let me;
  try { me = authUser(req); } catch (e) { return res.status(500).json({ error: 'server not configured' }); }
  if (!me) return res.status(401).json({ error: 'unauthorized' });

  /* The token gives the role; the products are resolved from the roster, so a
     product change takes effect immediately instead of at the next login. */
  let scope = null;
  try {
    const brands = brandsFor({ email: me.e, role: me.r, brands: me.b || [], team: me.tm || '' });
    scope = brands === null ? null : new Set(brands.map(normBrand).filter(Boolean));
    if (scope && !scope.size) scope = new Set(['\u0000none']); // no products -> sees nothing
  } catch (e) { scope = null; }

  const readSpec = async () => {
    try { const raw = await redis(['GET', rk('specshare')]); return specIndex(raw ? JSON.parse(raw) : []); }
    catch (e) { return specIndex([]); }
  };

  try {
    if (req.method === 'GET') {
      const vals = await redis(['MGET', ...KEYS.map(rk)]);
      const raw = {};
      KEYS.forEach((k, i) => { if (vals[i]) { try { raw[k] = JSON.parse(vals[i]); } catch (e) {} } });
      const specM = specIndex(raw.specshare);
      const data = {};
      KEYS.forEach(k => {
        if (raw[k] === undefined) return;
        if (A.adminRead.indexOf(k) >= 0 && me.r !== 'admin') return;
        data[k] = filterValue(k, raw[k], scope, specM);
      });
      return res.status(200).json({ data, role: me.r, rev: await revString(A.prefix) });
    }

    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { key, value } = body;
      if (!KEYS.includes(key)) return res.status(400).json({ error: 'bad key' });
      if (A.admin.includes(key) && me.r !== 'admin') return res.status(403).json({ error: 'only the Marketing Director/Manager can change this' });
      if (A.objects.includes(key) ? (typeof value !== 'object' || Array.isArray(value) || !value) : !Array.isArray(value))
        return res.status(400).json({ error: 'bad value' });

      const prevRaw = await redis(['GET', rk(key)]);
      let prevArr = [];
      try { const pj = prevRaw ? JSON.parse(prevRaw) : []; if (Array.isArray(pj)) prevArr = pj; } catch (e) {}

      const specM = scope ? await readSpec() : specIndex([]);
      // A contributor only sends the rows of his own products; everybody else's
      // rows are kept exactly as they are on the server.
      const nextVal = scope ? mergeValue(key, prevArr, value, scope, specM) : value;
      const prevScoped = scope ? filterValue(key, prevArr, scope, specM) : prevArr;

      if (Array.isArray(value) && value.length === 0 && prevScoped.length > 0 && !body.known)
        return res.status(409).json({ error: 'refused', detail: 'an empty list would erase existing data; reload the page' });

      let out = nextVal, changed = false;
      if (me.r !== 'admin' && APPROVAL.includes(key)) {
        const prev = {};
        prevArr.forEach(r => { prev[r.id] = r; });
        out = nextVal.map(r => {
          const p = prev[r.id];
          // every change of a contributor goes to the approver; a draft never stays a draft
          if (r.status === PENDING || (p && p.status === r.status)) return r;
          if (me.r === 'gpm' && (!me.b || !me.b.length || me.b.includes(r.brand))) return r;
          changed = true;
          return Object.assign({}, r, { status: PENDING });
        });
      }
      const s = JSON.stringify(out);
      if (s.length > 900000) return res.status(413).json({ error: 'too large' });
      await redis(['SET', rk(key), s]);
      await bumpRev(A.prefix);
      try {
        if (Array.isArray(out)) {
          const L = r => r.name || r.desc || r.campaign || r.activity || r.comp || r.month || r.brand || '';
          const pm = {}, nm = {}, ev = [];
          prevArr.forEach(r => { pm[r.id] = r; });
          out.forEach(r => { nm[r.id] = r; const p = pm[r.id]; if (!p) ev.push(['added', r]); else if (JSON.stringify(p) !== JSON.stringify(r)) ev.push([p.status !== r.status ? 'status: ' + r.status : 'edited', r]); });
          prevArr.forEach(r => { if (!nm[r.id]) ev.push(['deleted', r]); });
          if (ev.length) {
            await redis(['LPUSH', A.prefix + 'audit', ...ev.slice(0, 20).map(([a, r]) => JSON.stringify({ t: Date.now(), u: me.e, k: key, a, l: L(r), b: r.brand || '' }))]);
            await redis(['LTRIM', A.prefix + 'audit', 0, 499]);
          }
        }
      } catch (e) {}
      return res.status(200).json(changed ? { ok: true, value: filterValue(key, out, scope, specM) } : { ok: true });
    }
    res.status(405).end();
  } catch (e) {
    console.error('data api error:', e.message);
    res.status(500).json({ error: 'server error', detail: String(e.message || '').slice(0, 160) });
  }
};
