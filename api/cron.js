const { appCfg, authUser, redis, env, getAssign } = require('../lib/core');
const notify = require('../lib/notify');
const report = require('../lib/report');
const geo = require('../lib/geo');

/* The scheduled messages of the Hub.
 *
 *   Vercel Cron calls this every morning (Authorization: Bearer $CRON_SECRET):
 *     - each approver who has items waiting gets one reminder;
 *     - when an area manager has used up his budget share, the Director/Manager and the GPM
 *       of his line are told - once, not every morning;
 *     - on the first day of the month everybody gets the monthly report of his brands.
 *
 *   The Marketing Director can also start a job by hand from Data tools (POST {job}):
 *     test    one message to himself, to check that the channels are set up
 *     digest  the approval reminders, now
 *     report  the monthly report, now
 *     status  which channels are configured (nothing is sent)
 */
async function readAll(A) {
  const keys = ['portfolio', 'target', 'budget', 'sales', 'expenses', 'conferences', 'events', 'specshare', 'geoshare'];
  const vals = await redis(['MGET', ...keys.map(k => A.prefix + k)]);
  const out = {};
  keys.forEach((k, i) => { try { out[k] = vals[i] ? JSON.parse(vals[i]) : []; } catch (e) { out[k] = []; } });
  return out;
}

async function sendAll(messages) {
  const sum = { messages: messages.length, teams: 0, email: 0, errors: [] };
  for (const m of messages) {
    const r = await notify.send(m);
    ['teams', 'email'].forEach(c => { if (r[c] === 'sent') sum[c]++; else if (/^error/.test(r[c]) && sum.errors.length < 5) sum.errors.push(c + ' ' + r[c]); });
  }
  return sum;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const A = appCfg(req);
  const head = String((req.headers && req.headers.authorization) || '');
  const secret = env('CRON_SECRET', '');
  const isCron = !!secret && head === 'Bearer ' + secret;

  let me = null, job = '';
  if (!isCron) {
    try { me = authUser(req); } catch (e) { return res.status(500).json({ error: 'server not configured' }); }
    if (!me) return res.status(401).json({ error: 'unauthorized' });
    if (me.fc) return res.status(403).json({ error: 'password_change_required' });
    if (me.r !== 'admin') return res.status(403).json({ error: 'forbidden' });
    if (String(req.method || '').toUpperCase() !== 'POST') return res.status(405).json({ error: 'use POST' });
    let body = {};
    try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch (e) {}
    job = String(body.job || '');
    if (!['test', 'digest', 'report', 'status'].includes(job)) return res.status(400).json({ error: 'bad job' });
  }

  const ch = notify.channels();
  if (job === 'status') return res.status(200).json({ ok: true, channels: ch, approvals: notify.approvalsOn() });
  if (!ch.teams && !ch.email) return res.status(200).json({ ok: false, channels: ch, note: 'no channel is configured: set TEAMS_WEBHOOK_URL, or RESEND_API_KEY and MAIL_FROM' });

  const url = notify.hubUrl(req);
  try {
    if (job === 'test') {
      const r = await notify.send({ to: [me.e], title: 'Nerhadou Hub: test message', url, lines: ['This is a test sent by ' + (me.n || me.e) + '.', 'If you can read it, this channel works.'] });
      return res.status(200).json({ ok: true, channels: ch, result: r });
    }

    const [data, assign] = await Promise.all([readAll(A), getAssign(A.prefix)]);
    const now = new Date();
    const out = { ok: true, channels: ch };

    if (job === 'digest' || (isCron && notify.approvalsOn())) out.digest = await sendAll(report.pendingMessages(data, assign, url));

    /* An area manager who reached his budget share: one message when it happens. The marker is
       cleared when he is back under it, so a later second crossing is announced again. */
    if (isCron || job === 'digest') {
      const year = now.getUTCFullYear();
      const over = geo.overMessages(data, geo.lines(assign, data.portfolio), year, url, report.fmt);
      const mark = id => A.prefix + 'geo:over:' + year + ':' + id;
      const fresh = [];
      for (const m of over) { if (await redis(['SET', mark(m.id), '1', 'NX'])) fresh.push(m); }
      const still = new Set(over.map(m => m.id));
      for (const g of (Array.isArray(data.geoshare) ? data.geoshare : [])) { if (g && !still.has(String(g.id))) { try { await redis(['DEL', mark(g.id)]); } catch (e) {} } }
      if (fresh.length) out.geo = await sendAll(fresh);
    }

    /* On the 1st the report closes the month that just ended, so in January it is last year's. */
    if (job === 'report' || (isCron && now.getUTCDate() === 1)) {
      const y = isCron && now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
      out.report = await sendAll(report.monthlyMessages(data, assign, y, url));
      out.report.year = y;
    }
    console.log('cron:', JSON.stringify(out));
    return res.status(200).json(out);
  } catch (e) {
    console.error('cron failed:', e.message);
    return res.status(500).json({ error: 'the job failed', detail: String(e.message || '').slice(0, 160) });
  }
};
