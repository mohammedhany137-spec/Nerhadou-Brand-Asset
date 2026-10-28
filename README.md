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

### IQVIA market page (`data/iqvia.json`)
A new sidebar page **IQVIA Market (Egypt)**: pick any of the 516 ATC4 markets (type to search),
then choose the periods you want (2022, 2023, 2024, 2025, **YTD Aug 2025/2026**, **MAT Aug 2025/2026**)
and the metric (LC Value or Units). It shows market size, the company's sales, **MS%**, **Gr%
year over year**, **Δ share (pp)** and a **3-year CAGR (2022 → 2025)**, plus the top companies
and two charts.

Under it, **Products in this market** lists every product of the ATC4 (10,311 products in total):
product, company, units, LC value, **MS%** and **Gr%** for any period you pick, with a search box;
Nerhadou products are highlighted.

- `data/iqvia.json` (206 KB) = ATC4 totals: 2022–2025 (static, from *Total IMS*) + the YTD/MAT
  block from the latest *IQVIA* sheet (**Aug 2026**).
- `data/iqvia_products.json` (1.1 MB) = the product detail for the same periods; it is fetched
  only when the IQVIA page is opened.
- To refresh the YTD/MAT part, replace both files with newly built ones — nothing else changes,
  and the 2022–2025 numbers stay as they are.

### Brand → product manager
**Brand Asset → Brands** now has a *Product manager* column. An admin can:
- choose the responsible PM while creating a brand (`+ Add Brand`), or
- press ✏️ next to any brand to move it to another PM.

The assignment is stored in Redis (`assetlib:assign`) and wins over `lib/team.js`: it is applied
at login, in the data scope of every request and on the *My Team* page — so a moved brand is
added to the new PM and removed from the old one immediately.

### Conferences — doctors, cities and filters
- **Registered doctors** and **Accommodation doctors** are now real lists: each line has a **name + an
  amount**, a live total, **“Amount for all”** (write 10,000 once and apply it to everybody), and
  **📋 Paste from Excel** — paste 50–60 names at once (one per line, or `name<TAB>amount`).
- The list total fills *Registration cost* / *Accommodation cost*, and those feed the conference
  total, Budget Tracking and Expenses as before.
- New **City** field (27 Egyptian governorates) and three extra filters on the Conferences page:
  **doctor name**, **organizer** and **city**.

### Expenses — a cost shared between two products
- When you add a cost (Prints, Gimmicks, a Bag…) choose **Share this cost with another product**
  and the **share %**. The product that entered it keeps the rest, and the other product gets the
  cost automatically in its own Expenses (marked `AUTO`), so nobody re-enters it.
- The receiving product manager sees a green banner **“N costs shared with your product”** on the
  Expenses page, and if they try to enter the same item again they get an alert instead of a
  duplicate.
- Deleting the source item deletes the shared line too. Only **product names** are listed in the
  picker — no other product's data is exposed.
- Every one of these entries still goes to the **GPM / Marketing Director** for approval.

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
- File sections accept **an uploaded file** (Vercel Blob, up to 5 TB, no function size limit) **or** a Google Drive / any https direct link. The uploaded file shows its real size in the row.
  For uploads to work, create a **Blob store** in Vercel (Storage → Blob) so `BLOB_READ_WRITE_TOKEN` exists; without it the upload button says so and the Drive link still works.
- First Admin login after deploy loads seed v4 once; rows you added or edited are kept.

## Deploy
1. Upload `index.html`, `api/`, `lib/`, `data/`, `package.json`, `vercel.json` to the repo (Vercel redeploys by itself).
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
