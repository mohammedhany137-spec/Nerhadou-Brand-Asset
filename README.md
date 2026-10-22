# Nerhadou Asset (one app, one sidebar)
Brand Asset: dashboard, brands, matrix, Pipelines, 10 file sections (link-only, Google Drive direct links).
Tracking System: tracking dashboard, approvals center, Target (year selector, target vs achievement, history import), Sales Tracking, Budget Tracking, Digital Tracking, On-Ground Tracking, Campaign Calendar.
Conferences & Expenses: conference dashboard, conferences, conference shares, expenses dashboard, expenses.
System: alerts, audit log.

How the data is linked (one source of truth)
- Expenses is the only place money is stored. Budget Tracking = planned lines (brand x line) with Actual computed from Expenses. Digital Tracking = Expenses of line "Digital marketing" (+ reach/engagement/CTR/leads). On-Ground Tracking = Expenses of Events / Conferences / Abroad Events (+ attendance, samples, region). Adding a row in any of them creates the same expense, so nothing is entered twice or lost.
- An expense can be linked to a Campaign (Campaign Calendar shows actual cost per campaign). Deleting a campaign unlinks its expenses, it never deletes them.
- Conferences are split across products by Conference Shares (per specialty). A new conference only needs its specialty and cost.
- Renaming a brand updates every table. Deleting a brand asks for confirmation and lists what will be removed.

Fast entry: Quick add bar (Enter to add, remembers brand/line/month), edit numbers directly in the tables, paste rows from Excel, Excel import with templates.
Permissions: only the Marketing Director/Manager (admin) can add/edit/delete brands, Pipelines and Conference Shares. Product Managers' rows go through approval.
First Admin login after deploy loads the Excel data (seed v3) once; rows you added or edited yourself are kept. No file upload and no Blob store are needed anymore.
