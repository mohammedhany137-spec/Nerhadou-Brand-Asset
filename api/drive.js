const { appCfg, authUser, redis, getAssign } = require('../lib/core');
const { brandsFor, normBrand } = require('../lib/team');
const drive = require('../lib/drive');

/* The library files of a brand, read from its Google Drive folder.
 *
 *   GET /api/drive?map=1           which of the caller's brands have a Drive folder
 *   GET /api/drive?brand=Vita D3 ODF[&fresh=1]
 *
 * A reading is kept for 30 minutes, so Drive is not asked again by every page view; "fresh"
 * asks again (at most once a minute per folder). If Google cannot be reached, the last good
 * reading is served and marked as old. A product manager can only ask for his own brands.
 */
const TTL = 1800;
const k = (A, id, what) => A.prefix + 'drive:' + what + ':' + id;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let me;
  try { me = authUser(req); } catch (e) { return res.status(500).json({ error: 'server not configured' }); }
  if (!me) return res.status(401).json({ error: 'unauthorized' });
  if (me.fc) return res.status(403).json({ error: 'password_change_required' });
  const A = appCfg(req);
  const q = req.query || {};

  try {
    let portfolio = [];
    try { portfolio = JSON.parse((await redis(['GET', A.prefix + 'portfolio'])) || '[]'); } catch (e) {}
    let mine = null;
    if (me.r !== 'admin') {
      const b = brandsFor({ email: me.e, role: me.r, brands: me.b || [], team: me.tm || '' }, await getAssign(A.prefix));
      mine = b === null ? null : new Set(b.map(normBrand).filter(Boolean));
    }
    const allowed = b => !mine || mine.has(normBrand(b));

    if (q.map) {
      const brands = (Array.isArray(portfolio) ? portfolio : []).map(p => p && p.brand).filter(b => b && allowed(b) && drive.folderFor(b));
      return res.status(200).json({ mode: drive.mode(), brands });
    }

    const brand = String(q.brand || '');
    if (!brand) return res.status(400).json({ error: 'brand is required' });
    if (!allowed(brand)) return res.status(403).json({ error: 'forbidden' });
    const folder = drive.folderFor(brand);
    if (!folder) return res.status(200).json({ brand, folder: '', sections: {}, files: 0, none: true });

    const [mark, saved] = await redis(['MGET', k(A, folder, 'fresh'), k(A, folder, 'data')]);
    let old = null;
    try { old = saved ? JSON.parse(saved) : null; } catch (e) {}
    const wantFresh = !!q.fresh && (!old || Date.now() - (old.at || 0) > 60000);
    if (old && mark && !wantFresh) return res.status(200).json(Object.assign({ brand }, old));

    try {
      const now = await drive.readBrand(folder);
      await redis(['SET', k(A, folder, 'data'), JSON.stringify(now)]);
      await redis(['SET', k(A, folder, 'fresh'), '1', 'EX', String(TTL)]);
      return res.status(200).json(Object.assign({ brand }, now));
    } catch (e) {
      console.error('drive: ' + brand + ': ' + e.message);
      if (old) return res.status(200).json(Object.assign({ brand }, old, { stale: true, error: String(e.message || '').slice(0, 200) }));
      return res.status(200).json({ brand, folder, sections: {}, files: 0, mode: drive.mode(), error: String(e.message || 'Drive could not be read').slice(0, 200) });
    }
  } catch (e) {
    console.error('drive failed:', e.message);
    return res.status(500).json({ error: 'the Drive reader failed', detail: String(e.message || '').slice(0, 160) });
  }
};
