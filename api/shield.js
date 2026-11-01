/* /data and /lib are part of the project so that the API functions can read them,
   but Vercel would also serve them to anybody who guesses the address — the licensed
   IQVIA figures and the staff roster included. vercel.json sends every request for
   those two folders here, and nothing is ever returned. */
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(404).json({ error: 'not found' });
};
