const { authUser, appCfg, getAssign, redis, resetPassword } = require('../lib/core');
const { findUser, teamFor, teams, brandsFor, roster } = require('../lib/team');

/* POST { email } (Director only): put one person back on the first password.
   It lives here and not in its own file because the Vercel Hobby plan allows
   12 functions and /api already has 12. */
async function resetMember(req, res, me) {
  if (me.r !== 'admin') return res.status(403).json({ error: 'forbidden' });
  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch (e) {}
  const email = String(body.email || '').trim().toLowerCase();
  if (!email || !findUser(email)) return res.status(404).json({ error: 'This person is not in the roster' });
  if (email === String(me.e).toLowerCase()) return res.status(400).json({ error: 'Use Change password for your own account' });
  try { await resetPassword(email); } catch (e) { return res.status(503).json({ error: 'The data store is not reachable — nothing was changed.' }); }
  const prefix = appCfg(req).prefix;
  try {
    await redis(['LPUSH', prefix + 'audit', JSON.stringify({ t: Date.now(), u: me.e, k: 'team', a: 'password reset', l: email, b: '' })]);
    await redis(['LTRIM', prefix + 'audit', 0, 499]);
  } catch (e) {}
  res.status(200).json({ ok: true });
}

/* Team of the signed-in GPM (admins: every team). PMs get 403. */
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let me;
  try { me = authUser(req); } catch (e) { return res.status(500).json({ error: 'server not configured' }); }
  if (!me) return res.status(401).json({ error: 'unauthorized' });
  if (me.fc) return res.status(403).json({ error: 'password_change_required' });
  if (me.r === 'pm') return res.status(403).json({ error: 'forbidden' });
  if (req.method === 'POST') return resetMember(req, res, me);
  const all = teams();
  const assign = await getAssign(appCfg(req).prefix);
  const keys = me.r === 'admin' ? Object.keys(all) : [ (findUser(me.e) || {}).team ].filter(Boolean);
  const out = keys.map(k => {
    const t = teamFor(k);
    return {
      name: t.name,
      gpm: t.gpm,
      gpmName: t.gpm ? (findUser(t.gpm) || {}).name || t.gpm : '',
      members: t.members.map(p => ({ email: p.email, name: p.name, role: p.role, brands: brandsFor({ email: p.email, role: p.role, brands: p.brands || [], team: p.team || '' }, assign) || [] }))
    };
  });
  const directors = me.r === 'admin'
    ? roster().admins.filter(e => e !== String(me.e).toLowerCase()).map(e => { const u = findUser(e) || {}; return { email: e, name: u.name || e, role: 'admin', brands: [] }; })
    : [];
  res.status(200).json({ teams: out, directors });
};
