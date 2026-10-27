const { sign, checkPassword, isDefaultPassword, redis, appCfg } = require('../lib/core');
const { findUser, brandsFor, normBrand } = require('../lib/team');

/*
 * One roster (lib/team.js) decides who may sign in and which products the
 * person owns. Everybody starts with the same default password (123456) and
 * may change it later - it is never compulsory.
 *
 * The product names are mapped to the names used in the site ("Nerhasilda 50mg"
 * -> "Nerhasilda"), so the brand selector, the filters and the budget lines all
 * speak about the same product.
 */
async function canonicalBrands(req, brands) {
  try {
    const raw = await redis(['GET', appCfg(req).prefix + 'portfolio']);
    const names = (raw ? JSON.parse(raw) : []).map(p => p && p.brand).filter(Boolean);
    const out = [], seen = new Set();
    brands.forEach(b => {
      const found = names.find(n => normBrand(n) === normBrand(b)) || b;
      const key = normBrand(found);
      if (key && !seen.has(key)) { seen.add(key); out.push(found); }
    });
    return out;
  } catch (e) { return brands; }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch (e) {}
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const fail = async () => {
    await new Promise(r => setTimeout(r, 600));
    return res.status(401).json({ error: 'invalid' });
  };
  if (!email || !password) return fail();

  const u = findUser(email);
  if (!u) return fail();

  let ok = false;
  try { ok = await checkPassword(email, password); } catch (e) { return res.status(500).json({ error: 'server not configured' }); }
  if (!ok) return fail();

  const brands = await canonicalBrands(req, brandsFor(u) || []);
  const user = {
    email: u.email,
    name: u.name,
    role: u.role,
    team: u.team || '',
    manager: u.manager || null,
    brands,
    mustChange: await isDefaultPassword(email)
  };
  const token = sign({
    v: 10,
    e: user.email, n: user.name, r: user.role, b: brands, tm: user.team,
    exp: Date.now() + 12 * 3600 * 1000
  });
  res.status(200).json({ token, user });
};
