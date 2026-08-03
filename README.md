# TheSouthShoreLine.com

Hyperlocal events calendar and weekly newsletter for Duxbury, Marshfield, Kingston, and Pembroke, MA. "Find it on the Line."

## Stack

- [Eleventy](https://www.11ty.dev/) (static site generator)
- A single Cloudflare Worker (`worker/index.js`), serving the built site as static assets and handling `/api/*` routes
- [Decap CMS](https://decapcms.org/) at `/admin/` for reviewing and editing event submissions
- Event data lives as individual Markdown files (front matter only) in `src/_events/`
- [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) on the public submission form
- Live tide predictions from NOAA CO-OPS (Duxbury Harbor, station 8446166), proxied through the Worker

## Local development

```
npm install
npm start          # eleventy --serve, http://localhost:8080
npm run cms        # in a second terminal — decap-server, so /admin/ works locally without GitHub
```

`src/admin/config.yml` has `local_backend: true`, so Decap CMS automatically writes straight to your files on disk when running on `localhost`. On the deployed site it uses real GitHub login instead — no config changes needed between the two.

## Adding events during development

Since no fake/sample events are committed to this repo, the site starts with a genuinely empty calendar. To see the event list, calendar grid, and town/category pages populated, either:

- create a file by hand in `src/_events/` following the schema below, with `status: approved`, or
- use `/admin/` locally (via `npm run cms`) to create one through the Decap UI.

## Event schema (`src/_events/*.md` front matter)

| Field | Type | Notes |
|---|---|---|
| title | string | |
| town | enum | Duxbury / Marshfield / Kingston / Pembroke |
| category | enum | Live Music, Restaurant Special, Family/Kids, Community/Civic |
| subtag | string, optional | e.g. "country," "farm-to-table" |
| audience | enum | Family/Kids, All Ages, 21+ |
| start_date | date | |
| end_date | date, optional | |
| recurrence_rule | object, optional | `{ frequency, days_of_week, season_start, season_end }` |
| time | string | |
| location | string | Venue name |
| address | string, optional | |
| description | text | 1–2 sentences |
| link | url, optional | |
| image | image, optional | |
| source_name | string | Submitter's name (internal only, never rendered publicly) |
| source_contact | string | Submitter's email/phone (internal only) |
| status | enum | pending / approved / rejected — only `approved` renders on the site |
| featured | boolean | Manual pin to top |

## Required secrets (not configured by this scaffold)

Set these as Worker secrets (`wrangler secret put NAME`) before deploying:

- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — GitHub OAuth App for Decap CMS login on the live site
- `GITHUB_TOKEN` — fine-grained personal access token, `contents:write` scoped to this repo only. Used by `/api/submit-event` to commit new pending-event files.
- `GITHUB_REPO` — `owner/repo` string for the above (set as a plain var, not a secret)
- `TURNSTILE_SECRET_KEY` — from the Cloudflare Turnstile widget for this site
- `TURNSTILE_SITE_KEY` — public key, goes directly in `src/submit/index.njk`, not a secret

## Moderation flow

1. A visitor submits the form at `/submit/`.
2. The Worker verifies the Turnstile token, validates the fields, and commits a new `status: pending` file to `src/_events/` via the GitHub API. That commit triggers a normal Cloudflare Pages/Workers build, and (if you're watching the repo) a GitHub notification email — no separate email service needed for v1.
3. Review pending events at `/admin/` (Decap CMS). Edit as needed, flip `status` to `approved` (or `rejected`), and save — Decap commits directly to `main`.
4. Approved events appear on the site on the next build and are eligible for the next Thursday newsletter.
