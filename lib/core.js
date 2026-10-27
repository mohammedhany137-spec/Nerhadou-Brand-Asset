const crypto = require('crypto');
const { DEFAULT_PASSWORD, PASSWORD_KEY } = require('./team');

const APPS = {
  asset: {
    prefix: 'assetlib:',
    keys: ['portfolio','matrices','brand_master','strategy_plan','claims_evidence','approvals','pack_leaflet','field_tablet','website_social','campaigns_projects','current_approved','archive','target','budget','sales','campaigns','conferences','expenses','specshare','pipelines','events','meta'],
    approval: ['budget','sales','campaigns','conferences','events','expenses'],
    adminRead: ['pipelines'],
    objects: ['matrices','meta'],
    admin: ['portfolio','specshare','pipelines','meta']
  }
};
function appCfg(req) {
  let a = req.query && req.query.app;
  if (!a) { try { a = new URL(req.url, 'http://x').searchParams.get('app'); } catch (e) {} }
  return APPS[a] || APPS.asset;
}
const PENDING = 'Waiting for Admin Approval';

function env(n, d) { return process.env[n] || d; }
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set');
  return s;
}
function b64(x) { return Buffer.from(x).toString('base64url'); }
function sign(payload) {
  const body = b64(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return body + '.' + sig;
}
const TOKEN_V = 10; // bump to invalidate every old session after a deploy
function verify(tok) {
  if (!tok || tok.indexOf('.') < 0) return null;
  const [body, sig] = tok.split('.');
  const good = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.v === TOKEN_V && p.exp > Date.now() ? p : null;
  } catch (e) { return null; }
}
function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function authUser(req) {
  const h = req.headers.authorization || '';
  return verify(h.startsWith('Bearer ') ? h.slice(7) : '');
}

async function redis(cmd) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const tk = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !tk) throw new Error('Redis env vars are not set');
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

/* ---------- passwords ----------
   Everybody starts with DEFAULT_PASSWORD (123456). Once a user changes it, only
   a salted HMAC of the new password is kept in Redis (assetlib:pw), never the
   password itself. Changing it is always optional. */
function passHash(email, pass) {
  return crypto.createHmac('sha256', secret())
    .update('pw|' + String(email || '').trim().toLowerCase() + '|' + String(pass || ''))
    .digest('hex');
}
async function storedPass(email) {
  try {
    const h = await redis(['HGET', PASSWORD_KEY, String(email || '').trim().toLowerCase()]);
    return h || null;
  } catch (e) { return null; }
}
async function checkPassword(email, pass) {
  const h = await storedPass(email);
  if (h) return same(passHash(email, pass), h);
  return same(pass, env('DEFAULT_PASSWORD', DEFAULT_PASSWORD));
}
async function setPassword(email, pass) {
  await redis(['HSET', PASSWORD_KEY, String(email || '').trim().toLowerCase(), passHash(email, pass)]);
}
async function isDefaultPassword(email) { return !(await storedPass(email)); }

/* ---------- brand -> product manager assignments (set by an admin) ---------- */
async function getAssign(prefix) {
  try {
    const raw = await redis(['GET', prefix + 'assign']);
    const o = raw ? JSON.parse(raw) : {};
    return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
  } catch (e) { return {}; }
}
async function setAssign(prefix, obj) {
  await redis(['SET', prefix + 'assign', JSON.stringify(obj || {})]);
}

/* ---------- data revision (the 11-byte version the page polls) ---------- */
async function revString(prefix) {
  const raw = await redis(['GET', prefix + 'rev']);
  return String(raw || '0').replace(/[^0-9]/g, '').slice(-11).padStart(11, '0');
}
async function bumpRev(prefix) {
  try { await redis(['INCR', prefix + 'rev']); } catch (e) {}
}

module.exports = { appCfg, PENDING, env, secret, sign, same, authUser, redis, checkPassword, setPassword, isDefaultPassword, revString, bumpRev, getAssign, setAssign };
