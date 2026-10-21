# Nerhadou Asset (one app)
One sidebar: Brand Asset (dashboard, brands, matrix, 10 sections) + Tracking System (tracking dashboard, approvals center, target, sales, budget, campaigns) + Conferences & Expenses (2 dashboards + data) + Alerts + Audit Log.
- Brand filter (top right) is multi-select: all brands, one brand, or several. Dashboards, tables and alerts follow it.
- Approvals: Product Managers' new/edited rows become Pending; Marketing Director/Manager (ADMIN_EMAILS) approve, reject or request changes from the Approvals Center or each table.
- The first Admin login seeds the Excel data (targets, budget breakdown, sales, expenses, conferences) into Redis once. After that Redis is the source of truth.
- Same Environment Variables as before. Old Brand Hub data (nerhadou:* keys) is not touched or migrated.
