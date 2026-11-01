'use strict';
/* Runs the Vercel functions locally: mock req/res with the same helpers Vercel
   provides (status/json/send/end), plus a fake Upstash endpoint in env. */
const path = require('path');

const API = p => require(path.join(__dirname, '..', 'api', p));

function makeRes() {
  const res = {
    statusCode: 200, body: undefined, headers: {}, ended: false,
    status(c) { res.statusCode = c; return res; },
    setHeader(k, v) { res.headers[k] = v; return res; },
    json(o) { res.body = o; return res; },
    send(o) { res.body = o; return res; },
    end(x) { if (x !== undefined) res.body = x; res.ended = true; return res; }
  };
  return res;
}

function call(file, { method = 'GET', body, query = {}, headers = {}, url = '/' } = {}) {
  const req = {
    method, headers: Object.assign({ 'content-type': 'application/json' }, headers), query,
    body: body === undefined ? undefined : (typeof body === 'string' ? body : body),
    url
  };
  const res = makeRes();
  return API(file)(req, res).then(() => res);
}

function api(name) { return API(name + '.js'); }

module.exports = { call, api };
