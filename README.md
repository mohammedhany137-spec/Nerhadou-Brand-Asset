# Nerhadou Asset (one app)
Sidebar: Brand Asset (dashboard, brands, matrix, 10 sections) · Tracking System (dashboard, approvals center, target, sales, budget, campaigns) · Conferences & Expenses (conference dashboard, conferences, conference shares, expenses dashboard, expenses) · Alerts · Audit Log.

- Brands (medicines): only the Marketing Director/Manager (admin) can add, edit or delete. Enforced in the UI and on the server.
- Conference shares: each conference is split over the products of its specialty using Conference Shares (editable %). New conference + specialty = automatic split. Filters by Speciality and Product on the Conferences page and the Conference Dashboard.
- Approvals: Product Managers' rows become Pending; the Director/Manager approves, rejects or requests changes (Approvals Center or each table).
- First Admin login after deploy loads the Excel data once (seed version 2), removes the cancelled brands (Vitro, Nerha D3), adds every product from the conferences workbook as a brand with its matrix. Rows you add yourself are kept on later re-seeds.
- Environment Variables unchanged. Old Brand Hub data (nerhadou:* keys) is not touched.
