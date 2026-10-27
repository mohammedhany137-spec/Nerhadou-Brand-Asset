# Nerhadou Marketing Hub (one app, one sidebar)
Designed by Nerhadou Marketing Team · Developed by Mohamed Hany

## v10 — people, products, and safe saving

### Who sees what (one roster: `lib/team.js`)
| Role | Sees | Can edit |
|---|---|---|
| **Admin** (`ADMIN_EMAILS`) | everything, plus **Pipelines**, **Alerts**, **Audit Log**, **Modules** | everything |
| **GPM** | only the products of the product managers of **his team** (and can enter data for them) | those products |
| **PM** | only **his own** products, dashboards included | his own products |

Scoping is enforced **on the server** (`lib/scope.js`), not only in the browser: `/api/data`
only returns the rows of the user's products, and when a product manager saves, the rows of
every other product are kept untouched on the server. Conference / event rows are matched
through their product split or through the Conference Shares table.

`lib/team.js` holds the teams:

```
Team 1  GPM islam.zahran      Feby (Vitatron, Chromitron) · Mahmoud (Calcitron) · Ahmed (Ferrotron, Ferrotron Forte)
Team 2  GPM reham_mostafa     Nourhan (Methyltechno) · Diaa (Techno B Complex) · Mohamed Hany (Vita D3, Vita D3+K2, Zolmsolan, Nerhapezil)
Team 3  GPM basem_fathy       Ali (Ondalenz 8mg, Meclizigo) · Sherry (Ondalenz 4mg, Nerdecong, Tulitroph) · Ahmed A. (Spasulanse, Lopranest) · Mohamed Nessim (Nerhaflux) · Amir (Nopyretron)
Team 4  GPM ahmed_abdelgawad   Rasha (Octatron) · Dadamouny (Tadanerfi 5/20mg, Nerhasilda) · Amira (Zinctron, Trib Gold) · Zeyad (Nercafix, Hi-Potency) · Hassan (Melacryst) · Nadeen (Nerkardou)
```
Admins: `mohamed.hany@nerhadou.com` (add more with `ADMIN_EMAILS`).
`Nerdecong` and `Tulitroph` (Sherry / Basem Fathy) were added to the product list; the first admin
login after deploy creates the two brands in the portfolio automatically.

### Passwords
Everybody signs in first with the shared default **123456** and can change it at any time
from the 🔑 button — changing it is optional. Only a salted HMAC is stored in Redis
(`assetlib:pw`); no password is ever written in clear text.

### Saving (no lost edit)
- One writer at a time; if you edit while a save is running, the new value is queued and sent
  next, and a server answer never overwrites a newer local edit.
- A failed save retries alone (2s → 4s → 8s → 16s → 30s) with a red banner, and the browser
  warns before you close the tab while something is still unsaved.
- Inline cells save on blur and on **Enter**; dialog fields save on **Enter** too.
- Saving is the submission: any add or edit of a contributor is stored as **Waiting for Admin
  Approval** at once (no separate "submit" step), and the approver keeps the same Approve /
  Reject / Changes-requested actions in **Approvals**. A small toast says
  "Saved ✓ sent to the GPM … for review", and a red toast says when the save failed.
- The approval workflow, the theme, the links and every existing function are untouched.

### Cheap refresh
Every open page asks for `/api/version` — an **11-byte** number — every **90 seconds**
(and when the tab becomes visible again). The data itself is downloaded **only when that
number changed**, so the free Redis quota is not burned by polling.

### Module IDs and the review register
Every page has a fixed id (`MOD-DOC-03`, `MOD-TRK-03`, …) shown next to the page title, and
every record has a short reference (`TRK-4F2A9C`) listed in **System → Modules** (admins).
**My Team** lists the product managers of the GPM's team and their products.

## The rest of the app
Sidebar: Dashboards (Brand Asset, Tracking, Conference and Expenses) · Brand Asset (brands, matrix, Pipelines*, 10 file sections) · Tracking System (Approvals, Sales Tracker, Targets, Budget Tracker, Digital Tracker, On-Ground Tracker and Conference Shares) · Editable Inputs (Sales Entry, Expenses, Conferences, Events and Campaigns) · System (Alerts*, Audit Log*, Modules*, My Team). * admin only. The server does not even send Pipelines to other users.

Linking (one source of truth = Expenses)
- Budget Tracking: planned lines; open a line to see every item (date, month, quarter, what exactly was done, cost). Filters: month, quarter, line, status, search.
- Budget, Digital and On-Ground Tracking are read-only views. Edit source records from Expenses, Events or Conferences.
- Conferences and Events: a new/edited item is posted automatically to Budget Tracking (lines "Conferences" / "Events") per product by the specialty split (Conference Shares). "⚖" sets a different split for one item by selecting products and %. Auto lines are marked AUTO and follow the item's approval status. Existing Excel conferences are NOT re-posted (their budget is already in the Expenses sheets).
- Quarters are calculated from the date everywhere (Jan-Mar = Q1 ...).

Other
- Tables: sticky header, totals row, quarter/line filters, Export, full add/edit forms, Paste from Excel and inline editing on editable inputs.
- api/upload.js and @vercel/blob are kept (the UI uses direct links).
- First Admin login after deploy loads seed v4 once; rows you added or edited are kept.

## Deploy
1. Upload `index.html`, `api/`, `lib/`, `package.json`, `vercel.json` to the repo (Vercel redeploys by itself).
2. Vercel → Settings → Environment Variables (nothing has to be deleted):

| Variable | Status |
|---|---|
| `SESSION_SECRET` | **required**, unchanged |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_*`) | **required**, unchanged |
| `ADMIN_EMAILS` | supported — **added to** the built-in `mohamed.hany@nerhadou.com` |
| `ADMIN_EMAIL` (old, singular) | still honoured — used as an extra admin |
| `DEFAULT_PASSWORD` | new, optional (default `123456`) |
| `USERS` | new, optional JSON to add/override people |
| `ADMIN_PASSWORD`, `USER_PASSWORD`, `GPM_PASSWORD`, `GPM_EMAILS`, `USER_BRANDS`, `ALLOWED_DOMAIN` | **retired** — replaced by the roster (`lib/team.js`) and the shared first password. Leaving them in Vercel does no harm, they are simply not read any more. |

3. Redeploy, then sign in with an admin email and `123456` (change it afterwards from 🔑 if you like).

### API
| Route | Purpose |
|---|---|
| `POST /api/login` | email + password → token, role, products, team, manager |
| `GET /api/data` | scoped data + `rev` |
| `PUT /api/data` | save one key (merged with the rows of other products, bump `rev`) |
| `GET /api/version` | the 11-byte data version |
| `POST /api/password` | optional password change |
| `GET /api/team` | the team of a GPM (every team for an admin) |
| `GET /api/audit` | audit log (admin) |
