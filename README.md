# Nerhadou Marketing Hub — version 18

## What is in the project

| Folder / file | What it is |
| --- | --- |
| `public/` | The site itself: `index.html` (page shell), `app.js` (application), `app.css` (styles), `logo.png`. **Only this folder is published.** |
| `api/` | The server endpoints (sign-in, data, IQVIA, backup, scheduled messages). |
| `lib/` | Server code shared by the endpoints (team roster, scoping, reports, notifications). |
| `data/` | Files only the server reads: the built-in IQVIA data and `seed.json` (the starting figures). |
| `vercel.json` | Deployment settings. `"outputDirectory": "public"` is what keeps `lib/` and `data/` private. |

## After deploying, check these three things

1. Open `https://<your-site>/lib/team.js` and `https://<your-site>/data/seed.json` in a browser. Both must answer **404**.
2. In Vercel → project → Cron Jobs → `/api/backup` → View Logs: the nightly run must answer **200**. (Before version 14 it answered 401, because the job is called with GET and the old code only accepted its secret on other methods.)
3. Sign in as the Marketing Director, open the account menu → Data tools → Messages, and press **Send me a test message**.

## Environment variables (Vercel → Settings → Environment Variables)

Already in use and unchanged: `SESSION_SECRET`, the Upstash Redis variables, `CRON_SECRET`, and the Vercel Blob token used by the nightly backup.

New in version 14, all optional. Nothing is sent until at least one channel is set.

| Variable | Purpose |
| --- | --- |
| `TEAMS_WEBHOOK_URL` | A Microsoft Teams *Workflows* webhook ("Post to a channel when a webhook request is received"). Messages appear as cards in that channel. |
| `RESEND_API_KEY` + `MAIL_FROM` | Email through resend.com. `MAIL_FROM` looks like `Nerhadou Hub <hub@your-domain>`; the domain has to be verified in Resend. |
| `HUB_URL` | The address of the site, used for the "Open the Hub" button. If empty, the address of the request is used. |
| `NOTIFY_APPROVALS` | Set to `off` to stop approval messages. The monthly report still goes out. |

Redeploy after changing a variable.

## Messages the Hub sends

- **At once**: when a product manager or GPM saves items that need approval, the approver (the GPM, otherwise the Director/Manager) gets one message — at most one per sender every ten minutes.
- **Every morning** (05:00 UTC, 07:00 Cairo): each approver with items waiting gets one reminder.
- **On the 1st of the month**: everyone gets the monthly report of the brands he or she owns — company sales YTD, Ach% vs target, spend against budget. These are company sales, not in-market (IQVIA) figures.

## Updating the IQVIA data each month

IQVIA Market page → **Update from the monthly IQVIA file** (Director/Manager only).

The Excel file needs one row per product or pack, with these columns (any order, any titles):
ATC4 market · Product · Company · and, for every period, a **Units** column and a **Value (EGP)** column.
Periods are recognised from the titles: a year (`2025`), `YTD 09/2026`, `MAT Sep 2026`, and so on. USD columns are ignored.
The Hub proposes the columns, shows the totals before anything is saved, and you can correct any choice.
**Go back to the built-in data** removes the upload.

## Importing company sales

Sales Entry page → **Import company sales from Excel** (Director/Manager only).
Works with one row per product per month, or one column per month. Product names are matched to brands;
the matches you correct are remembered for the next import. Nothing is saved until you press Import.

## GeoShare and the Geo-share Dashboard

- A **line** is a Group Product Manager's team and its products (taken from the team roster).
- **GeoShare** (Tracking System): for each line, its area managers — name, the GM he reports to, the region he covers and his geo-share in %. The geo-shares of one line cannot pass 100%. A GPM edits the area managers of his own line, the Marketing Director/Manager every line; product managers read.
- **Geo-share Dashboard** (Dashboards): for every area manager, his share of his line's budget for the year, what the gimmicks, conferences and events of that line's products have consumed in his region, and what is left. Also summed per GM.
- The link is the **Region** chosen on an expense, a conference or an event:
  one region goes to the manager of that region in the same line (several managers of one region share it in proportion to their geo-share);
  several regions divide the cost equally between them; "All regions" spreads it over every manager of the line by geo-share;
  an item with no region, or with a region nobody in the line covers, is listed apart so that nothing disappears.
- **Budget used up**: an area manager at 100% of his budget share (90% as a warning) shows in Alerts, on the bell and on the dashboard. When a message channel is configured, the Director/Manager and the GPM of his line get one message the morning after it happens.
- **Conference Shares** is shown in full to everybody (read-only unless Director/Manager).

## Years (version 17)

- The Hub opens on the **current calendar year**. On 1 January 2027 it moves to 2027 by itself; nothing has to be changed.
- Sales, expenses, conferences, events, budget lines and the dashboards show the chosen year only. The **year box** in the filter bar brings an earlier year back, so 2026 stays available as history.
- A **budget line** belongs to one product, one line (Prints, Conferences, ...) and one year, and spend is counted against the line of its own year.
- **Setting a new year** (Marketing Director/Manager): choose the year, then
  - Budget Tracker: `+ Add budget line`, `Import budget`, or `Create the 2027 lines from 2026` (same lines, amount 0, last year's amount kept in Remarks); the pencil next to a planned amount edits the line.
  - Targets: `+ Add Row`, `Import targets`, or `Create the 2027 lines from 2026` (same products and unit price, units 0).
- A product manager's Geo-share pages show his own products only.

## The library reads Google Drive (version 18)

- Each brand has one Drive folder; the list is at the top of `lib/drive.js` (`FOLDERS`). To add or change a brand's folder, edit that list and redeploy.
- Inside a brand folder, the sub-folders must carry the names of the library sections (`01_Brand_Master` ... `99_Archive`). Every file under a section folder, however deep, appears in that section with **Open in Drive**, which opens the file itself. Files placed directly in the brand folder, or in a folder that matches no section, are not shown; the Director/Manager sees a note listing them.
- The Hub stores no file and no copy of the list: Drive rows cannot be edited or deleted in the Hub. Rename, move or delete the file in Drive. A reading is kept for 30 minutes; **Read Drive again** asks Drive at once.
- Brands without a Drive folder (and any extra file) still use **Add link to this section**: paste the file's direct link. Uploading files to the site has been removed (`api/upload.js` is gone).
- The Drive folders must be shared as **Anyone with the link can view**.

### Recommended: a Google API key

Without a key the Hub reads the public folder page, the way a browser does. That needs no setup, but Google lists at most 50 entries of one folder there, and the page format is Google's to change.
With a key the Hub uses the official Drive API: no 50-file limit, with dates and sizes.

1. Open console.cloud.google.com, create a project (or pick one).
2. APIs & Services -> Library -> "Google Drive API" -> Enable.
3. APIs & Services -> Credentials -> Create credentials -> API key. Restrict the key to the Google Drive API.
4. In Vercel -> Settings -> Environment Variables add `GOOGLE_API_KEY` with that key, then redeploy.
