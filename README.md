# EcoPulse

Carbon footprint tracker with per-user emission forecasting.

Log trips and utility bills, see where your emissions come from, and get a
7-day forecast trained on your own history. Built as a full-stack project:
React frontend, FastAPI machine-learning service, Supabase Postgres.

**Live:** [eco-pulse-roan.vercel.app](https://eco-pulse-roan.vercel.app)

---

## Features

- **Trip and utility logging** — record travel by vehicle type and monthly
  electricity bills; emissions are computed per trip from vehicle-specific
  factors.
- **7-day emission forecast** — a RandomForest model trained per user on their
  own logged history, with day-of-week and rolling-average features.
- **Impact breakdown** — cumulative emissions by transport mode, energy
  benchmark against the monthly bill, and carbon-offset provider estimates.
- **AI advisor** — Google Gemini generates recommendations grounded in the
  user's own patterns, with a local statistical fallback when unavailable.
- **Challenges and leaderboard** — join preset challenges, track streaks, and
  compare scores. Points are awarded server-side (see Security below).
- **Progressive web app** — installable, works offline via a service worker.

---

## Architecture

```
Browser ──► Vercel            static React build
        ──► Supabase          auth, Postgres, row-level security
        ──► Render (FastAPI)  ML training/prediction + Gemini proxy
                          └─► Google Gemini
```

Supabase is called directly from the browser and is the source of truth for
user data. The FastAPI service exists for the two things that cannot run in a
browser or on serverless: scikit-learn, and a writable directory to persist
per-user model files.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Recharts |
| Data & auth | Supabase (Postgres, RLS, Auth) |
| ML service | Python 3.12, FastAPI, scikit-learn, pandas, joblib |
| AI | Google Gemini (via server-side proxy) |
| Hosting | Vercel (frontend), Render (backend) |

---

## Model evaluation

Run `python run_evaluation.py` to generate synthetic users, train a model per
user, and score it. Results land in `evaluation_results/`.

Representative run — 11 synthetic users, time-series train/test split (no
shuffling, so the model is always tested on days after the ones it trained on):

| Metric | Value |
|---|---|
| Mean absolute error | 0.6 kg CO₂ |
| Predictions within 2 kg | 96–97% |
| Predictions within 5 kg | 100% |
| R² (mean) | 0.33–0.39 |

Ranges, not fixed figures: `generate_test_data.py` synthesises a new random
cohort on each run, so numbers move between runs. R² is modest and varies
widely per user — daily emissions are noisy and some users have too few logged
days for the model to beat a simple mean. Absolute error is the more
meaningful metric at this data volume.

`evaluate.py` imports its feature engineering from `backend/ml/features.py`
rather than keeping a copy, so the evaluation always scores the same
transformations the deployed service applies.

---

## Security

Notes on the parts that are deliberate, since several are easy to get wrong:

- **No API keys in the browser.** Vite inlines every `VITE_*` value into the
  shipped JavaScript, so anything named that way is public. The Gemini key
  lives only on the backend; the frontend points the Google SDK at
  `/api/ai/*`, which attaches the real key server-side and requires a valid
  Supabase access token.
- **Points cannot be set by the client.** Row-level security authorises a
  *row*, not a column or a value, so RLS alone would let a user PATCH their own
  profile and pick any score. Blanket `UPDATE` on `profiles` is revoked and
  granted back per column, omitting `points`, `username` and `id`. Awards go
  through `award_points(source_type, source_id)`, a `SECURITY DEFINER`
  function that derives the amount server-side, verifies the referenced trip or
  bill belongs to the caller, and records it in `points_ledger` — where a
  unique constraint makes a repeated call a no-op rather than a second payout.
- **`user_id` is validated before touching the filesystem.** Model files are
  named after it, and `joblib.load` executes pickle opcodes, so an unvalidated
  id is a path-traversal into a code-execution sink.
- **Username is immutable** via a database trigger: it derives the auth email,
  so renaming would leave the account unreachable under its displayed name.
- Content-Security-Policy is generated at build time from the configured
  origins; the Font Awesome CDN link is pinned with Subresource Integrity.

`supabase/schema.sql` is the full schema including these policies.

---

## Local development

**Prerequisites:** Node 18+, Python 3.12, a Supabase project.

### 1. Frontend

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

`.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

VITE_ML_ENABLED=true
VITE_ML_API_URL=http://localhost:8000/api
VITE_ML_API_KEY=any_long_random_string

# Local development only. Never set this in a deployed build - it would ship
# in the bundle. Deployments use VITE_AI_PROXY_URL instead.
# VITE_GEMINI_API_KEY=your_gemini_key
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
export ML_API_KEY=any_long_random_string   # must match VITE_ML_API_KEY
export GEMINI_API_KEY=your_gemini_key
uvicorn app:app --reload --port 8000
```

If `ML_API_KEY` is unset the service generates a random one at startup and logs
it, so it fails closed rather than accepting a well-known default.

### 3. Database

Run `supabase/schema.sql` against your project (SQL Editor, or
`supabase db push`). It is idempotent and safe to re-run.

---

## Deployment

### Frontend (Vercel)

Build command `npm run build`, output directory `dist`. Environment variables:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | your Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | your Supabase anon key |
| `VITE_AI_PROXY_URL` | `https://<backend>.onrender.com/api/ai` |
| `VITE_ML_API_URL` | `https://<backend>.onrender.com/api` |
| `VITE_ML_API_KEY` | must match `ML_API_KEY` on the backend |
| `VITE_ML_ENABLED` | `true` |

`VITE_*` values are read at build time, so **redeploy after changing any of
them** — an existing deployment will not pick them up.

### Backend (Render)

Web service from this repo, **root directory `backend`**:

- Build: `pip install -r requirements.txt`
- Start: `uvicorn app:app --host 0.0.0.0 --port $PORT`

Environment variables:

| Variable | Purpose |
|---|---|
| `PYTHON_VERSION` | `3.12.9` — required; on 3.14 `pydantic-core` has no wheel and the Rust build fails |
| `GEMINI_API_KEY` | server-side Gemini key |
| `ML_API_KEY` | must match `VITE_ML_API_KEY` |
| `CORS_ORIGINS` | comma-separated frontend origins |
| `VITE_SUPABASE_URL` | used to verify access tokens on the AI proxy |
| `VITE_SUPABASE_ANON_KEY` | same |
| `SUPABASE_SERVICE_ROLE_KEY` | **required** — see below |

The service role key is not optional. This service reads rows on a user's
behalf, and the RLS policies grant access `to authenticated`; with the anon key
every query returns empty and training, prediction and clustering all report
"not enough data" regardless of how much the user logged. Copy it from Supabase
→ Project Settings → API. It bypasses RLS, so it must stay server-side and must
never be given a `VITE_` prefix.

**Diagnostics**

- `GET /api/health` — reports which credentials are configured (booleans only,
  never values), so a deployment can be checked without signing in.
- `GET /api/ai/selftest` — requires the `x-api-key` header; performs one minimal
  Gemini generation and reports whether the key actually works, since the proxy
  itself needs an end-user session.

---

## Known limitations

- **Challenges are per-browser.** They are stored in `localStorage` with no
  backend table, so a challenge is visible only to the user who has it. The
  create form is restricted to the owner account, but that is a UI restriction,
  not a security boundary.
- **Render's free tier sleeps.** The first request after a quiet period takes
  50–60 seconds. Model files also live on an ephemeral disk and are wiped on
  each deploy, so a user's model must be retrained after one.
- **Leaked-password protection is off** in Supabase Auth. It is a dashboard
  toggle and worth enabling.
- **No automated test suite.** Verification so far has been manual plus the ML
  evaluation harness.
