'use strict';

/* Messages that leave the Hub: an approver is told that something is waiting, and the
 * monthly report goes out on the first of the month.
 *
 * Nothing is sent until a channel is configured in the Vercel environment:
 *
 *   TEAMS_WEBHOOK_URL   a Microsoft Teams "Workflows" webhook (posts a card in one channel)
 *   RESEND_API_KEY      an API key of resend.com  +  MAIL_FROM  ("Nerhadou Hub <hub@your-domain>")
 *   HUB_URL             the address of the site, used for the "Open the Hub" link
 *   NOTIFY_APPROVALS    set to "off" to stop the approval messages (the report still goes out)
 *
 * A channel that fails never breaks the request that triggered it: every send is
 * time-limited, and the outcome is returned as text instead of being thrown.
 */
const TIMEOUT_MS = 6000;

const env = n => String(process.env[n] || '').trim();
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function channels() {
  return { teams: !!env('TEAMS_WEBHOOK_URL'), email: !!(env('RESEND_API_KEY') && env('MAIL_FROM')) };
}
function configured() { const c = channels(); return c.teams || c.email; }
function approvalsOn() { return configured() && env('NOTIFY_APPROVALS').toLowerCase() !== 'off'; }
function hubUrl(req) {
  if (env('HUB_URL')) return env('HUB_URL').replace(/\/+$/, '');
  const h = req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host);
  return h ? 'https://' + h : '';
}

async function post(url, headers, body) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify(body), signal: ctl.signal });
    return r.ok ? 'sent' : 'error: http ' + r.status;
  } catch (e) {
    return 'error: ' + String((e && e.message) || e).slice(0, 80);
  } finally { clearTimeout(t); }
}

function teamsCard(title, lines, url) {
  const body = [{ type: 'TextBlock', text: title, weight: 'Bolder', size: 'Medium', wrap: true }]
    .concat(lines.map(t => ({ type: 'TextBlock', text: String(t), wrap: true, spacing: 'Small' })));
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: { $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4', body, actions: url ? [{ type: 'Action.OpenUrl', title: 'Open the Hub', url }] : [] }
    }]
  };
}

function mailHtml(title, lines, url, table) {
  return '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#0f172a;max-width:680px">' +
    '<h2 style="font-size:18px;margin:0 0 12px;color:#1f4e9c">' + esc(title) + '</h2>' +
    lines.map(l => '<p style="margin:0 0 8px">' + esc(l) + '</p>').join('') + (table || '') +
    (url ? '<p style="margin:18px 0 0"><a href="' + esc(url) + '" style="background:#1f4e9c;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block">Open the Hub</a></p>' : '') +
    '<p style="margin:18px 0 0;font-size:12px;color:#64748b">Sent automatically by the Nerhadou Marketing Hub.</p></div>';
}

/* msg: { to:[emails], title, lines:[text], url, table (html, email only), teamsLines (optional, replaces lines in Teams) } */
async function send(msg) {
  const out = { teams: 'off', email: 'off' };
  const c = channels();
  const to = [...new Set((msg.to || []).map(x => String(x || '').trim().toLowerCase()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))];
  const jobs = [];
  if (c.teams) {
    const who = to.length ? ['For: ' + to.join(', ')] : [];
    jobs.push(post(env('TEAMS_WEBHOOK_URL'), {}, teamsCard(msg.title, who.concat(msg.teamsLines || msg.lines || []), msg.url)).then(r => { out.teams = r; }));
  }
  if (c.email) {
    if (!to.length) out.email = 'no recipient';
    else jobs.push(post('https://api.resend.com/emails', { Authorization: 'Bearer ' + env('RESEND_API_KEY') },
      { from: env('MAIL_FROM'), to, subject: msg.title, html: mailHtml(msg.title, msg.lines || [], msg.url, msg.table) }).then(r => { out.email = r; }));
  }
  await Promise.all(jobs);
  return out;
}

module.exports = { send, channels, configured, approvalsOn, hubUrl, esc };
