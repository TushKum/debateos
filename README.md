# DebateOS

Full-stack DebateOS platform: one Node.js app that serves the website and the API.

| Feature | Page | Notes |
|---|---|---|
| Tournaments | `tournaments.html` | Live, searchable view of the Official Global Debating Spreadsheet (cached 10 min), DebateOS-hosted tournaments, and the original sheet embedded. |
| Timer & motion generator | `timer.html` | BP, WSDC, APD, CNPD (Canadian Parliamentary), LD, Policy, PF, Original Oratory. POI bells, prep timers and prep banks. 164 real motions from WUDC 2023–26, EUDC 2023–26, Australs 2026 and ABP 2026. |
| AI Arena | `arena.html` | Camera + mic, live transcription (Web Speech API), Claude as opponent, adjudication report, downloadable recording / transcript / report. |
| Debate network | `network.html` | Profiles with circuit roles (debater, adjudicator, IA, CAP, tab, equity, coach, organiser), connections, direct messages. |
| Tab hosting | `tab.html`, `t.html` | Teams, adjudicators, rooms with Google Meet + Discord links, power-paired draws (BP and two-team), panel allocation, ballots (staff or chairs via private links), standings, public tab, private team/adjudicator pages. |
| Resources | `resources.html` | WUDC manuals, Grand Final recordings, format rulebooks, motion banks. |
| Auth + admin | `auth.html`, `admin.html` | Sign up / login, login email alerts, stats, user management (admin, suspend), login activity, AI knowledge base, tournament list. |

## Project layout

```text
app.cjs                 startup file (cPanel / Passenger)
package.json
.env.example            every environment variable, documented
sql/schema.sql          database schema (idempotent)
scripts/migrate.js      applies sql/schema.sql
scripts/create-admin.js creates/updates the admin from ADMIN_EMAIL / ADMIN_PASSWORD
scripts/scrape-motions.py  refreshes public/assets/motions.json from official Tabbycat sites
src/server.js           Express app, security headers, static site
src/routes/*.js         auth, admin, sheet, network, ai, tab
src/ai/                 Claude client + adjudication principles
src/lib/draw.js         draw + adjudicator allocation
public/                 the website (plain HTML/CSS/JS, no build step)
```

## Run locally

Needs Node.js 20+ and a Postgres database.

```bash
cp .env.example .env      # fill in DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY, ...
npm install
npm run migrate
npm run create-admin
npm start                 # http://localhost:4000
```

## Deploy to Namecheap cPanel

1. **Database (Supabase).** In Supabase open *Connect → Session pooler* and copy the Postgres connection string. This is `DATABASE_URL`. (The Supabase REST URL and `sb_secret_…` key are not used by this app.)
2. **Upload.** In cPanel *File Manager*, create a folder such as `debateos-app` (outside `public_html`), upload `DebateOS.zip` and extract it there.
3. **Create the Node app.** cPanel → *Setup Node.js App* → *Create application*:
   - Node.js version: 20 or newer
   - Application mode: Production
   - Application root: `debateos-app`
   - Application URL: `debateos.online`
   - Application startup file: `app.cjs`
4. **Environment variables.** In the same screen add every variable from `.env.example` (`NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `RESEND_API_KEY`, `NOTIFICATION_EMAIL`, `ANTHROPIC_API_KEY`, `AI_DAILY_LIMIT`). `CORS_ORIGIN` is only needed if the API is served from another domain.
5. **Install + set up the database.** Click *Run NPM Install*. Then, under *Run JS script*, run `migrate` and then `create-admin` (or paste `sql/schema.sql` into the Supabase SQL editor and run `create-admin`).
6. **Start.** Click *Restart*. Visit `https://debateos.online/api/health` — it should return `{"ok":true}`. Log in with the admin email/password at `/auth.html`.
7. **HTTPS.** Make sure AutoSSL is active for the domain; camera and microphone only work over HTTPS.

If the app cannot reach Supabase, the hosting plan may block outbound Postgres ports (5432/6543). Ask Namecheap support to allow outbound connections to `*.pooler.supabase.com` on port 5432.

## AI Arena

- Uses the Claude API (`claude-opus-5`) with structured outputs and server-side refusal fallbacks. Get a key at console.anthropic.com and set `ANTHROPIC_API_KEY`.
- Each AI speech and each report is one API call. `AI_DAILY_LIMIT` caps calls per user per day (admins are exempt). Token usage is shown in the admin dashboard.
- "Training": the AI is not fine-tuned. It is grounded in a built-in summary of WUDC adjudication principles (`src/ai/knowledge.js`) plus anything admins add under *Admin → AI knowledge base* (e.g. notes on Grand Final videos, matter files, manual excerpts you have rights to use). That material is included in every request and prompt-cached.
- Live transcription uses the browser's speech recognition (Chrome, Edge, Safari). Other browsers can type speeches.
- Video/audio recordings never leave the user's device; only transcript text goes to the server.

## Tab notes

- BP needs a multiple of 4 teams, two-team formats an even number; add swing teams otherwise.
- Round 1 is random; later rounds are power-paired on points (then speaks), minimising repeated positions (BP) and rematches (two-team).
- Adjudicators are allocated by rating (best chairs to top brackets) while avoiding same-institution conflicts where possible; edit any panel manually.
- Each team and adjudicator has a private link (copy it from the Teams / Adjudicators tabs). Chairs can submit ballots from theirs until the round is marked complete.
- Google Meet rooms are created by the tab team (*Create a new Meet* button) and pasted per room; Discord uses an invite for the server and optional channel links per room.

## Refresh motions

```bash
npm run motions
```
