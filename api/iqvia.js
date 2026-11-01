const fs = require('fs'), path = require('path');
const { authUser } = require('../lib/core');

/* The IQVIA figures are bought, so no visitor may download them — a signed-in member reads them here.
   Vercel copies a file into the function bundle only when it can see the path as a plain string inside
   require(), which a path held in a variable hides: the two names are written out below. */
const SETS = {
  market: () => require('../data/iqvia.json'),
  products: () => require('../data/iqvia_products.json')
};
const NAMES = { market: 'iqvia.json', products: 'iqvia_products.json' };

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

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let me;
  try { me = authUser(req); } catch (e) { return res.status(500).json({ error: 'server not configured' }); }
  if (!me) return res.status(401).json({ error: 'unauthorized' });
  if (me.fc) return res.status(403).json({ error: 'password_change_required' });
  const name = String((req.query && req.query.set) || '');
  if (!SETS[name]) return res.status(400).json({ error: 'bad set' });
  try {
    res.status(200).json(load(name));
  } catch (e) {
    /* A missing file is a deployment problem and must not look like a bad request. */
    console.error('iqvia: ' + name + ' could not be read: ' + e.message);
    res.status(500).json({ error: 'the market data file is missing from this deployment', detail: String(e.message || '').slice(0, 240) });
  }
};
