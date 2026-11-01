const { appCfg, authUser, redis, env } = require('../lib/core');
const { PASSWORD_KEY } = require('../lib/team');
const { encrypt } = require('../lib/backup');

/* One snapshot of everything, two ways out of it:
 *
 *  GET   the Marketing Director presses 💾 and gets the plain JSON of the whole
 *        database - the server's copy, not the copy sitting in his browser tab.
 *  POST  the Vercel Cron job (Authorization: Bearer $CRON_SECRET) every night. The
 *        snapshot is encrypted with AES-256-GCM before it leaves for Vercel Blob,
 *        because it contains the staff emails, the products and the money. The last
 *        fourteen nights are kept and the older ones are deleted.
 */
const PREFIX = 'backups/';
const KEEP = 14;

function snapshotKeys(A) {
  return A.keys.concat(['docs', 'assign']);
}

/* Everything the app stores, with the password hashes only in the encrypted copy. */
async function readAll(A, withPasswords) {
  const keys = snapshotKeys(A);
  const vals = await redis(['MGET', ...keys.map(k => A.prefix + k)]);
  const out = {};
  keys.forEach((k, i) => {
    if (!vals[i]) return;
    try { out[k] = JSON.parse(vals[i]); } catch (e) { out[k] = vals[i]; }
  });
  if (withPasswords) {
    const h = await redis(['HGETALL', PASSWORD_KEY]);
    if (h && h.length) {
      const map = {};
      for (let i = 0; i < h.length; i += 2) map[h[i]] = h[i + 1];
      out.$passwords = map;
    }
  }
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const A = appCfg(req);
  const method = String(req.method || '').toUpperCase();

  if (method !== 'GET') {
    const token = env('CRON_SECRET', '');
    const head = String((req.headers && req.headers.authorization) || '');
    if (!token || head !== 'Bearer ' + token) return res.status(401).json({ error: 'unauthorized' });
  } else {
    let me;
    try { me = authUser(req); } catch (e) { return res.status(500).json({ error: 'server not configured' }); }
    if (!me) return res.status(401).json({ error: 'unauthorized' });
    if (me.fc) return res.status(403).json({ error: 'password_change_required' });
    if (me.r !== 'admin') return res.status(403).json({ error: 'forbidden' });
  }

  const json = method === 'GET';
  let snap;
  try { snap = await readAll(A, !json); } catch (e) { return res.status(503).json({ error: 'the data store could not be read' }); }
  const text = JSON.stringify(snap);

  if (json) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="nerhadou_backup_' + new Date().toISOString().slice(0, 10) + '.json"');
    return res.status(200).send(text);
  }

  /* Nightly: encrypt, store, and keep only the last fourteen nights. */
  try {
    const blob = await import('@vercel/blob');
    const name = PREFIX + 'nerhadou_' + new Date().toISOString().slice(0, 10) + '.enc';
    const saved = await blob.put(name, encrypt(text), { access: 'private', addRandomSuffix: false, contentType: 'application/octet-stream' });
    let removed = 0;
    try {
      const page = await blob.list({ prefix: PREFIX, limit: 100, output: 'expanded' });
      const older = page.objects.slice().sort((a, b) => String(b.uploadedAt || b.pathname).localeCompare(String(a.uploadedAt || a.pathname))).slice(KEEP);
      for (const o of older) { try { await blob.deleteUrl(o.url); removed++; } catch (e) {} }
    } catch (e) {}
    console.log('backup: ' + text.length + ' bytes -> ' + saved.pathname + ' (older copies deleted: ' + removed + ')');
    return res.status(200).json({ ok: true, key: saved.pathname, bytes: text.length, removed });
  } catch (e) {
    console.error('backup failed:', e.message);
    return res.status(500).json({ error: 'backup failed', detail: String(e.message || '').slice(0, 160) });
  }
};
