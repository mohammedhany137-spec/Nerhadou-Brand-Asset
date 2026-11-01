const { authUser } = require('../lib/core');

/* The IQVIA market figures are bought. They used to sit in /data where any visitor
   could download them; now they are read here, by a signed-in member of the team only.
   require() is what makes Vercel carry the two files along with this function. */
const SETS = {
  market: '../data/iqvia.json',
  products: '../data/iqvia_products.json'
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let me;
  try { me = authUser(req); } catch (e) { return res.status(500).json({ error: 'server not configured' }); }
  if (!me) return res.status(401).json({ error: 'unauthorized' });
  if (me.fc) return res.status(403).json({ error: 'password_change_required' });
  const name = String((req.query && req.query.set) || '');
  const file = SETS[name];
  if (!file) return res.status(400).json({ error: 'bad set' });
  try {
    res.status(200).json(require(file));
  } catch (e) {
    /* The JSON sits outside api/, so Vercel must carry it into the function bundle.
       If it did not, this is a deployment problem and must not look like a bad request. */
    console.error('iqvia: ' + name + ' could not be read: ' + e.message);
    res.status(500).json({ error: 'the market data file is missing from this deployment', detail: String(e.message || '').slice(0, 160) });
  }
};
