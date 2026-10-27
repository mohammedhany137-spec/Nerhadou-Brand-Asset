const { authUser, checkPassword, setPassword } = require('../lib/core');

/* Optional password change. Nothing forces the user to change the default. */
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  let me;
  try { me = authUser(req); } catch (e) { return res.status(500).json({ error: 'server not configured' }); }
  if (!me) return res.status(401).json({ error: 'unauthorized' });
  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch (e) {}
  const current = String(body.current || '');
  const next = String(body.next || '');
  if (!current || !next) return res.status(400).json({ error: 'missing' });
  if (next.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  if (next === current) return res.status(400).json({ error: 'The new password is the same as the current one' });
  let ok = false;
  try { ok = await checkPassword(me.e, current); } catch (e) { return res.status(500).json({ error: 'server error' }); }
  if (!ok) return res.status(403).json({ error: 'The current password is not correct' });
  await setPassword(me.e, next);
  res.status(200).json({ ok: true });
};
