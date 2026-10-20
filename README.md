# Brand Asset Library (Vercel)
Separate project from Nerhadou Brand Hub. Same login model, search (Ctrl+K), dark mode, audit log, drafts/approvals, filters, Excel import/export.

## Deploy (free)
1. New GitHub repo -> upload these files. 2. Vercel -> Add New Project -> import that repo (no build settings needed).
3. Environment Variables: SESSION_SECRET (NEW random value), ADMIN_EMAILS, ADMIN_PASSWORD, GPM_EMAILS, GPM_PASSWORD, USER_PASSWORD, ALLOWED_DOMAIN, optional USER_BRANDS, plus the Upstash Redis variables (can be the same database as the Hub: data is separated by the key prefix `assetlib:`).
4. Domain: Vercel gives a free `<name>.vercel.app` address (Project -> Settings -> Domains). A custom domain needs to be bought.

## v2: sections, uploads, dashboard
- 10 sections exactly as in the planning sheet (01_Brand_Master ... 09_CURRENT_APPROVED, 99_Archive), each with Purpose and Record guidance.
- File upload (any file type, several at once) uses Vercel Blob: in Vercel -> Storage -> Create -> Blob -> connect to this project (adds BLOB_READ_WRITE_TOKEN), then Redeploy. Alternatively paste a direct Drive/SharePoint link on any row.
- No approval flow. Rows can be copied to 09_CURRENT_APPROVED (star) or moved to 99_Archive (box).
