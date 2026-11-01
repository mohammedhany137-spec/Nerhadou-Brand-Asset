'use strict';
/* The page paints its tables with template strings, so every value that a product manager
   can type has to be escaped where it is written into HTML. This suite runs the four helpers
   with the payloads the reviewer asked about, then reads index.html and vercel.json to check
   that the helpers are actually used at the sinks.
   Run: node test/xss.js */
const fs = require('fs');
const path = require('path');

const PAGE = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
let pass = 0, failn = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { failn++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};
const at = re => { const m = PAGE.match(re); return m ? m[0] : ''; };
const uses = (needle, name) => ok(name, PAGE.indexOf(needle) >= 0, needle);

/* ---- [1] the helpers themselves, taken from the page ---- */
console.log('[1] escaping helpers');
const defs = ['ESC', 'ATTR', 'HREF', 'xg'].map(n => {
  const line = PAGE.split('\n').find(l => l.startsWith('var ' + n + '='));
  if (!line) throw new Error(n + ' is not defined at the top of the page');
  return line.replace(/^var /, 'let ');
});
const box = new Function(defs.join('\n') + '\nreturn {ESC,ATTR,HREF,xg};')();
const { ESC, ATTR, HREF, xg } = box;

const HTMLY = '<img src=x onerror=alert(1)>';
ok('ESC hides a tag', !ESC(HTMLY).includes('<') && ESC(HTMLY).includes('&lt;img'), ESC(HTMLY));
ok('ESC hides a quote in a value', !ESC('a"b').includes('"'), ESC('a"b'));
ok('ESC hides a single quote', ESC("d'or").includes('&#39;'), ESC("d'or"));

/* The attack the reviewer described: a file titled  x');alert(1);//  reaches
   onclick="edit('files','x');alert(1);//',1)". HTML escaping alone is not enough,
   because the browser decodes the entities before it compiles the handler. */
const PAYLOAD = "x');alert(1);//";
const handler = 'onclick="edit(\'' + ATTR(PAYLOAD) + '\',1)"';
ok('ATTR keeps the handler one call', (handler.match(/'\)/g) || []).length === 1, handler);
ok('ATTR keeps the letters', ATTR(PAYLOAD).includes("x\\'") && ATTR(PAYLOAD).includes('alert(1);//'), ATTR(PAYLOAD));
ok('ATTR cannot leave a bare quote', !/'/.test(ATTR(PAYLOAD).replace(/\\'/g, '')), ATTR(PAYLOAD));
ok('ATTR doubles a backslash', ATTR('a\\b') === 'a\\\\b', ATTR('a\\b'));

ok('HREF keeps a drive link', HREF('https://drive.google.com/file/d/1/view').includes('https://drive'));
ok('HREF keeps a site path', HREF('/api/backup').includes('/api/backup'));
ok('HREF kills javascript:', HREF('javascript:alert(1)') === '#', HREF('javascript:alert(1)'));
ok('HREF kills a spaced JAVASCRIPT:', HREF('  JaVaScRiPt:alert(1)') === '#');
ok('HREF kills data:text/html', HREF('data:text/html,<script>alert(1)</script>') === '#');
ok('HREF kills a quote break out', !/"/.test(HREF('a" onmouseover="alert(1)')), HREF('a" onmouseover="alert(1)'));

ok('xg neuters a formula title', xg('=HYPERLINK("http://evil","click")').charCodeAt(0) === 0x200B, xg('=1+1'));
ok('xg neuters + - @', [xg('+1'), xg('-1'), xg('@SUM(A1)')].every(v => v.charCodeAt(0) === 0x200B));
ok('xg leaves a number alone', xg(1234) === 1234);
ok('xg leaves plain text alone', xg('Leaflet v2') === 'Leaflet v2');

/* ---- [2] the ten file sections ---- */
console.log('[2] the file sections');
const cols = at(/c:\[\['Date',r=>ESC\(r\.date\)[^\n]*'Remarks'[^\n]*\]\]/);
['Date', 'Brand', 'Title', 'Type', 'Version', 'Product Manager', 'Remarks'].forEach(f =>
  ok('the ' + f + ' column is escaped', new RegExp("\\['" + f + "',r=>(?:`<b>\\$\\{)?ESC\\(").test(cols), cols.slice(0, 120)));
uses('const fcol=r=>r.link?`<a href="${HREF(r.link)}"', 'the file link goes through HREF');
uses('${ESC(r.fname||\'Open file\')}', 'the file name is escaped');
ok('no raw href from a stored link', !/href="\$\{r\.link\}"/.test(PAGE) && !/href="\$\{ESC\(r\.link\)\}"/.test(PAGE));

/* ---- [3] the other places a name is painted ---- */
console.log('[3] the rest of the page');
uses('<h3 class="font-bold">${ESC(title)}</h3>', 'the dialog title is escaped');
uses('value="${ESC(f.q)}"', 'the table search box is escaped');
uses('value="${ESC(r.notes||\'\')}"', 'the approver notes box is escaped');
['ESC(e.u)', 'ESC(e.a)', 'ESC(e.l', 'ESC(e.b'].forEach(s => uses(s, 'the audit log cell ' + s + ' is escaped'));
uses('<b>${ESC(lab(r))}</b>', 'the approvals list label is escaped');
uses('${ESC(r.notes)}</div>', 'the approvals note is escaped');
uses('${ESC(lab(r))} · status timeline', 'the status timeline title is escaped');
uses('<b>${ESC(e.a)}</b> <span class="text-slate-500">${ESC(e.u)}', 'the history entry is escaped');
uses('${ESC(x[1])}</b> <span class="text-slate-500">${ESC(x[2])}', 'the global search result is escaped');
uses('onclick="bf=\'${ATTR(p.brand)}\';go(', 'the dashboard cell handler quotes the brand with ATTR');
uses('${ESC(p.brand)}</td>${SEC.map', 'the coverage table escapes the brand');
uses('<b>${ESC(r.name)}</b> <span class="text-slate-500">${ESC(r.brand)} · ', 'the recent uploads box escapes the file');
uses('${ESC(b)} · Monthly Report', 'the monthly report title escapes the brand');
uses('<td class="p-1.5">${ESC(lab(r))}</td>', 'the monthly report rows escape the item');

/* ---- [4] the Excel exports ---- */
console.log('[4] exports');
const exp = at(/function expTbl\(\)[^\n]*/);
ok('expTbl guards every cell', (exp.match(/xg\(/g) || []).length >= 3, exp.slice(0, 200));
const all = at(/async function exportXlsx\(\)[\s\S]{0,1400}/);
ok('exportXlsx guards the asset columns', /xg\(typeof c\[1\]==='function'/.test(all));
ok('exportXlsx guards the tracker rows', (all.match(/xg\(/g) || []).length >= 5, (all.match(/xg\(/g) || []).length);

/* ---- [5] what the browser is told ---- */
console.log('[5] response headers');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));
const hdrs = [].concat(...cfg.headers.map(h => h.headers));
const csp = (hdrs.find(h => h.key === 'Content-Security-Policy') || {}).value || '';
ok('a CSP is sent', csp.length > 60, csp.slice(0, 60));
ok('the CSP blocks everything by default', csp.includes("default-src 'self'"));
ok('the CSP still allows the CDNs the page loads', ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'esm.sh', 'fonts.googleapis.com', 'fonts.gstatic.com'].every(h => csp.includes(h)), csp);
ok('the CSP allows the blob upload PUT', csp.includes('vercel-storage.com'));
ok('the CSP pins frames, objects and forms', ["frame-ancestors 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"].every(d => csp.includes(d)));
ok('no third-party script tag outside the allowed hosts',
  (PAGE.match(/src="(https?:\/\/[^"]+)"/g) || []).every(s => ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'esm.sh'].some(h => s.includes(h))),
  (PAGE.match(/src="(https?:\/\/[^"]+)"/g) || []));

console.log('\n' + pass + ' passed, ' + failn + ' failed');
process.exitCode = failn ? 1 : 0;
