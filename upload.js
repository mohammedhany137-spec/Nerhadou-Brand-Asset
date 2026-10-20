const { authUser } = require('../lib/core');

module.exports = async (req, res) => {
  try {
    const { handleUpload } = await import('@vercel/blob/client');
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const me = authUser({ headers: { authorization: 'Bearer ' + (clientPayload || '') } });
        if (!me) throw new Error('unauthorized');
        return { addRandomSuffix: true, maximumSizeInBytes: 500 * 1024 * 1024, tokenPayload: me.e };
      },
      onUploadCompleted: async () => {},
    });
    res.status(200).json(json);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
