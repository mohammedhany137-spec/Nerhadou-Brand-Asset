const { appCfg, authUser, revString } = require('../lib/core');

/* The 11-byte version of the data. The page asks for it every 90 seconds and
   only downloads the data when the number has really changed. */
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  let me;
  try { me = authUser(req); } catch (e) { return res.status(500).end(); }
  if (!me) return res.status(401).end();
  try {
    const v = await revString(appCfg(req).prefix);
    return res.status(200).end(v);
  } catch (e) { return res.status(500).end(); }
};
