const crypto = require('crypto');
const { DEFAULT_PASSWORD, PASSWORD_KEY, adminFirstPassword } = require('./team');

const APPS = {
  asset: {
    prefix: 'assetlib:',
    keys: ['portfolio','matrices','brand_master','strategy_plan','claims_evidence','approvals','pack_leaflet','field_tablet','website_social','campaigns_projects','current_approved','archive','target','budget','sales','campaigns','conferences','expenses','specshare','pipelines','events','meta'],
    approval: ['budget','sales','campaigns','conferences','events','expenses'],
    adminRead: ['pipelines'],
    objects: ['matrices','meta'],
    admin: ['portfolio','specshare','pipelines','meta','sales']
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
const TOKEN_V = 11; // bump to invalidate every old session after a deploy
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
   An admin signs in with his own ADMIN_PASSWORD_n (Vercel env); everybody else signs
   in with DEFAULT_PASSWORD. Once a person changes it, only a salted HMAC is kept in
   Redis (assetlib:pw) - never the password itself.
   If Redis cannot be read, signing in is REFUSED: a storage error must never fall back
   to the shared first password. */
const MIN_PW = 8;
const LOCK_KEY = 'assetlib:lock:';
const LOCK_MAX = 5;          // wrong attempts before the account is locked
const LOCK_MS = 15 * 60000;  // and how long the lock lasts

function passHash(email, pass) {
  return crypto.createHmac('sha256', secret())
    .update('pw|' + String(email || '').trim().toLowerCase() + '|' + String(pass || ''))
    .digest('hex');
}
/* Throws when the store cannot be read (login then fails closed). */
async function storedPass(email) {
  const h = await redis(['HGET', PASSWORD_KEY, String(email || '').trim().toLowerCase()]);
  return h || null;
}
function firstPasswordFor(email) {
  return adminFirstPassword(email) || env('DEFAULT_PASSWORD', DEFAULT_PASSWORD);
}
/* {ok, hasHash, first} - hasHash tells the caller whether the account still uses its first password. */
async function checkPassword(email, pass) {
  const h = await storedPass(email);
  if (h) return { ok: same(passHash(email, pass), h), hasHash: true, first: false };
  return { ok: same(pass, firstPasswordFor(email)), hasHash: false, first: true };
}
async function setPassword(email, pass) {
  await redis(['HSET', PASSWORD_KEY, String(email || '').trim().toLowerCase(), passHash(email, pass)]);
  await redis(['DEL', LOCK_KEY + String(email || '').trim().toLowerCase()]);
}
/* The Director's reset: forget the person's own password and any lockout, so the
   next sign-in uses the first password again. */
async function resetPassword(email) {
  const e = String(email || '').trim().toLowerCase();
  await redis(['HDEL', PASSWORD_KEY, e]);
  await redis(['DEL', LOCK_KEY + e]);
}
async function isDefaultPassword(email) { return !(await storedPass(email)); }

/* Why a new password is not accepted, or '' when it is. */
function passwordProblem(email, next) {
  const p = String(next || '');
  if (p.length < MIN_PW) return 'Password must be at least ' + MIN_PW + ' characters';
  if (/^[\d\W_]+$/.test(p) && /^\d+$/.test(p)) return 'A password of only digits is too easy to guess';
  const first = firstPasswordFor(email);
  if (p === first || p === env('DEFAULT_PASSWORD', DEFAULT_PASSWORD)) return 'That is the first password — choose something only you know';
  return '';
}

/* ---------- failed sign-in lockout ---------- */
async function loginState(email) {
  const key = LOCK_KEY + String(email || '').trim().toLowerCase();
  const raw = await redis(['GET', key]);
  let st = { n: 0, until: 0 };
  if (raw) { try { st = Object.assign(st, JSON.parse(raw) || {}); } catch (e) {} }
  if (st.until && st.until < Date.now()) st = { n: 0, until: 0 };
  return st;
}
async function noteFailure(email) {
  const key = LOCK_KEY + String(email || '').trim().toLowerCase();
  const n = (await loginState(email)).n + 1;
  const until = n >= LOCK_MAX ? Date.now() + LOCK_MS : 0;
  await redis(['SET', key, JSON.stringify({ n, until }), 'PX', LOCK_MS]);
  return { n, until };
}
async function clearFailures(email) {
  try { await redis(['DEL', LOCK_KEY + String(email || '').trim().toLowerCase()]); } catch (e) {}
}

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

module.exports = {
  appCfg, PENDING, env, secret, sign, verify, same, authUser, redis, TOKEN_V,
  MIN_PW, LOCK_MAX, LOCK_MS,
  checkPassword, setPassword, resetPassword, storedPass, isDefaultPassword, firstPasswordFor, passwordProblem,
  loginState, noteFailure, clearFailures,
  revString, bumpRev, getAssign, setAssign
};
