'use strict';

/*
 * Single source of truth for people, roles, products and teams.
 *
 * Each person:
 *   email   : corporate email (lower case)
 *   name    : display name
 *   role    : 'admin' | 'gpm' | 'pm'
 *   team    : team key (a GPM owns every PM of the same team)
 *   brands  : products the person may see / add / edit / filter
 *
 * A PM sees and edits only his own brands.
 * A GPM sees and edits every brand of the PMs of his team (and can enter data for them).
 * An admin sees everything, including Pipelines, Alerts and the Audit Log.
 *
 * You can override this file without touching it, with Vercel env vars:
 *   ADMIN_EMAILS      comma separated list of admin emails
 *   USERS             JSON: {"email":{"name":"..","role":"pm","brands":[".."],"team":"Team 1"}}
 *   DEFAULT_PASSWORD  first password for everybody (default: 123456)
 */

const DEFAULT_PASSWORD = '123456';
const PASSWORD_KEY = 'assetlib:pw';

const TEAMS = {
  'Team 1': { name: 'Team 1', gpm: 'islam.zahran@nerhadou.com' },
  'Team 2': { name: 'Team 2', gpm: 'reham_mostafa@nerhadou.com' },
  'Team 3': { name: 'Team 3', gpm: 'basem_fathy@nerhadou.com' },
  'Team 4': { name: 'Team 4', gpm: 'ahmed_abdelgawad@nerhadou.com' }
};

const PEOPLE = [
  // ---- Team 1 ----
  { email: 'islam.zahran@nerhadou.com', name: 'Islam Zahran', role: 'gpm', team: 'Team 1', brands: [] },
  { email: 'feby_abdallah@nerhadou.com', name: 'Feby Abdallah', role: 'pm', team: 'Team 1', brands: ['Vitatron', 'Chromitron'] },
  { email: 'mahmoud.hassan@nerhadou.com', name: 'Mahmoud Hassan', role: 'pm', team: 'Team 1', brands: ['Calcitron'] },
  { email: 'ahmed.talaat@nerhadou.com', name: 'Ahmed Talaat', role: 'pm', team: 'Team 1', brands: ['Ferrotron', 'Ferrotron Forte'] },

  // ---- Team 2 ----
  { email: 'reham_mostafa@nerhadou.com', name: 'Reham Mostafa', role: 'gpm', team: 'Team 2', brands: [] },
  { email: 'nourhan_nabil@nerhadou.com', name: 'Nourhan Nabil', role: 'pm', team: 'Team 2', brands: ['Methyltechno (Private)'] },
  { email: 'diaa.ashraf@nerhadou.com', name: 'Diaa Ashraf', role: 'pm', team: 'Team 2', brands: ['Techno B Complex'] },
  { email: 'mohammed.hany.137@gmail.com', name: 'Mohamed Hany', role: 'pm', team: 'Team 2', brands: ['Vita D3 ODF', 'Vita D3+K2 ODF', 'Zolmsolan ODF', 'Nerhapezil ODF'] },

  // ---- Team 3 ----
  { email: 'basem_fathy@nerhadou.com', name: 'Basem Fathy', role: 'gpm', team: 'Team 3', brands: [] },
  { email: 'ali.ashour@nerhadou.com', name: 'Ali Ashour', role: 'pm', team: 'Team 3', brands: ['Ondalenz 8mg', 'Meclizigo'] },
  { email: 'sherry_boushra@nerhadou.com', name: 'Sherry Boushra', role: 'pm', team: 'Team 3', brands: ['Ondalenz 4mg', 'Nerdecong', 'Tulitroph'] },
  { email: 'ahmed.abdelmoneim@nerhadou.com', name: 'Ahmed Abdelmoneim', role: 'pm', team: 'Team 3', brands: ['Spasulanse', 'Lopranest'] },
  { email: 'mohamed_nessim@nerhadou.com', name: 'Mohamed Nessim', role: 'pm', team: 'Team 3', brands: ['Nerhaflux'] },
  { email: 'amir.rezk@nerhadou.com', name: 'Amir Rezk', role: 'pm', team: 'Team 3', brands: ['Nopyretron'] },

  // ---- Team 4 ----
  { email: 'ahmed_abdelgawad@nerhadou.com', name: 'Ahmed Abdelgawad', role: 'gpm', team: 'Team 4', brands: [] },
  { email: 'rasha.samy@nerhadou.com', name: 'Rasha Samy', role: 'pm', team: 'Team 4', brands: ['Octatron'] },
  { email: 'mohamed_dadamouny@nerhadou.com', name: 'Mohamed Dadamouny', role: 'pm', team: 'Team 4', brands: ['Tadanerfi 5mg', 'Tadanerfi 20mg', 'Nerhasilda 50mg', 'Nerhasilda 75mg'] },
  { email: 'amira.elsayed@nerhadou.com', name: 'Amira Elsayed', role: 'pm', team: 'Team 4', brands: ['Zinctron', 'Trib Gold'] },
  { email: 'zeyad.saad@nerhadou.com', name: 'Zeyad Saad', role: 'pm', team: 'Team 4', brands: ['Nercafix', 'Hi-Potency'] },
  { email: 'hassan.essam@nerhadou.com', name: 'Hassan Essam', role: 'pm', team: 'Team 4', brands: ['Melacryst'] },
  { email: 'nadeen.kamel@nerhadou.com', name: 'Nadeen Kamel', role: 'pm', team: 'Team 4', brands: ['Nerkardou'] }
];

const ADMINS = ['mohamed.hany@nerhadou.com'];

/* Spelling variants used by the team -> the exact product name used in the site.
   Matching is done on the normalised form, so "Hi-potency" = "Hi-Potency",
   "Techno-B complex" = "Techno B Complex", "Ferrotron forte" = "Ferrotron Forte"... */
const ALIASES = {
  methyltechno: 'Methyltechno (Private)',
  vitad34000: 'Vita D3 ODF',
  vitad3k24000: 'Vita D3+K2 ODF',
  zolmsolan: 'Zolmsolan ODF',
  nerhapezil: 'Nerhapezil ODF',
  spassulance: 'Spasulanse',
  nerhasilda50mg: 'Nerhasilda',
  nerhasilda75mg: 'Nerhasilda',
  nerhafluks: 'Nerhaflux'
};

const normBrand = s => {
  const raw = String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const al = ALIASES[raw];
  return al ? al.toLowerCase().replace(/[^a-z0-9]/g, '') : raw;
};

const list = v => String(v || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);

let cache = null;

function roster() {
  if (cache) return cache;
  const people = PEOPLE.map(p => Object.assign({}, p, { brands: (p.brands || []).slice() }));
  const byEmail = {};
  people.forEach(p => { byEmail[p.email] = p; });

  // optional full override / extension
  if (process.env.USERS) {
    try {
      Object.entries(JSON.parse(process.env.USERS || '{}')).forEach(([k, v]) => {
        const email = k.trim().toLowerCase();
        const prev = byEmail[email] || { email };
        byEmail[email] = Object.assign({}, prev, {
          email,
          name: v.name || prev.name || email.split('@')[0],
          role: v.role || prev.role || 'pm',
          team: v.team || prev.team || '',
          brands: [].concat(v.brands !== undefined ? v.brands : (prev.brands || []))
        });
      });
    } catch (e) { /* keep the built-in roster */ }
  }

  // ADMIN_EMAILS (and the old ADMIN_EMAIL) add admins, they never remove the built-in one
  const admins = [...new Set(ADMINS.concat(list(process.env.ADMIN_EMAILS), list(process.env.ADMIN_EMAIL)))];
  admins.forEach(email => {
    byEmail[email] = byEmail[email] || { email, name: email.split('@')[0], brands: [], team: '' };
    byEmail[email].role = 'admin';
    byEmail[email].brands = [];
  });

  cache = { byEmail, admins };
  return cache;
}

function findUser(email) {
  const e = String(email || '').trim().toLowerCase();
  const p = roster().byEmail[e];
  if (!p) return null;
  const team = p.team || '';
  const gpm = team && TEAMS[team] ? TEAMS[team].gpm : null;
  return {
    email: e,
    name: p.name || e.split('@')[0],
    role: p.role || 'pm',
    team,
    brands: (p.brands || []).slice(),
    manager: p.role === 'pm' && gpm && gpm !== e ? gpm : null
  };
}

/* The product managers of a team (the GPM is reported separately). */
function teamMembers(team) {
  return Object.values(roster().byEmail).filter(p => p.team === team && p.role === 'pm');
}

/* Brands a user may see: null = everything (admin). */
function brandsFor(user) {
  if (!user) return [];
  if (user.role === 'admin') return null;
  if (user.role === 'gpm') {
    const out = [];
    teamMembers(user.team).forEach(p => { (p.brands || []).forEach(b => out.push(b)); });
    (user.brands || []).forEach(b => out.push(b));
    return uniq(out);
  }
  return uniq(user.brands || []);
}

function uniq(a) {
  const seen = new Set();
  return a.filter(x => {
    const k = normBrand(x);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function teamFor(team) {
  const t = TEAMS[team];
  if (!t) return { name: team || '—', gpm: null, members: [] };
  return { name: t.name, gpm: t.gpm, members: teamMembers(team) };
}

function teamOfGpm(email) {
  const u = findUser(email);
  if (!u || u.role !== 'gpm') return null;
  return teamFor(u.team);
}

module.exports = { DEFAULT_PASSWORD, PASSWORD_KEY, normBrand, findUser, brandsFor, teamFor, teamOfGpm, roster, list, teams: () => TEAMS, ALIASES };
