# MangaShelf

MangaShelf is an Expo/React Native reader and community client backed by a
Fastify/PostgreSQL API. The only built-in remote catalog is the documented
MangaDex API. The project contains no HTML source adapters, browser
impersonation, Cloudflare workarounds, hotlink headers, or offline chapter
downloads.

## Architecture

```text
Expo app ──HTTPS──> MangaShelf API ──JSON──> MangaDex API
    │                    │
    │                    └── PostgreSQL: accounts, sync, UGC, moderation
    └── SQLite: on-device library, history, progress, session
```

Manga titles, covers, and chapters remain the property of their respective
creators, publishers, scanlation groups, and uploaders. The app visibly
attributes MangaDex and links users to the corresponding MangaDex title page.

## Repository layout

- `api/` — Fastify API, MangaDex adapter, PostgreSQL cache, accounts, sync,
  reports, moderation, and public legal/deletion pages.
- `app/` — Expo SDK 54 Android/iOS client.

## Development

### API

```bash
cd api
npm install
cp .env.example .env
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
APP_USER_AGENT=MangaShelf/1.0 (support: support@your-domain.example)
SUPPORT_EMAIL=support@your-domain.example
DEVELOPER_LEGAL_NAME=Your legal developer name
```

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

## Safety and policy controls

- Current Terms acceptance is recorded server-side and required before UGC.
- Posts, comments, and profiles have report and block controls.
- Reports enter a moderator queue with dismiss, removal, warning, suspension,
  and ban actions plus an audit log.
- Banned users' content is excluded from public feeds.
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
