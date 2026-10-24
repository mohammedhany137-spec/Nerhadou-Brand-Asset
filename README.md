# Nerhadou Marketing Hub (one app, one sidebar)
Designed by Nerhadou Marketing Team · Developed by Mohamed Hany

Sidebar: Brand Asset (dashboard, brands, matrix, Pipelines*, 10 file sections - link-only) · Tracking System (dashboard, approvals center, Budget, Digital, On-Ground, Campaign Calendar) · Editable Inputs (Sales Entry, Targets, conferences, events, conference shares, expenses dashboards and expenses) · System (Alerts*, Audit Log*).
* Director/Manager (admin) only. The server does not even send Pipelines to other users.

Linking (one source of truth = Expenses)
- Budget Tracking: planned lines; open a line to see every item (date, month, quarter, what exactly was done, cost). Filters: month, quarter, line, status, search.
- Budget, Digital and On-Ground Tracking are read-only views. Edit source records from Expenses, Events or Conferences.
- Conferences and Events: a new/edited item is posted automatically to Budget Tracking (lines "Conferences" / "Events") per product by the specialty split (Conference Shares). "⚖" sets a different split for one item by selecting products and %. Auto lines are marked AUTO and follow the item's approval status. Existing Excel conferences are NOT re-posted (their budget is already in the Expenses sheets).
- Quarters are calculated from the date everywhere (Jan-Mar = Q1 ...).

Other
- Tables: sticky header, totals row, quarter/line filters, Export, full add/edit forms, Paste from Excel and inline editing on editable inputs.
- api/upload.js and @vercel/blob are kept (the UI uses direct links).
- First Admin login after deploy loads seed v4 once; rows you added or edited are kept.

v5 notes
- Table headers float at the top of the screen while you scroll the page (and follow horizontal scroll).
- File sections: link by link (full add form). No bulk paste, no file chooser. api/upload.js is kept but unused.
- "Owner" is now "Product Manager". GM % removed. Events types: RTD, CME, Symposium, Workshop, Webinar, Consumer, Other.
- Safety: the app never saves before the first successful load; the server refuses to replace existing data with an empty list; load errors show a red banner with the exact reason and a Retry button; polling is every 2 minutes (and when you return to the tab) to save Redis requests.
- Director tools (🛠): download a full backup, restore a backup, reload the Excel data.


V9 requested refinements
- Removed Quick add bars across the app.
- Budget, Digital and On-Ground tracking pages are read-only; edits belong in the source entry pages.
- Events capture a selected activity and itemized cost components; product split can be customized by selecting products and allocation percentages. Event allocations post to Budget and Expenses automatically.
- Target field labels now say In-market units.
