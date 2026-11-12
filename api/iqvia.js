const fs = require('fs'), path = require('path');
const { authUser, redis, appCfg } = require('../lib/core');

/* The IQVIA figures are bought, so no visitor may download them — a signed-in member reads them here.
   Vercel copies a file into the function bundle only when it can see the path as a plain string inside
   require(), which a path held in a variable hides: the two names are written out below. */
const SETS = {
  market: () => require('../data/iqvia.json'),
  products: () => require('../data/iqvia_products.json'),
  seed: () => require('../data/seed.json')
};
const NAMES = { market: 'iqvia.json', products: 'iqvia_products.json', seed: 'seed.json' };

/* The builder has placed traced files in more than one spot, so every layout it may have used is
   looked at, and a miss says which paths were searched instead of just failing. */
function fromDisk(name) {
  const f = NAMES[name];
  const roots = [__dirname, path.join(__dirname, '..'), process.cwd(), '/var/task'];
  const tried = [];
  for (const d of roots) {
    for (const p of [path.join(d, 'data', f), path.join(d, f)]) {
      tried.push(p);
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  }
  throw new Error('no copy of ' + f + ' in this bundle — searched: ' + tried.join(' | '));
}

function load(name) {
  try { return SETS[name](); } catch (e) { return fromDisk(name); }
}

/* ---------- the monthly update, uploaded from the site ----------
 * The Marketing Director uploads the new IQVIA file on the IQVIA page. The browser turns it
 * into the same two sets the bundled files hold and sends them here in parts (one stored value
 * has to stay under the size limit of the data store). The parts are staged under an upload id
 * and only become the live data when the last step - "commit" - switches one pointer, so a
 * half-finished upload is never shown to anybody. "reset" goes back to the bundled files.
 */
const PART_MAX = 850000;
const MAX_PARTS = 24;
const key = (A, x) => A.prefix + 'iqvia:' + x;
const okId = id => /^[a-z0-9]{6,24}$/.test(String(id || ''));
const okPart = n => /^(market|p\d{1,2})$/.test(String(n || ''));

async function current(A) {
  try {
    const raw = await redis(['GET', key(A, 'current')]);
    const c = raw ? JSON.parse(raw) : null;
    return c && okId(c.id) && Array.isArray(c.parts) ? c : null;
  } catch (e) { return null; }
}

async function uploaded(A, name) {
  const c = await current(A);
  if (!c) return null;
  if (name === 'market') {
    const raw = await redis(['GET', key(A, c.id + ':market')]);
    return raw ? JSON.parse(raw) : null;
  }
  const parts = c.parts.filter(p => p !== 'market');
  if (!parts.length) return null;
  const vals = await redis(['MGET', ...parts.map(p => key(A, c.id + ':' + p))]);
  if (vals.some(v => !v)) return null;                 // a part is missing: fall back to the bundled file
  const out = { atc: {} };
  vals.forEach(v => { const j = JSON.parse(v); if (j.px) out.px = j.px; Object.assign(out.atc, j.atc || {}); });
  return out;
}

function checkPart(name, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'the part is not an object';
  if (!data.atc || typeof data.atc !== 'object' || Array.isArray(data.atc)) return 'the part has no markets';
  if (name === 'market') {
    if (!Array.isArray(data.periods) || data.periods.length < 2 || data.periods.some(p => typeof p !== 'string')) return 'the periods are missing';
    const bad = Object.values(data.atc).some(e => !e || typeof e.m !== 'object');
    return bad ? 'a market has no figures' : '';
  }
  return Object.values(data.atc).some(rows => !Array.isArray(rows) || rows.some(r => !Array.isArray(r) || typeof r[0] !== 'string')) ? 'a product row is malformed' : '';
}

async function write(req, res, A, me) {
  let b = {};
  try { b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch (e) { return res.status(400).json({ error: 'bad request' }); }
  const op = String(b.op || '');

  if (op === 'reset') {
    const c = await current(A);
    await redis(['DEL', key(A, 'current')]);
    if (c) { try { await redis(['DEL', ...c.parts.map(p => key(A, c.id + ':' + p))]); } catch (e) {} }
    return res.status(200).json({ ok: true, source: 'bundled' });
  }
  if (!okId(b.id)) return res.status(400).json({ error: 'bad upload id' });

  if (op === 'part') {
    if (!okPart(b.name)) return res.status(400).json({ error: 'bad part name' });
    const why = checkPart(b.name, b.data);
    if (why) return res.status(400).json({ error: why });
    const text = JSON.stringify(b.data);
    if (text.length > PART_MAX) return res.status(413).json({ error: 'this part is too large' });
    await redis(['SET', key(A, b.id + ':' + b.name), text, 'EX', '86400']);   // staged parts expire if never committed
    return res.status(200).json({ ok: true, bytes: text.length });
  }

  if (op === 'commit') {
    const parts = [...new Set((Array.isArray(b.parts) ? b.parts : []).map(String))];
    if (!parts.includes('market') || parts.length < 2 || parts.length > MAX_PARTS || !parts.every(okPart)) return res.status(400).json({ error: 'bad list of parts' });
    const keys = parts.map(p => key(A, b.id + ':' + p));
    const have = await redis(['MGET', ...keys]);
    if (have.some(v => !v)) return res.status(409).json({ error: 'a part did not arrive; upload the file again' });
    for (const k of keys) await redis(['PERSIST', k]);
    const old = await current(A);
    const meta = { id: b.id, parts, updated: String(b.updated || '').slice(0, 40), by: me.n || me.e, at: Date.now() };
    await redis(['SET', key(A, 'current'), JSON.stringify(meta)]);
    if (old && old.id !== b.id) { try { await redis(['DEL', ...old.parts.map(p => key(A, old.id + ':' + p))]); } catch (e) {} }
    return res.status(200).json({ ok: true, source: 'uploaded', updated: meta.updated });
  }
  return res.status(400).json({ error: 'bad op' });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let me;
  try { me = authUser(req); } catch (e) { return res.status(500).json({ error: 'server not configured' }); }
  if (!me) return res.status(401).json({ error: 'unauthorized' });
  if (me.fc) return res.status(403).json({ error: 'password_change_required' });
  const A = appCfg(req);
  const method = String(req.method || 'GET').toUpperCase();

  if (method === 'POST') {
    if (me.r !== 'admin') return res.status(403).json({ error: 'only the Marketing Director/Manager can update the market data' });
    try { return await write(req, res, A, me); }
    catch (e) { console.error('iqvia upload:', e.message); return res.status(500).json({ error: 'the upload could not be stored', detail: String(e.message || '').slice(0, 160) }); }
  }

  const name = String((req.query && req.query.set) || '');
  if (name === 'info') {
    const c = await current(A);
    return res.status(200).json(c ? { source: 'uploaded', updated: c.updated, by: c.by, at: c.at } : { source: 'bundled' });
  }
  if (!SETS[name]) return res.status(400).json({ error: 'bad set' });
  /* The first figures the Hub was filled with: money, targets and sales. Only the Marketing
     Director reloads them, so nobody else can read them from here. */
  if (name === 'seed' && me.r !== 'admin') return res.status(403).json({ error: 'forbidden' });
  try {
    if (name !== 'seed') {
      let up = null;
      try { up = await uploaded(A, name); } catch (e) { console.error('iqvia: uploaded ' + name + ' unreadable, using the bundled file: ' + e.message); }
      if (up) return res.status(200).json(up);
    }
    res.status(200).json(load(name));
  } catch (e) {
    /* A missing file is a deployment problem and must not look like a bad request. */
    console.error('iqvia: ' + name + ' could not be read: ' + e.message);
    res.status(500).json({ error: 'the market data file is missing from this deployment', detail: String(e.message || '').slice(0, 240) });
  }
};
