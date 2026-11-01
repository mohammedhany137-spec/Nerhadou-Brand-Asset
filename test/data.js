'use strict';
/* Who may write what, and who owns the money lines. Run: node test/data.js */
const { start } = require('./fake-redis');
const path = require('path');

let pass = 0, failn = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { failn++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};

const FILES = ['../api/login.js', '../api/password.js', '../api/data.js', '../lib/core.js', '../lib/team.js', '../lib/scope.js', '../lib/split.js'];
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
  return fn({ method, query: {}, url: '/', headers: Object.assign({ 'content-type': 'application/json' }, headers), body: body === undefined ? undefined : JSON.stringify(body) }, r).then(() => r);
};
const loginWith = (A, email, password) => hit(A.login, { body: { email, password } });
const get = (A, tok) => hit(A.data, { method: 'GET', headers: hdr(tok) });
const put = (A, tok, key, value, extra) => hit(A.data, { method: 'PUT', headers: hdr(tok), body: Object.assign({ key, value }, extra || {}) });
const hdr = tok => ({ authorization: 'Bearer ' + tok });
const stored = (store, key) => { try { return JSON.parse(store.kv.get('assetlib:' + key) || '[]'); } catch (e) { return []; } };
const sum = rows => rows.reduce((a, r) => a + (+r.amount || 0), 0);
const CONF_KEY = 'conferences';

let store, A, admin, feby, rasha, r;

(async () => {
  store = await start();
  process.env.SESSION_SECRET = 'test-secret';
  process.env.UPSTASH_REDIS_REST_URL = store.url;
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  process.env.ADMIN_EMAIL_1 = 'mohamed.hany@nerhadou.com';
  process.env.ADMIN_PASSWORD_1 = 'Nerhadou#Hub2026';
  A = freshApi();

  /* the products and the Conference Shares table, as the admin's page stores them */
  store.kv.set('assetlib:portfolio', JSON.stringify([
    { id: 1, brand: 'Vitatron' }, { id: 2, brand: 'Chromitron' }, { id: 3, brand: 'Octatron' }, { id: 4, brand: 'Methyltechno (Private)' }
  ]));
  store.kv.set('assetlib:specshare', JSON.stringify([
    { id: 10, spec: 'Diabetes', prod: 'Vitatron', pct: 7.5 },
    { id: 11, spec: 'Diabetes', prod: 'Octatron', pct: 60 },
    { id: 12, spec: 'Diabetes', prod: 'Chromitron', pct: 32.5 }
  ]));

  admin = (await loginWith(A, 'mohamed.hany@nerhadou.com', 'Nerhadou#Hub2026')).body.token;
  let pw = await hit(A.password, { headers: hdr(admin), body: { current: 'Nerhadou#Hub2026', next: 'Admin#Own1' } });
  admin = pw.body.token || admin;
  feby = (await loginWith(A, 'feby_abdallah@nerhadou.com', '123456')).body.token;
  rasha = (await loginWith(A, 'rasha.samy@nerhadou.com', '123456')).body.token;

  console.log('\n[1] a conference entered by a PM is split by the server, not by his browser');
  const conf = { id: 500, name: 'Diabetes Congress', spec: 'Diabetes', date: '2026-11-05', c26: 100000, status: 'Waiting for Admin Approval', att: 0 };
  r = await put(A, feby, 'conferences', [conf], { known: true });
  ok('the PM saves his conference', r.statusCode === 200, r.body);
  const auto = stored(store, 'expenses').filter(x => x.auto && x.ck === 'conferences');
  ok('one generated line per product in the shares table', auto.length === 3, auto);
  ok('the whole amount is recorded, not only his share', sum(auto) === 100000, sum(auto));
  ok('his own product keeps its 7.5%', (auto.find(x => x.brand === 'Vitatron') || {}).amount === 7500, auto);
  ok('Octatron is charged its 60% without Rasha doing anything', (auto.find(x => x.brand === 'Octatron') || {}).amount === 60000, auto);
  ok('the line points at its source', auto.every(x => String(x.conf) === '500'), auto);
  ok('and says where the money came from', /7\.5% allocation/.test((auto.find(x => x.brand === 'Vitatron') || {}).desc || ''), (auto[0] || {}).desc);

  console.log('\n[2] each PM only sees his own part');
  r = await get(A, feby);
  const febyEx = (r.body.data.expenses || []).filter(x => x.auto);
  ok('Feby sees the Vitatron and Chromitron lines', febyEx.length === 2, febyEx);
  r = await get(A, rasha);
  const rashaEx = (r.body.data.expenses || []).filter(x => x.auto);
  ok('Rasha sees the Octatron line', rashaEx.length === 1 && rashaEx[0].amount === 60000, rashaEx);

  console.log('\n[3] a generated line cannot be posted from the browser');
  r = await put(A, feby, 'expenses', [
    { id: 900, brand: 'Vitatron', cat: 'Gimmicks', name: 'My own gimmick', amount: 1000, date: '2026-11-01', status: 'Waiting for Admin Approval' },
    { id: 901, brand: 'Octatron', cat: 'Conferences', name: 'Fake split', amount: 999999, auto: 1, ck: 'conferences', conf: 500, status: 'Approved' }
  ], { known: true });
  ok('the PM saves his own expense', r.statusCode === 200, r.body);
  ok('the invented AUTO line is not stored', !stored(store, 'expenses').some(x => x.id === 901), stored(store, 'expenses').filter(x => x.auto).length);
  ok('the real split of the conference is untouched', sum(stored(store, 'expenses').filter(x => x.auto && x.ck === 'conferences')) === 100000, null);
  ok('the PM is told what is really stored', r.body.value !== undefined && !r.body.value.some(x => x.id === 901), r.body.value && r.body.value.length);

  console.log('\n[4] the admin saves the whole table and loses nothing');
  const before = stored(store, 'conferences').length;
  r = await put(A, admin, 'conferences', [{ id: 501, name: 'Cardiology Congress', spec: 'Cardiology', date: '2026-12-01', c26: 0, status: 'Approved' }], { known: true });
  ok('his one-row save does not erase Feby’s conference', stored(store, 'conferences').length === before + 1, stored(store, 'conferences').map(x => x.id));
  ok('Feby’s row is exactly as it was', (stored(store, 'conferences').find(x => x.id === 500) || {}).c26 === 100000, null);

  console.log('\n[5] deletion is explicit');
  r = await put(A, admin, 'expenses', []);
  ok('a page that never loaded the table cannot empty it', r.statusCode === 409, r.body);
  r = await put(A, admin, 'conferences', [{ id: 501 }, { id: 500 }], { known: true, deleted: ['500'] });
  ok('the admin deletes the conference by id', stored(store, 'conferences').length === 1 && !stored(store, 'conferences').some(x => x.id === 500), stored(store, 'conferences').map(x => x.id));
  ok('and every generated line goes with it', stored(store, 'expenses').filter(x => x.auto && String(x.conf) === '500').length === 0, stored(store, 'expenses').filter(x => x.auto));
  ok('but the PM’s own gimmick survives', stored(store, 'expenses').some(x => x.id === 900), null);

  console.log('\n[6] a shared gimmick splits on the server');
  r = await put(A, feby, 'expenses', [
    { id: 900, brand: 'Vitatron', cat: 'Gimmicks', name: 'My own gimmick', amount: 1000, date: '2026-11-01', status: 'Waiting for Admin Approval' },
    { id: 902, brand: 'Vitatron', cat: 'Gimmicks', name: 'Booth with Chromitron', gross: 4000, amount: 3000, shareWith: 'Chromitron', sharePct: 25, date: '2026-11-02', status: 'Waiting for Admin Approval' }
  ], { known: true });
  const share = stored(store, 'expenses').find(x => x.auto && x.ck === 'share' && String(x.conf) === '902');
  ok('the other product gets its 25%', share && share.amount === 1000 && share.brand === 'Chromitron', share);
  r = await put(A, feby, 'expenses', [
    { id: 900, brand: 'Vitatron', cat: 'Gimmicks', name: 'My own gimmick', amount: 1000, date: '2026-11-01', status: 'Waiting for Admin Approval' }
  ], { known: true, deleted: ['902'] });
  ok('deleting the source deletes its share line', !stored(store, 'expenses').some(x => x.auto && x.ck === 'share' && String(x.conf) === '902'), null);

  console.log('\n[7] changing the shares table re-splits what is already stored');
  const conf600 = { id: 600, name: 'Diabetes Meet', spec: 'Diabetes', date: '2026-11-20', c26: 50000, status: 'Approved' };
  r = await put(A, admin, 'conferences', [conf600], { known: true });
  ok('the admin records a second conference', r.statusCode === 200, r.body);
  const first = stored(store, 'expenses').filter(x => x.auto && x.ck === 'conferences' && String(x.conf) === '600');
  ok('the first split follows the 7.5 / 60 / 32.5 table', sum(first) === 50000 && (first.find(x => x.brand === 'Vitatron') || {}).amount === 3750, first);
  const newShares = [
    { id: 10, spec: 'Diabetes', prod: 'Vitatron', pct: 50 },
    { id: 11, spec: 'Diabetes', prod: 'Octatron', pct: 30 },
    { id: 12, spec: 'Diabetes', prod: 'Chromitron', pct: 20 }
  ];
  r = await put(A, admin, 'specshare', newShares, { known: true });
  ok('the admin saves the percentages', r.statusCode === 200, r.body);
  const again = stored(store, 'expenses').filter(x => x.auto && x.ck === 'conferences' && String(x.conf) === '600');
  ok('the stored conference re-split without touching its row', sum(again) === 50000 && (again.find(x => x.brand === 'Vitatron') || {}).amount === 25000, again);
  ok('and the other rows of the ledger were not lost', stored(store, 'expenses').some(x => x.id === 900), null);

  console.log('\n[8] the approval rule still works');
  r = await put(A, feby, 'budget', [{ id: 700, brand: 'Vitatron', month: '2026-11', amount: 5000, status: 'Approved' }], { known: true });
  ok('a PM cannot approve his own row', r.body.value && r.body.value[0].status === 'Waiting for Admin Approval', r.body);
  r = await get(A, admin);
  ok('and the admin sees it waiting', (r.body.data.budget || []).some(x => x.id === 700 && x.status === 'Waiting for Admin Approval'), null);

  console.log('\n[9] the write gates');
  r = await put(A, feby, 'specshare', [], { known: true });
  ok('a PM cannot write the shares table', r.statusCode === 403, r.body);
  r = await put(A, feby, 'portfolio', [], { known: true });
  ok('a PM cannot write the product list', r.statusCode === 403, r.body);
  r = await put(A, feby, 'nonsense', [], { known: true });
  ok('an unknown key is refused', r.statusCode === 400, r.body);
  r = await put(A, feby, 'expenses', { not: 'an array' }, { known: true });
  ok('a wrong shape is refused', r.statusCode === 400, r.body);
  store.down = true;
  r = await put(A, feby, 'expenses', [], { known: true });
  ok('when the store is down the save fails instead of pretending', r.statusCode === 500, r.body);
  store.down = false;

  console.log('\n[10] the doctor lists live in their own key');
  const names = [], amounts = [];
  for (let i = 1; i <= 100; i++) { names.push('Dr. Mahmoud Abdelrahman Shalaby Al-Ahrami ' + i); amounts.push(1000); }
  const conf800 = {
    id: 800, name: 'Big Diabetes Meeting', spec: 'Diabetes', date: '2026-11-25', c26: 100000, i_reg: 100000,
    registeredDoctors: names, registeredDoctorsAmt: amounts, accommodationDoctors: ['Dr Solo'], accommodationDoctorsAmt: [2500],
    status: 'Approved'
  };
  r = await put(A, admin, CONF_KEY, stored(store, 'conferences').concat([conf800]), { known: true });
  ok('a hundred doctors save', r.statusCode === 200, r.body);
  const docKey = () => JSON.parse(store.kv.get('assetlib:docs') || '{}');
  ok('they are stored in assetlib:docs', docKey()['800'].registeredDoctors.length === 100, null);
  ok('and not inside the conference row', !stored(store, 'conferences').some(x => x.registeredDoctors !== undefined), null);
  ok('the conferences table stays far below the value limit', JSON.stringify(stored(store, 'conferences')).length < 20000, JSON.stringify(stored(store, 'conferences')).length);
  ok('the doctor key is bigger than the table it came from', docKey()['800'].registeredDoctors.join(',').length > JSON.stringify(stored(store, 'conferences')).length / 4, null);
  r = await get(A, feby);
  const back = (r.body.data[CONF_KEY] || []).find(x => x.id === 800) || {};
  ok('the page gets them back on the row', back.registeredDoctors && back.registeredDoctors.length === 100 && back.accommodationDoctors[0] === 'Dr Solo', null);
  ok('with the amounts', (back.registeredDoctorsAmt || []).length === 100 && back.registeredDoctorsAmt[0] === 1000, null);
  const table = (await get(A, admin)).body.data[CONF_KEY];
  r = await put(A, admin, CONF_KEY, table, { known: true });
  ok('an unchanged save is not echoed back', r.statusCode === 200 && r.body.value === undefined, r.body);
  r = await put(A, admin, CONF_KEY, table.map(x => Object.assign({}, x, x.id === 800 ? { place: 'Cairo' } : {})), { known: true });
  ok('editing another field keeps the list', docKey()['800'].registeredDoctors.length === 100, null);
  r = await put(A, admin, CONF_KEY, table.map(x => Object.assign({}, x, x.id === 800 ? { registeredDoctors: [], registeredDoctorsAmt: [], accommodationDoctors: [], accommodationDoctorsAmt: [] } : {})), { known: true });
  ok('sending empty lists clears them', !docKey()['800'], null);
  const cleared = (await get(A, admin)).body.data[CONF_KEY].find(x => x.id === 800);
  ok('and the page sees them gone', !cleared.registeredDoctors || !cleared.registeredDoctors.length, cleared.registeredDoctors);
  r = await put(A, admin, CONF_KEY, table.filter(x => x.id !== 800), { known: true, deleted: ['800'] });
  ok('deleting the conference deletes its list', !docKey()['800'], r.body);
  r = await put(A, feby, CONF_KEY, (await get(A, feby)).body.data[CONF_KEY], { known: true });
  ok('a PM cannot write the lists of a conference he did not send', !docKey()['600'], null);

  console.log('\n' + pass + ' passed, ' + failn + ' failed');
  await store.shutdown();
  process.exit(failn ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
