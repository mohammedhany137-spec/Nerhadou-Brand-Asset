const crypto = require('crypto');

const APPS = {
  asset: {
    prefix: 'assetlib:',
    keys: ['portfolio','matrices','brand_master','strategy_plan','claims_evidence','approvals','pack_leaflet','field_tablet','website_social','campaigns_projects','current_approved','archive','target','budget','sales','campaigns','conferences','expenses','specshare','meta'],
    approval: ['budget','sales','campaigns','conferences','expenses'],
    objects: ['matrices','meta'],
    admin: ['portfolio','specshare','meta']
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
function verify(tok) {
  if (!tok || tok.indexOf('.') < 0) return null;
  const [body, sig] = tok.split('.');
  const good = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
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

module.exports = { appCfg, PENDING, env, sign, same, authUser, redis };
