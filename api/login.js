const { sign, checkPassword, loginState, noteFailure, clearFailures, appCfg, redis, getAssign, TOKEN_V, LOCK_MAX } = require('../lib/core');
const { findUser, brandsFor, normBrand } = require('../lib/team');

/*
 * One roster (lib/team.js) decides who may sign in and which products the
 * person owns. An admin signs in with his own ADMIN_PASSWORD_n (Vercel env),
 * the rest of the team with the shared first password; an admin or a GPM has to
 * set his own password before he can see any data.
 *
 * The product names are mapped to the names used in the site ("Nerhasilda 50mg"
 * -> "Nerhasilda"), so the brand selector, the filters and the budget lines all
 * speak about the same product.
 *
 * Two guards:
 *   - LOCK_MAX wrong passwords in a row lock the address for LOCK_MS;
 *   - if Redis cannot be read the sign-in is REFUSED (503) instead of falling
 *     back to the first password.
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
  const fail = async (extra) => {
    await new Promise(r => setTimeout(r, 600));
    return res.status(401).json(Object.assign({ error: 'invalid' }, extra || {}));
  };
  if (!email || !password) return fail();

  const u = findUser(email);
  if (!u) return fail();

  const down = () => res.status(503).json({ error: 'The data store is not reachable right now. Try again in a minute.' });
  let st;
  try { st = await loginState(email); } catch (e) { return down(); }
  if (st.until > Date.now()) {
    await new Promise(r => setTimeout(r, 600));
    return res.status(429).json({ error: 'locked', retryAfter: Math.ceil((st.until - Date.now()) / 1000) });
  }

  let chk;
  try { chk = await checkPassword(email, password); } catch (e) { return down(); }
  if (!chk.ok) {
    let n = st.n + 1, until = 0;
    try { const f = await noteFailure(email); n = f.n; until = f.until; } catch (e) {}
    if (until) {
      await new Promise(r => setTimeout(r, 600));
      return res.status(429).json({ error: 'locked', retryAfter: Math.ceil((until - Date.now()) / 1000) });
    }
    return fail({ attemptsLeft: Math.max(0, LOCK_MAX - n) });
  }

  try { await clearFailures(email); } catch (e) {}

  // Reading the store again would cost a command; chk already tells us whether a hash exists.
  const brands = await canonicalBrands(req, brandsFor(u, await getAssign(appCfg(req).prefix)) || []);
  const forceChange = !!chk.first && (u.role === 'admin' || u.role === 'gpm');
  const user = {
    email: u.email,
    name: u.name,
    role: u.role,
    team: u.team || '',
    manager: u.manager || null,
    brands,
    mustChange: !!chk.first,
    forceChange
  };
  const token = sign({
    v: TOKEN_V,
    e: user.email, n: user.name, r: user.role, b: brands, tm: user.team, fc: forceChange ? 1 : 0,
    exp: Date.now() + 12 * 3600 * 1000
  });
  res.status(200).json({ token, user });
};
