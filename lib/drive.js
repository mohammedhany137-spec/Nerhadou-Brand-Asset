'use strict';

/* The Brand Asset library read straight from Google Drive.
 *
 * Each brand has one Drive folder (list below). Inside it, the sub-folders carry the names of
 * the library sections (01_Brand_Master ... 99_Archive). Every file found under a section
 * folder - however deep - is shown in that section of the Hub with a link that opens the file
 * itself in Drive. Nothing is copied: the Hub keeps no file, only reads names and links.
 *
 * Two ways of reading, chosen by the environment:
 *
 *   GOOGLE_API_KEY set   the Google Drive API (recommended): complete, with dates and sizes.
 *   not set              the public folder page, as a browser sees it. It needs no setup, but
 *                        Google shows at most 50 entries of a folder there and no dates.
 *
 * Both need the folders to be shared as "Anyone with the link can view".
 */
const SECTIONS = [
  ['brand_master', '01_Brand_Master'], ['strategy_plan', '02_Strategy_and_Plan'], ['claims_evidence', '03_Claims_and_Evidence'],
  ['approvals', '04_Approvals'], ['pack_leaflet', '05_Pack_and_Leaflet'], ['field_tablet', '06_Field_and_Tablet'],
  ['website_social', '07_Website_and_Social'], ['campaigns_projects', '08_Campaigns_and_Projects'],
  ['current_approved', '09_CURRENT_APPROVED'], ['archive', '99_Archive']
];

/* Drive folder of each brand. `as` lists other spellings the portfolio uses for the same folder. */
const FOLDERS = [
  ['Octatron', '17LFQEKYr3L0VZOltqVEi3xshKiR1OvA4'],
  ['Trib Gold', '1bEuSUb6oXWNXGT0sZyZgaV4QwtudB9rw', ['Tribgold']],
  ['Zinctron', '1zyAtdSS4NcoiAeKKqtjv-hN0svhtQwt1'],
  ['Tadanerfi', '1W0ZXWBCinl6brgJwlM4RZGgOBfbyaQHe'],
  ['Nerhasilda', '1z2fGNmhjdgTvhdRO_slHCG3QKEw2mO94'],
  ['Hi-Potency', '1lvMxH_SC4wFnzVGlQCcjsQW7NGqyew9Z', ['Hipotency']],
  ['Nercafix', '1ftELCNwHBTbqFEPuOcd_L6L8RklxMMGp'],
  ['Nerkardou', '1LFNzDp8s1ShJ02dLpjpSSvdp-2cn27Cf'],
  ['Melacryst', '1uS6Oimg0g39Osp8LmIdkT7qLhP8L3uBo'],
  ['Methyltechno', '1f1DhqnxAosC4r_XgXbazyHTr3__mrCiv', ['Methyltechno (Private)', 'Methyltechno (UPA)']],
  ['Vita D3', '1MFHHN5Hyb89ciibwFniSlEL7JPYtPS45', ['Vita D3 ODF']],
  ['Zolmsolan', '1n-JRkfSwTohPP_IXi2-ciwkiYCqvyV8Q'],
  ['Nerhapezil', '1DdUmD1LEJbx-Ki4GqCKRyy4C-EUI3mEP'],
  ['Techno B Complex', '1YHloKyxDzPivF1Hv-XyTl-8ULmLA_WXD', ['Techno B-Complex', 'Techno B']],
  ['Vitatron', '1NHSVS10BEOYBcgESWY4ILVlgHN4E9e_X'],
  ['Chromitron', '13bNjcf_t58-VYnVa6qsMIorfQn1wNR4l'],
  ['Calcitron', '1xWjmXXthUIRI020fgxc7jvYUjiMt40TO'],
  ['Ferrotron', '1JWSFiPYnEhEPDCqlqjRYkzMgZYZeU7oY'],
  ['Ferrotron Forte', '1z7tqaKlF0Do_fv26J2U-B8oIXRdZRgLR'],
  ['Nerhaflux', '1axSZkxkDMzbyI-SVtZVa8P1OA7fEXsfq'],
  ['Spasulanse', '1BdvoL2KMG7nBnKmBCd9q4Xwjs3KMkh1q', ['Spasulance']],
  ['Lopranest', '1K7mti-_v3_JulcaEAMPLKaiLMLWbgTro'],
  ['Ondalenz 8mg', '1n78hIyBRY51eDDXxzL02uw9ACHq3IH75'],
  ['Ondalenz 4mg', '1n78hIyBRY51eDDXxzL02uw9ACHq3IH75'],
  ['Meclizigo', '16sW1x6-RW9AS0Mt5k8cjJUtWYdIsMlg1'],
  ['Nopyretron', '1vThp_CJ17jgnqKKSE8WV8VVBZmI7MUsT'],
  ['Nerdecong', '1r6lb-dFgJ-dyaccI-EYGYnhcp-eCfJNt'],
  ['Tulitroph', '1QtA2fPAHKlBinkt6ywc-4KQgiHtW-q-X']
];

const MAX_FOLDERS = 80;      // folders opened for one brand
const MAX_DEPTH = 5;
const TIMEOUT_MS = 12000;
const PUBLIC_PAGE_LIMIT = 50;
const FOLDER = 'application/vnd.google-apps.folder';

const key = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const apiKey = () => String(process.env.GOOGLE_API_KEY || '').trim();
const mode = () => apiKey() ? 'api' : 'public';

/* The folder of a portfolio brand: the same name, the name plus "ODF", or the name plus a strength
   ("Tadanerfi 20mg"). "Vita D3+K2" is a different product from "Vita D3" and gets nothing here. */
function folderFor(brand) {
  const b = key(brand);
  if (!b) return '';
  for (const [name, id, as] of FOLDERS) {
    const names = [name].concat(as || []).map(key);
    if (names.some(n => b === n || b === n + 'odf' || (b.startsWith(n) && /^\d+(mg|mcg|iu|g)?(odf)?$/.test(b.slice(n.length))))) return id;
  }
  return '';
}

function sectionOf(folderName) {
  const raw = String(folderName || '').trim(), k = key(raw);
  const num = (raw.match(/^\s*0*(\d{1,2})\b/) || [])[1];
  const bare = k.replace(/^\d+/, '');
  for (const [sec, name] of SECTIONS) {
    const sk = key(name), sn = String(+name.slice(0, 2)), sb = sk.replace(/^\d+/, '');
    if (k === sk || (bare && bare === sb) || (num && num === sn && (!bare || sb.startsWith(bare.slice(0, 4)) || bare.startsWith(sb.slice(0, 4))))) return sec;
  }
  return '';
}

/* The address that opens the item itself, not its folder. */
function linkOf(id, mime) {
  const m = String(mime || '');
  const g = { 'application/vnd.google-apps.document': 'document', 'application/vnd.google-apps.spreadsheet': 'spreadsheets', 'application/vnd.google-apps.presentation': 'presentation', 'application/vnd.google-apps.form': 'forms', 'application/vnd.google-apps.drawing': 'drawings' }[m];
  return g ? 'https://docs.google.com/' + g + '/d/' + id + '/edit' : 'https://drive.google.com/file/d/' + id + '/view';
}

function kindOf(name, mime) {
  const m = String(mime || ''), ext = (String(name).match(/\.([a-z0-9]{2,5})$/i) || [])[1] || '';
  const e = ext.toLowerCase();
  if (/^image\//.test(m) || /^(png|jpe?g|gif|webp|svg|tiff?|bmp|heic)$/.test(e)) return 'Image';
  if (m === 'application/pdf' || e === 'pdf') return 'PDF';
  if (/^video\//.test(m) || /^(mp4|mov|avi|mkv|webm|wmv)$/.test(e)) return 'Video';
  if (/^audio\//.test(m) || /^(mp3|wav|m4a|aac)$/.test(e)) return 'Audio';
  if (/presentation|powerpoint/.test(m) || /^(pptx?|ppsx?|key)$/.test(e)) return 'Presentation';
  if (/spreadsheet|excel/.test(m) || /^(xlsx?|xlsm|csv)$/.test(e)) return 'Sheet';
  if (/document|msword|wordprocessing/.test(m) || /^(docx?|rtf|txt)$/.test(e)) return 'Document';
  if (/^(ai|psd|eps|indd|cdr|fig|sketch|xd)$/.test(e) || /illustrator|photoshop|postscript/.test(m)) return 'Artwork';
  if (/zip|compressed|rar|7z/.test(m) || /^(zip|rar|7z)$/.test(e)) return 'Archive';
  return e ? e.toUpperCase() : 'File';
}

async function get(url, headers) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try { return await fetch(url, { headers: headers || {}, redirect: 'follow', signal: ctl.signal }); }
  finally { clearTimeout(t); }
}

/* ---- Drive API ---- */
async function listApi(id) {
  const out = [];
  let page = '';
  do {
    const q = encodeURIComponent("'" + id + "' in parents and trashed = false");
    const url = 'https://www.googleapis.com/drive/v3/files?q=' + q + '&pageSize=1000&orderBy=name&supportsAllDrives=true&includeItemsFromAllDrives=true' +
      '&fields=' + encodeURIComponent('nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,size,shortcutDetails)') + (page ? '&pageToken=' + encodeURIComponent(page) : '') + '&key=' + encodeURIComponent(apiKey());
    const r = await get(url);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const why = (j.error && j.error.message) || ('http ' + r.status);
      throw new Error(r.status === 404 ? 'the folder was not found, or it is not shared as "Anyone with the link"' : r.status === 403 ? 'Google refused the request: ' + why : why);
    }
    (j.files || []).forEach(f => {
      const sc = f.shortcutDetails;
      const fid = sc ? sc.targetId : f.id, mime = sc ? sc.targetMimeType : f.mimeType;
      out.push({ id: fid, name: f.name, mime, folder: mime === FOLDER, link: mime === FOLDER ? '' : (!sc && f.webViewLink) || linkOf(fid, mime), modified: String(f.modifiedTime || '').slice(0, 10), size: +f.size || 0 });
    });
    page = j.nextPageToken || '';
  } while (page);
  return { items: out, capped: false };
}

/* ---- the public folder page ---- */
/* The page carries its listing in a script, as a quoted string with \xNN escapes (UTF-8 bytes). */
function unescapeJs(s) {
  return s.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[\s\S])/g, (m, e) => {
    if (e[0] === 'x' || e[0] === 'u') return String.fromCharCode(parseInt(e.slice(1), 16));
    return ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' })[e] !== undefined ? ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' })[e] : e;
  });
}
const utf8 = s => { for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 255) return s; try { const t = Buffer.from(s, 'latin1').toString('utf8'); return t.includes('�') ? s : t; } catch (e) { return s; } };

function parsePublicPage(html) {
  if (/accounts\.google\.com\/(v3\/)?signin|ServiceLogin/.test(html) && !/_DRIVE_ivd/.test(html)) throw new Error('the folder is not shared as "Anyone with the link can view"');
  const at = html.indexOf('_DRIVE_ivd');
  if (at < 0) throw new Error('the folder page could not be read (Google changed it, or the folder is not public). Set GOOGLE_API_KEY to read through the Drive API.');
  const open = html.lastIndexOf('<script', at);
  const start = open < 0 ? at : html.indexOf('>', open) + 1;
  const end = html.indexOf('</script>', at);
  const script = html.slice(start, end < 0 ? undefined : end);   // window['_DRIVE_ivd'] = '<the listing>';
  const strings = script.match(/'((?:[^'\\]|\\[\s\S])*)'/g) || [];
  if (strings.length < 2) throw new Error('the folder page has no listing');
  let arr;
  try { arr = JSON.parse(unescapeJs(strings[1].slice(1, -1))); } catch (e) { throw new Error('the folder listing could not be decoded. Set GOOGLE_API_KEY to read through the Drive API.'); }
  const rows = Array.isArray(arr) && Array.isArray(arr[0]) ? arr[0] : [];
  const items = rows.filter(e => Array.isArray(e) && typeof e[0] === 'string' && typeof e[2] === 'string').map(e => {
    const mime = typeof e[3] === 'string' ? e[3] : '';
    const ms = [e[10], e[9]].find(v => typeof v === 'number' && v > 1e12 && v < 1e14);
    return { id: e[0], name: utf8(e[2]), mime, folder: mime === FOLDER, link: mime === FOLDER ? '' : linkOf(e[0], mime), modified: ms ? new Date(ms).toISOString().slice(0, 10) : '', size: 0 };
  });
  return { items, capped: items.length >= PUBLIC_PAGE_LIMIT };
}
async function listPublic(id) {
  const r = await get('https://drive.google.com/drive/folders/' + encodeURIComponent(id) + '?hl=en', { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', 'Accept-Language': 'en' });
  if (r.status === 404) throw new Error('the folder was not found');
  if (!r.ok) throw new Error('Google answered http ' + r.status);
  return parsePublicPage(await r.text());
}

const listFolder = id => (apiKey() ? listApi(id) : listPublic(id));

/* Everything under one brand folder, sorted into the library sections. */
async function readBrand(folderId) {
  const out = { folder: folderId, mode: mode(), at: Date.now(), sections: {}, loose: 0, unmatched: [], capped: [], warnings: [] };
  SECTIONS.forEach(([k]) => { out.sections[k] = []; });
  const root = await listFolder(folderId);
  if (root.capped) out.capped.push('(the brand folder)');
  out.loose = root.items.filter(i => !i.folder).length;
  let queue = [];
  root.items.filter(i => i.folder).forEach(f => {
    const sec = sectionOf(f.name);
    if (sec) queue.push({ id: f.id, sec, path: '', depth: 1, name: f.name }); else out.unmatched.push(f.name);
  });
  let opened = 1;
  const seen = new Set([folderId]);
  while (queue.length) {
    const batch = queue.splice(0, 6).filter(f => !seen.has(f.id));
    batch.forEach(f => seen.add(f.id));
    if (opened + batch.length > MAX_FOLDERS) { out.warnings.push('This brand has more than ' + MAX_FOLDERS + ' folders; the deepest ones were not read.'); break; }
    opened += batch.length;
    const lists = await Promise.all(batch.map(f => listFolder(f.id).then(r => ({ f, r }), e => ({ f, e }))));
    for (const { f, r, e } of lists) {
      if (e) { out.warnings.push((f.path ? f.path + ' / ' : '') + f.name + ': ' + e.message); continue; }
      if (r.capped) out.capped.push((f.path ? f.path + ' / ' : '') + f.name);
      r.items.forEach(i => {
        if (i.folder) { if (f.depth < MAX_DEPTH) queue.push({ id: i.id, sec: f.sec, path: f.depth === 1 ? i.name : f.path + ' / ' + i.name, depth: f.depth + 1, name: i.name }); }
        else out.sections[f.sec].push({ id: i.id, name: i.name, link: i.link, type: kindOf(i.name, i.mime), modified: i.modified, size: i.size, path: f.depth === 1 ? '' : f.path });
      });
    }
  }
  Object.values(out.sections).forEach(a => a.sort((x, y) => (x.path || '').localeCompare(y.path || '') || x.name.localeCompare(y.name)));
  out.files = Object.values(out.sections).reduce((a, s) => a + s.length, 0);
  return out;
}

module.exports = { SECTIONS, FOLDERS, folderFor, sectionOf, linkOf, kindOf, parsePublicPage, readBrand, mode, key };
