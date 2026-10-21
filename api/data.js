const { appCfg, PENDING, authUser, redis } = require('../lib/core');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const A = appCfg(req), KEYS = A.keys, APPROVAL = A.approval, rk = k => A.prefix + k;
  let me;
  try { me = authUser(req); } catch (e) { return res.status(500).json({ error: 'server not configured' }); }
  if (!me) return res.status(401).json({ error: 'unauthorized' });
  try {
    if (req.method === 'GET') {
      const vals = await redis(['MGET', ...KEYS.map(rk)]);
      const data = {};
      KEYS.forEach((k, i) => { if (vals[i]) data[k] = JSON.parse(vals[i]); });
      return res.status(200).json({ data, role: me.r });
    }
    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { key, value } = body;
      if (!KEYS.includes(key)) return res.status(400).json({ error: 'bad key' });
      if (key === 'matrices' ? (typeof value !== 'object' || Array.isArray(value) || !value) : !Array.isArray(value))
        return res.status(400).json({ error: 'bad value' });
      const prevRaw = await redis(['GET', rk(key)]);
      let prevArr = [];
      try { const pj = prevRaw ? JSON.parse(prevRaw) : []; if (Array.isArray(pj)) prevArr = pj; } catch (e) {}
      let out = value, changed = false;
      if (me.r !== 'admin' && APPROVAL.includes(key)) {
        const prev = {};
        prevArr.forEach(r => { prev[r.id] = r; });
        out = value.map(r => {
          const p = prev[r.id];
          if (r.status === PENDING || r.status === 'Draft' || (p && p.status === r.status)) return r;
          if (me.r === 'gpm' && (!me.b || !me.b.length || me.b.includes(r.brand))) return r;
          changed = true;
          return Object.assign({}, r, { status: PENDING });
        });
      }
      const s = JSON.stringify(out);
      if (s.length > 900000) return res.status(413).json({ error: 'too large' });
      await redis(['SET', rk(key), s]);
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
      return res.status(200).json(changed ? { ok: true, value: out } : { ok: true });
    }
    res.status(405).end();
  } catch (e) {
    console.error('data api error:', e.message);
    res.status(500).json({ error: 'server error', detail: String(e.message || '').slice(0, 160) });
  }
};
