const { authUser } = require('../lib/core');

/* The page comes here before it pushes a file to Vercel Blob. The same signed
   session that opens the data has to open the upload too; the browser sends it
   either as the Authorization header or as the upload clientPayload. */
module.exports = async (req, res) => {
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch (e) { body = {}; }
  let me;
  try { me = authUser(req) || authUser({ headers: { authorization: 'Bearer ' + String(body.clientPayload || '') } }); }
  catch (e) { return res.status(500).json({ error: 'server not configured' }); }
  if (!me) return res.status(401).json({ error: 'unauthorized' });
  if (me.fc) return res.status(403).json({ error: 'password_change_required' });
  try {
    const { handleUpload } = await import('@vercel/blob/client');
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({ addRandomSuffix: true, maximumSizeInBytes: 500 * 1024 * 1024, tokenPayload: me.e }),
      onUploadCompleted: async () => {},
    });
    res.status(200).json(json);
  } catch (e) {
    res.status(400).json({ error: String((e && e.message) || 'upload refused').slice(0, 160) });
  }
};
