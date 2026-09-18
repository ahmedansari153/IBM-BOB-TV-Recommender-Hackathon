# 📺 TV Show Recommender

A social TV show recommendation app built for the IBM Bob Hackathon.

---

## What it does

- Builds a **taste profile** from an 8-question onboarding flow
- Sends **scheduled TV show recommendations** using a rule-based scoring engine against the [TVDB v4 API](https://thetvdb.github.io/v4-api/)
- Shows a **US map** of what people around your zip code are being recommended
- **Friends system** — add friends via username search, QR code, or share link
- **Promote** a show to a friend with a push notification
- **Rock Paper Scissors** — challenge a friend to settle what to watch, with real-time state sync via Supabase Realtime

---

## Tech Stack

| Layer | Tool |
|---|---|
| Mobile | Expo + React Native (iOS + Android) |
| Auth | Supabase Auth (Google + Apple) |
| Database | Supabase PostgreSQL |
| Real-time | Supabase Realtime (RPS state sync) |
| Scheduled Jobs | pg_cron |
| Server Logic | Supabase Edge Functions (Deno) |
| Push Notifications | Expo Push API |
| TV Data | TVDB v4 API |

---

## Project Structure

```
.
├── app/                        # Expo/React Native frontend (to be scaffolded)
├── supabase/
│   ├── functions/
│   │   ├── generate-recommendation/   # Scoring engine + push
│   │   ├── get-recommendations-near-zip/ # Map data
│   │   ├── friends/                   # Friend requests
│   │   ├── promote-show/              # Show promotions
│   │   ├── rps/                       # RPS game (initiate/accept/choose)
│   │   └── expire-rps-matches/        # Cron-called expiry job
│   └── migrations/
│       └── 0001_initial_schema.sql    # Full DB schema + RLS + pg_cron setup
├── docs/
│   ├── architecture.html              # Full system architecture one-pager
│   └── frontend-handoff.html          # Frontend component handoff for designers
├── .env.example                       # Required environment variables
└── README.md
```

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/ahmedansari153/IBM-BOB-TV-Recommender-Hackathon.git
cd IBM-BOB-TV-Recommender-Hackathon
```

### 2. Set up environment variables

```bash
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, TVDB_API_KEY
```

Get your Supabase keys from [app.supabase.com](https://app.supabase.com) → Project Settings → API.  
Get a free TVDB API key at [thetvdb.com/api-information](https://thetvdb.com/api-information).

### 3. Database

The schema is already applied to the Supabase project via migration.  
To re-apply locally or to a fresh project:

```bash
supabase db push
# or apply supabase/migrations/0001_initial_schema.sql manually
```

### 4. Edge Functions

Functions are deployed to Supabase. To redeploy:

```bash
supabase functions deploy generate-recommendation
supabase functions deploy get-recommendations-near-zip
supabase functions deploy friends
supabase functions deploy promote-show
supabase functions deploy rps
supabase functions deploy expire-rps-matches
```

Set secrets in Supabase dashboard → Edge Functions → Secrets:
- `TVDB_API_KEY`

### 5. Frontend

```bash
cd app
npm install
npx expo start
```

> The `app/` directory is to be scaffolded. See [`docs/frontend-handoff.html`](docs/frontend-handoff.html) for the full component spec.

---

## API Reference

### Edge Functions

| Function | Method | Path | Auth |
|---|---|---|---|
| Generate recommendation | POST | `/generate-recommendation` | Service role (cron) |
| Map pins | GET | `/get-recommendations-near-zip?lat=&lng=` | JWT |
| Send friend request | POST | `/friends/send` | JWT |
| Respond to friend request | POST | `/friends/respond` | JWT |
| Promote a show | POST | `/promote-show` | JWT |
| Initiate RPS | POST | `/rps/initiate` | JWT |
| Accept RPS | POST | `/rps/accept` | JWT |
| Submit RPS choice | POST | `/rps/choose` | JWT |
| Expire stale matches | POST | `/expire-rps-matches` | Service role (cron) |

---

## Database Schema

5 tables, all with Row Level Security enabled:

- **`profiles`** — User data, taste profile, push token, notification interval
- **`friends`** — Bidirectional friendships (`pending` → `accepted` / `declined`)
- **`recommendations`** — Per-user show picks with zip code for map queries
- **`promotions`** — Friend-to-friend show nudges
- **`rps_matches`** — Full RPS game state (`pending` → `accepted` → `choosing` → `resolved` / `expired`)

---

## Recommendation Scoring

No LLM — fully deterministic, free, and fast.

| Signal | Points |
|---|---|
| Genre match (per genre) | +3 |
| Year range match | +2 |
| Network/platform match | +2 |
| Status match (ongoing/ended) | +1 |
| Language match | +1 |
| Already recommended | −999 |

---

## Real-time RPS

The `rps_matches` table is published to Supabase Realtime. Both players subscribe to their match row by ID. When the server resolves the winner, both clients receive the update simultaneously and start the 3-2-1 countdown locally. Push notifications serve as a fallback when either player is backgrounded.

---

## Built with

[IBM Bob](https://ibm.com/bob) + [Supabase](https://supabase.com) + [Expo](https://expo.dev) + [TVDB](https://thetvdb.com)
