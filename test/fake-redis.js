'use strict';
/* In-memory stand-in for the Upstash REST API, so the Vercel functions can be
   exercised locally with no network. Speaks the same JSON command protocol. */
const http = require('http');

function makeStore() {
  return { kv: new Map(), hash: new Map(), lists: new Map(), calls: [] };
}

function run(store, cmd) {
  const op = String(cmd[0]).toUpperCase();
  const arg = i => cmd[i];
  const lc = i => String(cmd[i]).toLowerCase();
  store.calls.push(op);
  switch (op) {
    case 'GET': return store.kv.has(String(arg(1))) ? store.kv.get(String(arg(1))) : null;
    case 'SET': {
      store.kv.set(String(arg(1)), String(arg(2)));
      return 'OK';
    }
    case 'DEL': {
      let n = 0;
      for (let i = 1; i < cmd.length; i++) {
        const k = String(cmd[i]);
        if (store.kv.delete(k) || store.lists.delete(k) || store.hash.delete(k)) n++;
      }
      return n;
    }
    case 'INCR': {
      const k = String(arg(1));
      const v = (parseInt(store.kv.get(k) || '0', 10) || 0) + 1;
      store.kv.set(k, String(v));
      return v;
    }
    case 'MGET': return cmd.slice(1).map(k => (store.kv.has(String(k)) ? store.kv.get(String(k)) : null));
    case 'HGET': {
      const h = store.hash.get(String(arg(1)));
      if (!h) return null;
      const v = h.get(lc(2));
      return v === undefined ? null : v;
    }
    case 'HSET': {
      const k = String(arg(1));
      if (!store.hash.has(k)) store.hash.set(k, new Map());
      store.hash.get(k).set(lc(2), String(arg(3)));
      return 1;
    }
    case 'HGETALL': {
      const h = store.hash.get(String(arg(1)));
      if (!h) return [];
      const flat = [];
      h.forEach((v, k) => { flat.push(k, v); });
      return flat;
    }
    case 'HDEL': {
      const h = store.hash.get(String(arg(1)));
      return h ? (h.delete(lc(2)) ? 1 : 0) : 0;
    }
    case 'LPUSH': {
      const k = String(arg(1));
      if (!store.lists.has(k)) store.lists.set(k, []);
      cmd.slice(2).reverse().forEach(x => store.lists.get(k).unshift(String(x)));
      return store.lists.get(k).length;
    }
    case 'LTRIM': {
      const k = String(arg(1));
      const l = store.lists.get(k) || [];
      const start = parseInt(arg(2), 10), stop = parseInt(arg(3), 10);
      store.lists.set(k, l.slice(start, stop < 0 ? undefined : stop + 1));
      return 'OK';
    }
    case 'LRANGE': {
      const l = store.lists.get(String(arg(1))) || [];
      const start = parseInt(arg(2), 10), stop = parseInt(arg(3), 10);
      return l.slice(start, stop < 0 ? undefined : stop + 1);
    }
    case 'KEYS': {
      const pat = String(arg(1));
      const re = new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      return [...store.kv.keys(), ...store.lists.keys(), ...store.hash.keys()].filter(k => re.test(k));
    }
    default: throw new Error('fake redis: unsupported ' + op);
  }
}

function start({ fail = false } = {}) {
  const store = makeStore();
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      if (store.down) { res.writeHead(503); return res.end('{"error":"storage is down"}'); }
      let out;
      try { out = { result: run(store, JSON.parse(body || '[]')) }; }
      catch (e) { out = { error: e.message }; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const url = 'http://127.0.0.1:' + server.address().port;
      store.server = server;
      store.url = url;
      store.shutdown = () => new Promise(r => server.close(r));
      resolve(store);
    });
  });
}

module.exports = { start };
