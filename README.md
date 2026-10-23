# Nerhadou Marketing Hub (one app, one sidebar)
Designed by Nerhadou Marketing Team · Developed by Mohamed Hany

Sidebar: Brand Asset (dashboard, brands, matrix, Pipelines*, 10 file sections - link-only) · Tracking System (dashboard, approvals center, Target, Sales, Budget, Digital, On-Ground, Campaign Calendar) · Conferences & Expenses (conference dashboard, conferences, events, conference shares, expenses dashboard, expenses) · System (Alerts*, Audit Log*).
* Director/Manager (admin) only. The server does not even send Pipelines to other users.

Linking (one source of truth = Expenses)
- Budget Tracking: planned lines; open a line to see every item (date, month, quarter, what exactly was done, cost). Filters: month, quarter, line, status, search.
- Digital / On-Ground Tracking are views of Expenses. Every expense needs "what exactly was done".
- Conferences and Events: a new/edited item is posted automatically to Budget Tracking (lines "Conferences" / "Events") per product by the specialty split (Conference Shares). "⚖" sets a different split for one item by selecting products and %. Auto lines are marked AUTO and follow the item's approval status. Existing Excel conferences are NOT re-posted (their budget is already in the Expenses sheets).
- Quarters are calculated from the date everywhere (Jan-Mar = Q1 ...).

Other
- Tables: sticky header, totals row, quarter/line filters, Export, Quick add, Paste from Excel, inline editing.
- api/upload.js and @vercel/blob are kept (the UI uses direct links).
- First Admin login after deploy loads seed v4 once; rows you added or edited are kept.
