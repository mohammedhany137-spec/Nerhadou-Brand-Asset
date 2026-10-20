const { env, sign, same } = require('../lib/core');

const list = (v) => String(v || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
const nice = (e) => e.split('@')[0].split(/[._-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  // Marketing Director + Marketing Manager (same role): ADMIN_EMAILS = "director@..,manager@.."
  const admins = list(process.env.ADMIN_EMAILS || env('ADMIN_EMAIL', 'mohamed.hany@nerhadou.com'));
  const gpms = list(process.env.GPM_EMAILS);
  const domain = '@' + env('ALLOWED_DOMAIN', 'nerhadou.com').toLowerCase();
  const adminPass = process.env.ADMIN_PASSWORD;
  const userPass = process.env.USER_PASSWORD;
  const gpmPass = process.env.GPM_PASSWORD || userPass;
  const ub = {};
  try { Object.entries(JSON.parse(process.env.USER_BRANDS || '{}')).forEach(([k, v]) => { ub[k.toLowerCase()] = [].concat(v); }); } catch (e) {}
  let user = null;
  if (admins.includes(email)) {
    if (adminPass && same(password, adminPass)) user = { email, name: nice(email), role: 'admin' };
  } else if (gpms.includes(email)) {
    if (gpmPass && same(password, gpmPass)) user = { email, name: nice(email), role: 'gpm' };
  } else if (userPass && email.endsWith(domain) && same(password, userPass)) {
    user = { email, name: nice(email), role: 'pm' };
  }
  if (user && user.role !== 'admin') user.brands = ub[email] || [];
  if (!user) {
    await new Promise(r => setTimeout(r, 600));
    return res.status(401).json({ error: 'invalid' });
  }
  const token = sign({ e: user.email, n: user.name, r: user.role, b: user.brands || [], exp: Date.now() + 12 * 3600 * 1000 });
  res.status(200).json({ token, user });
};
