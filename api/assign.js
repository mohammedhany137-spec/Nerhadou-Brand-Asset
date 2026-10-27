const { appCfg, authUser, redis, getAssign, setAssign } = require('../lib/core');
const { roster, teamFor, brandsFor } = require('../lib/team');

/*
 * Which product manager owns which brand.
 * GET  (admin) -> the assignments + the people + the brands of the portfolio
 * POST (admin) -> { brand, email }  (email = "" clears the assignment)
 *
 * The assignment always wins over lib/team.js: it is applied at login, in the
 * data scope of every request and on the Team page.
 */
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const A = appCfg(req);
  let me;
  try { me = authUser(req); } catch (e) { return res.status(500).json({ error: 'server not configured' }); }
  if (!me) return res.status(401).json({ error: 'unauthorized' });
  if (me.r !== 'admin') return res.status(403).json({ error: 'forbidden' });

  const people = Object.values(roster().byEmail)
    .filter(p => p.role === 'pm' || p.role === 'gpm')
    .map(p => {
      const t = teamFor(p.team);
      return {
        email: p.email,
        name: p.name,
        role: p.role,
        team: p.team || '',
        manager: t.gpm || '',
        brands: brandsFor({ email: p.email, role: p.role, brands: p.brands || [], team: p.team || '' }, null) || []
      };
    })
    .sort((a, b) => (a.team + a.name).localeCompare(b.team + b.name));

  if (req.method === 'GET') {
    let brands = [];
    try {
      const raw = await redis(['GET', A.prefix + 'portfolio']);
      brands = (raw ? JSON.parse(raw) : []).map(p => p && p.brand).filter(Boolean);
    } catch (e) {}
    return res.status(200).json({ assign: await getAssign(A.prefix), people, brands });
  }

  if (req.method === 'POST') {
    let body = {};
    try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch (e) {}
    const brand = String(body.brand || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    if (!brand) return res.status(400).json({ error: 'brand is required' });
    if (email && !people.some(p => p.email === email && p.role === 'pm')) {
      return res.status(400).json({ error: 'this email is not a product manager in the roster' });
    }
    const map = await getAssign(A.prefix);
    // one brand -> one owner; drop any older spelling of the same brand
    Object.keys(map).forEach(k => { if (k !== brand && k.toLowerCase().replace(/[^a-z0-9]/g, '') === brand.toLowerCase().replace(/[^a-z0-9]/g, '')) delete map[k]; });
    if (email) map[brand] = email; else delete map[brand];
    await setAssign(A.prefix, map);
    return res.status(200).json({ ok: true, assign: map });
  }

  res.status(405).end();
};
