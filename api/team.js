const { authUser } = require('../lib/core');
const { findUser, teamFor, teams } = require('../lib/team');

/* Team of the signed-in GPM (admins: every team). PMs get 403. */
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let me;
  try { me = authUser(req); } catch (e) { return res.status(500).json({ error: 'server not configured' }); }
  if (!me) return res.status(401).json({ error: 'unauthorized' });
  if (me.r === 'pm') return res.status(403).json({ error: 'forbidden' });
  const all = teams();
  const keys = me.r === 'admin' ? Object.keys(all) : [ (findUser(me.e) || {}).team ].filter(Boolean);
  const out = keys.map(k => {
    const t = teamFor(k);
    return {
      name: t.name,
      gpm: t.gpm,
      members: t.members.map(p => ({ email: p.email, name: p.name, role: p.role, brands: p.brands || [] }))
    };
  });
  res.status(200).json({ teams: out });
};
