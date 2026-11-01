'use strict';
/* Sign-in and password rules. Run: node test/auth.js */
const { start } = require('./fake-redis');
const path = require('path');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};

const FILES = ['../api/login.js', '../api/password.js', '../api/data.js', '../lib/core.js', '../lib/team.js', '../lib/scope.js'];
function freshApi() {
  FILES.forEach(p => { delete require.cache[require.resolve(path.join(__dirname, p))]; });
  return {
    login: require(path.join(__dirname, '../api/login.js')),
    password: require(path.join(__dirname, '../api/password.js')),
    data: require(path.join(__dirname, '../api/data.js'))
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
const hit = (fn, { method = 'POST', body, headers = {} }) => {
  const r = res();
  return fn({
    method, query: {}, url: '/',
    headers: Object.assign({ 'content-type': 'application/json' }, headers),
    body: body === undefined ? undefined : JSON.stringify(body)
  }, r).then(() => r);
};

const loginWith = (fn, email, password) => hit(fn, { body: { email, password } });
const getData = (fn, tok) => hit(fn, { method: 'GET', headers: { authorization: 'Bearer ' + tok } });
const putData = (fn, tok, body) => hit(fn, { headers: { authorization: 'Bearer ' + tok }, body });
const changePw = (fn, tok, current, next) => hit(fn, { headers: { authorization: 'Bearer ' + tok }, body: { current, next } });

let store;

(async () => {
  store = await start();
  process.env.SESSION_SECRET = 'test-secret';
  process.env.UPSTASH_REDIS_REST_URL = store.url;
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  process.env.ADMIN_EMAIL_1 = 'mohamed.hany@nerhadou.com';
  process.env.ADMIN_PASSWORD_1 = 'Nerhadou#Hub2026';
  process.env.ADMIN_EMAIL_2 = 'second.admin@nerhadou.com';
  process.env.ADMIN_PASSWORD_2 = 'Second#Admin99';
  process.env.ADMIN_EMAIL_3 = 'third.admin@nerhadou.com';
  process.env.ADMIN_EMAILS = '';
  process.env.ADMIN_EMAIL = '';

  let A = freshApi();

  console.log('\n[1] the five admin slots');
  let r = await loginWith(A.login, 'mohamed.hany@nerhadou.com', 'Nerhadou#Hub2026');
  ok('ADMIN_PASSWORD_1 signs the first admin in', r.statusCode === 200, r.body);
  ok('the session asks for a new password', r.body && r.body.user && r.body.user.forceChange === true, r.body && r.body.user);
  r = await loginWith(A.login, 'second.admin@nerhadou.com', 'Nerhadou#Hub2026');
  ok('an admin cannot use another slot password', r.statusCode === 401, r.body);
  r = await loginWith(A.login, 'second.admin@nerhadou.com', 'Second#Admin99');
  ok('ADMIN_PASSWORD_2 signs the second admin in', r.statusCode === 200, r.body);
  r = await loginWith(A.login, 'third.admin@nerhadou.com', '123456');
  ok('a slot without a password falls back to the first password', r.statusCode === 200, r.body);
  r = await loginWith(A.login, 'feby_abdallah@nerhadou.com', '123456');
  ok('a PM still signs in with the shared first password', r.statusCode === 200, r.body);
  ok('a PM is not forced to change it', r.body.user.forceChange === false && r.body.user.mustChange === true, r.body.user);
  ok('the PM only gets his own products', (r.body.user.brands || []).join() === 'Vitatron,Chromitron', r.body.user.brands);

  console.log('\n[2] data stays closed until the admin sets his own password');
  const adminToken = (await loginWith(A.login, 'mohamed.hany@nerhadou.com', 'Nerhadou#Hub2026')).body.token;
  r = await getData(A.data, adminToken);
  ok('GET /api/data -> 403 password_change_required', r.statusCode === 403 && r.body.error === 'password_change_required', r.body);

  console.log('\n[3] the password policy');
  r = await changePw(A.password, adminToken, 'Nerhadou#Hub2026', 'abc1234');
  ok('7 characters is refused', r.statusCode === 400 && /8 characters/.test(r.body.error), r.body);
  r = await changePw(A.password, adminToken, 'Nerhadou#Hub2026', '12345678');
  ok('a digits-only password is refused', r.statusCode === 400, r.body);
  r = await changePw(A.password, adminToken, 'Nerhadou#Hub2026', 'Nerhadou#Hub2026');
  ok('the same password is refused', r.statusCode === 400, r.body);
  r = await changePw(A.password, adminToken, 'wrong-current', 'BrandNew#Pass1');
  ok('a wrong current password is refused', r.statusCode === 403, r.body);
  r = await changePw(A.password, adminToken, 'Nerhadou#Hub2026', 'BrandNew#Pass1');
  ok('a proper new password is accepted', r.statusCode === 200 && r.body.ok, r.body);
  ok('a fresh token comes back', !!r.body.token);
  const newToken = r.body.token;
  r = await getData(A.data, newToken);
  ok('the admin now reaches his data', r.statusCode === 200 && !!r.body.data, r.body && r.body.error);
  r = await getData(A.data, adminToken);
  ok('the old first-password token no longer opens data', r.statusCode === 403, r.statusCode);
  r = await changePw(A.password, newToken, 'BrandNew#Pass1', 'Nerhadou#Hub2026');
  ok('going back to the slot password is refused', r.statusCode === 400, r.body);

  console.log('\n[4] five wrong attempts lock the address');
  A = freshApi();
  store.kv.clear(); store.hash.clear(); store.lists.clear();
  const pm = 'feby_abdallah@nerhadou.com';
  for (let i = 0; i < 5; i++) r = await loginWith(A.login, pm, 'nope' + i);
  ok('the 5th wrong attempt locks', r.statusCode === 429, r.body);
  r = await loginWith(A.login, pm, '123456');
  ok('even the right password is refused while locked', r.statusCode === 429 && r.body.retryAfter > 0, r.body);
  store.kv.delete('assetlib:lock:' + pm);
  r = await loginWith(A.login, pm, '123456');
  ok('clearing the counter unlocks it', r.statusCode === 200, r.body);
  r = await loginWith(A.login, pm, 'wrong-one');
  ok('one wrong attempt reports 4 attempts left', r.statusCode === 401 && r.body.attemptsLeft === 4, r.body);

  console.log('\n[5] when Redis cannot be read, nobody signs in');
  store.down = true;
  r = await loginWith(A.login, pm, '123456');
  ok('a first-password user is refused (503)', r.statusCode === 503, r.body);
  store.down = false;
  const tok = (await loginWith(A.login, pm, '123456')).body.token;
  await changePw(A.password, tok, '123456', 'FebyPrivate#7');
  store.down = true;
  r = await loginWith(A.login, pm, 'FebyPrivate#7');
  ok('a user who changed his password is refused too (no 123456 fallback)', r.statusCode === 503, r.body);
  store.down = false;
  r = await loginWith(A.login, pm, 'FebyPrivate#7');
  ok('and signs in normally once the store is back', r.statusCode === 200, r.body);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await store.shutdown();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
