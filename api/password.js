const { authUser, checkPassword, setPassword, passwordProblem, sign, TOKEN_V } = require('../lib/core');

/* Password change. An admin or a GPM who still uses his first password has to
   change it before the app shows any data; for everybody else it stays optional.
   A successful change hands back a fresh token without the change flag, so the
   user is not asked again. */
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
  const problem = passwordProblem(me.e, next);
  if (problem) return res.status(400).json({ error: problem });
  if (next === current) return res.status(400).json({ error: 'The new password is the same as the current one' });
  let chk;
  try { chk = await checkPassword(me.e, current); } catch (e) { return res.status(503).json({ error: 'The data store is not reachable — nothing was changed.' }); }
  if (!chk.ok) return res.status(403).json({ error: 'The current password is not correct' });
  await setPassword(me.e, next);
  if (!me.fc) return res.status(200).json({ ok: true });
  const token = sign({
    v: TOKEN_V, e: me.e, n: me.n, r: me.r, b: me.b || [], tm: me.tm || '', fc: 0,
    exp: Date.now() + 12 * 3600 * 1000
  });
  res.status(200).json({ ok: true, token });
};
