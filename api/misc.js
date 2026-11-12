const { appCfg, authUser, redis, revString } = require('../lib/core');

/* Four small endpoints in one function, because the Vercel Hobby plan allows
   12 functions per deployment. vercel.json rewrites the old addresses here:
     /api/version -> ?fn=version   the data version number (asked for every 90 seconds)
     /api/audit   -> ?fn=audit     the change log, Director only
     /api/brands  -> ?fn=brands    product names only, for the cost-sharing picker
     /data/*, /lib/* -> no fn      always "not found" (second lock on the private folders;
                                   the first is "outputDirectory": "public") */
module.exports = async (req, res) => {
  const fn = String((req.query && req.query.fn) || '');
  res.setHeader('Cache-Control', fn === 'version' ? 'no-store, max-age=0' : 'no-store');

  if (fn === 'version') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    let me;
    try { me = authUser(req); } catch (e) { return res.status(500).end(); }
    if (!me) return res.status(401).end();
    if (me.fc) return res.status(403).end();
    try { return res.status(200).end(await revString(appCfg(req).prefix)); }
    catch (e) { return res.status(500).end(); }
  }

  if (fn === 'audit' || fn === 'brands') {
    let me;
    try { me = authUser(req); } catch (e) { return res.status(500).json({ error: 'server not configured' }); }
    if (!me) return res.status(401).json({ error: 'unauthorized' });
    if (me.fc) return res.status(403).json({ error: 'password_change_required' });

    if (fn === 'audit') {
      if (me.r !== 'admin') return res.status(403).json({ error: 'forbidden' });
      try {
        const l = await redis(['LRANGE', appCfg(req).prefix + 'audit', 0, 199]);
        return res.status(200).json({ log: (l || []).map(x => JSON.parse(x)) });
      } catch (e) { return res.status(500).json({ error: 'server error' }); }
    }

    let brands = [];
    try {
      const raw = await redis(['GET', appCfg(req).prefix + 'portfolio']);
      brands = (raw ? JSON.parse(raw) : []).map(p => p && p.brand).filter(Boolean);
    } catch (e) {}
    return res.status(200).json({ brands });
  }

  res.status(404).json({ error: 'not found' });
};
