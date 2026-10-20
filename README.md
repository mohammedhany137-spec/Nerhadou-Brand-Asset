# Brand Asset Library (Vercel)
Separate project from Nerhadou Brand Hub. Same login model, search (Ctrl+K), dark mode, audit log, drafts/approvals, filters, Excel import/export.

## Deploy (free)
1. New GitHub repo -> upload these files. 2. Vercel -> Add New Project -> import that repo (no build settings needed).
3. Environment Variables: SESSION_SECRET (NEW random value), ADMIN_EMAILS, ADMIN_PASSWORD, GPM_EMAILS, GPM_PASSWORD, USER_PASSWORD, ALLOWED_DOMAIN, optional USER_BRANDS, plus the Upstash Redis variables (can be the same database as the Hub: data is separated by the key prefix `assetlib:`).
4. Domain: Vercel gives a free `<name>.vercel.app` address (Project -> Settings -> Domains). A custom domain needs to be bought.
