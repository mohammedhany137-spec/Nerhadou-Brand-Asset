const { appCfg, authUser, redis } = require('../lib/core');

/* Names of every product in the portfolio - names only, never data.
   Used by the "share this cost with another product" picker. */
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let me;
  try { me = authUser(req); } catch (e) { return res.status(500).json({ error: 'server not configured' }); }
  if (!me) return res.status(401).json({ error: 'unauthorized' });
  let brands = [];
  try {
    const raw = await redis(['GET', appCfg(req).prefix + 'portfolio']);
    brands = (raw ? JSON.parse(raw) : []).map(p => p && p.brand).filter(Boolean);
  } catch (e) {}
  res.status(200).json({ brands });
};
