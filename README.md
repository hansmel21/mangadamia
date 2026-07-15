# Mangadamia

Mangadamia is an Expo/React Native reader and community client backed by a
Fastify/PostgreSQL API. Catalog content is aggregated from multiple sources
(the documented MangaDex API plus the Asura Scans and Weeb Central scrapers).
Scraping runs in a **separate `scraper/` service**, not inside the API — the
API consumes it over HTTP as a remote source, keeps a PostgreSQL cache, and
merges sources per canonical series so a title missing on one provider can be
read from another ("servers").

## Architecture

```text
Expo app ──HTTPS──> Mangadamia API ──HTTP(+key)──> Scraper service ──> MangaDex API
    │                    │                              └──> Asura / Weeb Central (HTML)
    │                    └── PostgreSQL: catalog cache, accounts, sync, UGC, moderation
    └── SQLite: on-device library, history, progress, session
```

Manga titles, covers, and chapters remain the property of their respective
creators, publishers, scanlation groups, and uploaders.

## Repository layout

- `api/` — Fastify API, remote-source adapters, PostgreSQL cache, accounts,
  sync, reports, moderation, and public legal/deletion pages.
- `scraper/` — standalone Fastify service that exposes the source adapters
  (MangaDex + Asura + Weeb Central) over an HTTP API guarded by a shared key.
- `app/` — Expo SDK 54 Android/iOS client.
- `console/` — web admin console (Vite/React SPA, served by the API).

## Development

Run the scraper and the API as two processes (plus Expo). Set the **same**
`SCRAPER_API_KEY` in both `scraper/.env` and `api/.env`.

### Scraper service

```bash
cd scraper
npm install
cp .env.example .env   # set SCRAPER_API_KEY to a long random value
npm run dev            # listens on :4000
```

Exercise an adapter against the live site in isolation:

```bash
npm run test:source asura           # or mangadex / weebcentral
```

### API

```bash
cd api
npm install
cp .env.example .env   # set SCRAPER_URL=http://localhost:4000 and the matching SCRAPER_API_KEY
npx prisma migrate dev
npm run dev
```

Required production variables:

```text
DATABASE_URL=postgresql://...
PORT=3000
NODE_ENV=production
TRUST_PROXY=true
ALLOWED_ORIGINS=https://your-web-client.example
APP_USER_AGENT=Mangadamia/1.0 (support: support@your-domain.example)
SUPPORT_EMAIL=support@your-domain.example
DEVELOPER_LEGAL_NAME=Your legal developer name
SCRAPER_URL=https://your-scraper-service.internal
SCRAPER_API_KEY=<same long random value as scraper/.env>
```

Deploy the scraper as its own service (e.g. a second Railway service pointed at
`scraper/`, `PORT` + `SCRAPER_API_KEY` set). The API reaches it over the
internal URL. If the scraper is down the API serves stale cache and failing
sources drop out of feeds — degradation is graceful, not fatal.

### App

```bash
cd app
npm install
npx expo start
```

Development automatically uses the Metro host on port 3000. Production builds
must define:

```text
EXPO_PUBLIC_API_URL=https://api.your-domain.example
EXPO_PUBLIC_SUPPORT_EMAIL=support@your-domain.example
EXPO_PUBLIC_LEGAL_BASE_URL=https://api.your-domain.example/legal
```

Create a Play AAB with the production EAS profile only after these variables
are configured:

```bash
npx eas build --platform android --profile production
```

Apply the additive social/quest migrations before starting a changed API:

```bash
cd api
npx prisma migrate deploy
npx prisma generate
```

Bootstrap the first Owner from a trusted machine with database access:

```bash
npm run owner:promote -- owner@example.com
```

Only Owners can grant control roles. Staff markers and cosmetic Titles never
grant permissions. See `GOOGLE_SERVICES_SETUP.md` for the external EAS/Firebase
credentials required to activate Android lock-screen push.

## Safety and policy controls

- Current Terms acceptance is recorded server-side and required before UGC.
- Posts, comments, and profiles have report and block controls.
- Reports enter a capability-based moderator queue with reasons, immutable
  snapshots, warnings, suspensions, bans, spoiler corrections, and appeals.
- Banned users' retained content uses an anonymized author identity.
- In-app and web account deletion remove associated account data.
- Public Terms, Privacy Policy, Community Guidelines, and deletion pages live
  under `/legal/*` on the API.
- Global and sensitive-route rate limits protect authentication and UGC.
- MangaDex discovery is restricted to its `safe` content rating.
- External links are not accepted in community posts or comments.

Before production, replace all placeholder contact/domain values, assign at
least two moderator accounts, document response coverage, deploy the public
legal pages, and complete the Play Console declarations in
`PLAY_COMPLIANCE.md`.
