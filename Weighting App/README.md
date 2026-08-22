# Survey weighting tool

A browser-based raking (iterative proportional fitting) tool. Upload individual-level
survey data as a CSV, map it onto seven fixed demographic/political variables, set
target population shares with linked sliders, and export the data with a computed
weight column. All parsing and weighting happens client-side — the CSV never leaves
the browser, so there's nothing for the password gate below to protect except access
to the page itself.

Variables: race/ethnicity (5 categories), age (6: 18-24 through 65+), education (5),
gender (3), party identification (4), ideology (3), and vote choice in the previous
presidential election (4). Age auto-detects whether its source column is a raw number
or already-binned text; every other variable gets a value-mapping table so you can
point each raw response at the right fixed category (or exclude it).

Known limit carried over from the earlier version: raking is done sequentially,
one margin at a time, not as simultaneous fits across all variables — standard for
a raking implementation, but worth knowing with seven margins active at once, sparse
cells, or targets far from the sample. The diagnostics panel (convergence, design
effect, effective N) will tell you if it's struggling.

## Files

- `index.html`, `styles.css`, `app.js` — the app itself. No build step, no framework.
- `functions/_middleware.js` — a Cloudflare Pages Function that password-protects
  the entire site (see below). Runs in front of every request, including the
  static files.

## Deploying

**1. Push this to a new GitHub repo** (public or private — doesn't matter, since the
site won't be served *from* GitHub Pages).

**2. Connect it to Cloudflare Pages**, which is what actually hosts and protects it:

- Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
- Pick the repo
- Framework preset: **None**. Build command: leave blank. Build output directory: `/`
- Deploy

This gives you the same "push to GitHub, auto-deploy" workflow as GitHub Pages, on
Cloudflare's free plan, which covers unlimited sites and bandwidth — plain GitHub
Pages can't run the password check at all, which is the reason for this extra step.

**3. Set the password** — Pages project → **Settings** → **Environment variables**:

| Variable | Required | Notes |
|---|---|---|
| `SITE_PASSWORD` | yes | the shared password |
| `SITE_USER` | no | username, defaults to `user` |

Add these to the **Production** environment (and **Preview** too, if you want preview
deployments protected as well). If the password doesn't seem to take effect
immediately, retry the deployment from the dashboard — Functions pick up new
variables on the next deploy.

**4. Turn on "fail closed"** — Pages project → **Settings** → **Functions** →
failure mode → **Fail closed**. Functions run on Cloudflare's free tier (100,000
requests/day, far more than this will ever see), but if that were ever exceeded,
fail closed means the site blocks access rather than quietly serving unprotected.

That's it — visiting the site now prompts for the username/password in the browser's
own login dialog before anything loads.

### Changing or rotating the password

Update `SITE_PASSWORD` in the same **Settings → Environment variables** screen, then
retry the deployment.

### If you'd rather have named logins than one shared password

Swap this Function for **Cloudflare Access** instead (Pages project → **Settings** →
**General** → put the domain behind Access): free for up to 50 individual logins,
configured entirely in the dashboard, no code. `functions/_middleware.js` can be
deleted in that case.
