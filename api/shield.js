/* /data and /lib are part of the project so that the API functions can read them, and
   must never be served to a browser - the licensed IQVIA figures, the starting figures
   and the staff roster are in there.

   What keeps them private is "outputDirectory": "public" in vercel.json: only the files
   inside /public are published as the site. A rewrite alone does not do it, because
   Vercel serves a file that exists before it looks at the rewrites. The two rewrites to
   this function stay as a second lock, in case the folders are ever published again. */
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(404).json({ error: 'not found' });
};
