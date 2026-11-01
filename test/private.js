'use strict';
/* The licensed figures and the roster are no longer public files.
   Run: node test/private.js */
const { start } = require('./fake-redis');
const path = require('path');

let pass = 0, failn = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { failn++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};

const FILES = ['../api/login.js', '../api/password.js', '../api/iqvia.js', '../api/shield.js', '../api/backup.js', '../lib/core.js', '../lib/team.js', '../lib/backup.js'];
function freshApi() {
  FILES.forEach(p => { delete require.cache[require.resolve(path.join(__dirname, p))]; });
  return {
    login: require(path.join(__dirname, '../api/login.js')),
    password: require(path.join(__dirname, '../api/password.js')),
    iqvia: require(path.join(__dirname, '../api/iqvia.js')),
    shield: require(path.join(__dirname, '../api/shield.js')),
    backup: require(path.join(__dirname, '../api/backup.js'))
  };
}
function res() {
  const r = {
    statusCode: 200, body: undefined, headers: {},
    status(c) { r.statusCode = c; return r; },
    setHeader(k, v) { r.headers[k] = v; return r; },
    json(o) { r.body = o; return r; },
    send(o) { r.body = o; return r; },
    end(x) { if (x !== undefined) r.body = x; return r; }
  };
  return r;
}
const hit = (fn, o) => {
  const r = res();
  return fn({
    method: o.method || 'GET', query: o.query || {}, url: o.url || '/',
    headers: Object.assign({ 'content-type': 'application/json' }, o.headers || {}),
    body: o.body === undefined ? undefined : JSON.stringify(o.body)
  }, r).then(() => r);
};
const bearer = t => ({ authorization: 'Bearer ' + t });
const signIn = (fn, email, password) => hit(fn, { method: 'POST', body: { email, password } });

let store, A, r;

(async () => {
  store = await start();
  process.env.SESSION_SECRET = 'test-secret';
  process.env.UPSTASH_REDIS_REST_URL = store.url;
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  process.env.ADMIN_EMAIL_1 = 'mohamed.hany@nerhadou.com';
  process.env.ADMIN_PASSWORD_1 = 'Nerhadou#Hub2026';
  A = freshApi();

  console.log('\n[1] the IQVIA figures need a signed-in member of the team');
  r = await hit(A.iqvia, { query: { set: 'market' } });
  ok('no session, no figures', r.statusCode === 401, r.body);
  r = await hit(A.iqvia, { query: { set: 'market' }, headers: bearer('made.up.token') });
  ok('a forged token does not work either', r.statusCode === 401, r.body);
  const pm = (await signIn(A.login, 'feby_abdallah@nerhadou.com', '123456')).body.token;
  r = await hit(A.iqvia, { query: { set: 'market' }, headers: bearer(pm) });
  ok('a product manager gets the market table', r.statusCode === 200 && !!(r.body && r.body.atc), r.statusCode);
  r = await hit(A.iqvia, { query: { set: 'products' }, headers: bearer(pm) });
  ok('and the product detail', r.statusCode === 200 && !!(r.body && r.body.atc), r.statusCode);
  r = await hit(A.iqvia, { query: { set: '../../etc/passwd' }, headers: bearer(pm) });
  ok('only the two known files can be asked for', r.statusCode === 400, r.body);
  r = await hit(A.iqvia, { headers: bearer(pm) });
  ok('with no name at all it refuses', r.statusCode === 400, r.body);

  console.log('\n[2] an admin still on his first password gets nothing');
  const adminFirst = (await signIn(A.login, 'mohamed.hany@nerhadou.com', 'Nerhadou#Hub2026')).body.token;
  r = await hit(A.iqvia, { query: { set: 'market' }, headers: bearer(adminFirst) });
  ok('the licensed data waits for the password change', r.statusCode === 403 && r.body.error === 'password_change_required', r.body);

  console.log('\n[3] the folder shield');
  r = await hit(A.shield, { url: '/api/shield' });
  ok('anything rewritten here answers 404', r.statusCode === 404, r.body);
  const cfg = require(path.join(__dirname, '..', 'vercel.json'));
  const src = (cfg.rewrites || []).map(x => x.source);
  ok('vercel.json shadows /data/*', src.indexOf('/data/:path*') >= 0, src);
  ok('and /lib/*', src.indexOf('/lib/:path*') >= 0, src);
  const dest = cfg.rewrites.map(x => x.destination);
  ok('both go to the shield function', dest.every(d => d === '/api/shield'), dest);
  const html = require('fs').readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  ok('the page no longer fetches anything from /data', !/["']\/data\//.test(html), null);
  ok('and never loads a file from /lib', !/["'\(]\/lib\//.test(html), null);

  console.log('\n[4] the backup');
  store.kv.set('assetlib:portfolio', JSON.stringify([{ id: 1, brand: 'Vitatron' }]));
  store.kv.set('assetlib:specshare', JSON.stringify([{ id: 10, spec: 'Diabetes', prod: 'Vitatron', pct: 100 }]));
  store.kv.set('assetlib:docs', JSON.stringify({ 800: { registeredDoctors: ['Dr Farid'], registeredDoctorsAmt: [5000] } }));
  store.kv.set('assetlib:assign', JSON.stringify({ 'Vitatron': 'someone@nerhadou.com' }));
  r = await hit(A.backup, { headers: bearer(pm) });
  ok('a product manager cannot download the whole database', r.statusCode === 403, r.body);
  const first = (await signIn(A.login, 'mohamed.hany@nerhadou.com', 'Nerhadou#Hub2026')).body.token;
  const changed = await hit(A.password, { method: 'POST', headers: bearer(first), body: { current: 'Nerhadou#Hub2026', next: 'Director#Own1' } });
  const boss = changed.body.token;
  r = await hit(A.backup, { headers: bearer(boss) });
  const snap = typeof r.body === 'string' ? JSON.parse(r.body) : r.body;
  ok('the Director gets a snapshot', r.statusCode === 200 && !!snap && !!snap.portfolio, r.statusCode);
  ok('the browser is told to save it as a file', /attachment; filename="nerhadou_backup_\d{4}-\d{2}-\d{2}\.json"/.test(r.headers['Content-Disposition'] || ''), r.headers);
  ok('it holds the tables that are stored', !!snap.portfolio && !!snap.specshare, Object.keys(snap || {}));
  ok('the doctor lists are in it', !!(snap.docs && snap.docs['800']), Object.keys(snap || {}));
  ok('and the brand assignments', !!(snap.assign && snap.assign.Vitatron), null);
  ok('but not the password hashes', !snap.$passwords, null);

  console.log('\n[5] the nightly copy');
  r = await hit(A.backup, { method: 'POST' });
  ok('a call with no key at all is refused', r.statusCode === 401, r.body);
  process.env.CRON_SECRET = 'cron-test-secret';
  r = await hit(A.backup, { method: 'POST', headers: { authorization: 'Bearer guess-me' } });
  ok('a wrong cron secret is refused', r.statusCode === 401, r.body);
  r = await hit(A.backup, { method: 'POST', headers: { authorization: 'Bearer cron-test-secret' } });
  ok('the right one reaches the storage step', r.statusCode === 500 && r.body.error === 'backup failed', r.body);
  const vault = require(path.join(__dirname, '../lib/backup.js'));
  const sealed = vault.encrypt(JSON.stringify(snap));
  ok('the copy is not readable plain text', sealed.indexOf(Buffer.from('mohamed.hany@nerhadou.com')) < 0, null);
  ok('and opens again with the same secret', JSON.parse(vault.decrypt(sealed)).docs['800'].registeredDoctors[0] === 'Dr Farid', null);
  process.env.SESSION_SECRET = 'another-secret';
  let opened = '';
  try { opened = vault.decrypt(sealed); } catch (e) { opened = ''; }
  ok('a copy sealed with an old secret does not open', opened === '', null);
  process.env.SESSION_SECRET = 'test-secret';

  console.log('\n' + pass + ' passed, ' + failn + ' failed');
  await store.shutdown();
  process.exit(failn ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
