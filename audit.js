const { authUser, redis } = require('../lib/core');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let me;
  try { me = authUser(req); } catch (e) { return res.status(500).json({ error: 'server not configured' }); }
  if (!me) return res.status(401).json({ error: 'unauthorized' });
  if (me.r !== 'admin') return res.status(403).json({ error: 'forbidden' });
  try {
    const l = await redis(['LRANGE', 'assetlib:audit', 0, 199]);
    res.status(200).json({ log: (l || []).map(x => JSON.parse(x)) });
  } catch (e) { res.status(500).json({ error: 'server error' }); }
};
