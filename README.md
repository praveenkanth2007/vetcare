# VetCare Pro — Backend + Database + Frontend

Your existing VetCare Pro frontend (`frontend/index.html`) is now connected to a
real Node.js + Express + PostgreSQL backend with JWT auth and bcrypt password
hashing. The UI, IDs, styling, and every existing feature are untouched —
only the data layer changed (localStorage → REST API).

## What changed in the frontend, and what didn't

**Unchanged:** every element ID, every screen, the wizard, the sidebar, the
dashboard cards, charts, animal analytics, Excel export, colors, language
switcher — all identical to your original file.

**Changed:** the handful of functions that used to read/write
`localStorage` now call the backend instead:
- `handleLogin` / `handleSignup` / `handleLogout` → `POST /api/auth/login`, `/register`
- `fetchDatabase()` → `GET /api/admissions` (returns only *your* records)
- `handleRegistration()` → `POST /api/admissions`
- `handleEditSave()` → `PUT /api/admissions/:id`
- `handleDeleteConfirm()` → `POST /api/auth/verify-password` then `DELETE /api/admissions/:id`
- `submitRecordPayment()` / `markPaymentAsPaid()` → `POST /api/payments/:id/pay` / `/mark-paid`
- vet profile save/load → `GET/PUT /api/auth/profile`

Everything else (dashboard totals, animal analytics, pending payments,
records table, reports) still runs exactly as before, purely in the
browser — it just now operates on data that was fetched from the API
instead of from `localStorage`, so it is automatically per-doctor.

## Project layout

```
backend/
├── server.js              Express app entrypoint, CORS, /api/health
├── db.js                  PostgreSQL connection pool
├── package.json
├── .env.example
├── db/
│   ├── schema.sql          Full table definitions (doctors, owners, animals, services, admissions, payments, payment_transactions)
│   └── migrate.js          Runs schema.sql against DATABASE_URL
├── middleware/
│   └── auth.js             JWT verification — this is the ONLY place doctorId comes from
├── controllers/
│   ├── auth.controller.js
│   ├── admissions.controller.js
│   ├── payments.controller.js
│   ├── dashboard.controller.js
│   └── analytics.controller.js
└── routes/
    ├── auth.routes.js
    ├── admissions.routes.js
    ├── payments.routes.js
    ├── dashboard.routes.js
    └── analytics.routes.js

frontend/
└── index.html              Your original UI, wired to the API above
```

## Database schema

```
doctors ──< owners ──< animals
   │                       │
   └──────< admissions >───┘──< payments ──< payment_transactions
                │
                └── services (lookup, by purpose/status)
```

Every clinical table (`owners`, `animals`, `services`, `admissions`,
`payments`, `payment_transactions`) has a `doctor_id` column with an index,
and **every query in every controller filters on it**. `doctor_id` is read
exclusively from `req.doctorId`, which `middleware/auth.js` sets from the
verified JWT — no controller ever reads a doctor id from the request body,
query string, or URL. Attempts to access another doctor's admission by ID
return `404 Not Found` (not 403), so IDs can't even be used to confirm another
doctor's record exists.

## Running it locally

### 1. PostgreSQL
```bash
# create a database (adjust to your local Postgres setup)
createdb vetcare
```

### 2. Backend
```bash
cd backend
cp .env.example .env
# edit .env: set DATABASE_URL to your local Postgres connection string,
# and JWT_SECRET to any long random string
npm install
npm run migrate     # creates all tables
npm start           # starts the API on http://localhost:4000
```

Check it's alive: `curl http://localhost:4000/api/health` → `{"status":"ok","db":"connected",...}`

### 3. Frontend
Open `frontend/index.html` directly in a browser, or serve it with any
static server (e.g. `npx serve frontend`). It talks to
`http://localhost:4000/api` by default (see the `API_BASE` constant near
the top of the `<script>` block) — set `window.VETCARE_API_BASE` before
that script runs if you need to point it elsewhere.

## Testing performed

This was actually run, not just written — see the full transcript, but in short:

- ✅ Backend started against a real local PostgreSQL 16 instance; `npm run migrate` created every table.
- ✅ Registered two separate doctor accounts (`dr.ananya`, `dr.rahul`) via `curl`, confirmed bcrypt hashing, JWT issuance, wrong-password rejection, duplicate-username rejection.
- ✅ Doctor A created admissions (Cow + Dog) with fee/discount/payment math verified (`total = fee - discount`, `pending = total - received`).
- ✅ Doctor B's admissions list, dashboard summary, and pending-payments endpoints all returned clean **zeros/empty arrays** with zero setup — no manual seeding needed to prove isolation.
- ✅ Doctor B attempting `PUT`/`DELETE`/`POST .../pay` against Doctor A's admission ID directly returned **404 Not Found**.
- ✅ Species analytics (`/api/analytics/animals/Cow`) correctly returned nothing for Doctor B despite Doctor A having a Cow record.
- ✅ Payment recording, payment history, mark-as-paid, edit, and delete-with-password-reauth all verified via the API.
- ✅ The **actual connected `frontend/index.html`** was then loaded in a headless DOM (jsdom) and driven exactly like a browser would: sign-up → onboarding profile → admission wizard → dashboard metrics → record a payment → mark as paid → open animal analytics. No JavaScript errors; every screen reflected the real backend data.
- ✅ A second, independent doctor session was created in the same run and confirmed, through the real UI (not raw API calls): a brand-new doctor sees `0` patients / `₹0` revenue / `₹0` pending before creating anything, their own admissions don't appear in doctor A's list on re-fetch, and Doctor B's Cow-analytics screen has no trace of Doctor A's cow.

## Deploying

### Database → Neon
1. Create a project at neon.tech, copy the connection string (it will look like `postgres://user:password@ep-xxxx.region.aws.neon.tech/dbname?sslmode=require`).
2. Run the schema against it: `DATABASE_URL="<neon-url>" node backend/db/migrate.js` (run this from your machine once, with `PGSSL=true` in your environment or simply because the URL isn't `localhost` — `db.js` auto-enables SSL for any non-localhost host).

### Backend → Render
1. Push the `backend/` folder to a Git repo.
2. New → Web Service on Render, point it at that repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Environment variables: `DATABASE_URL` (from Neon), `JWT_SECRET` (long random string), `NODE_ENV=production`, `CLIENT_ORIGIN` (your Netlify URL, e.g. `https://vetcare-pro.netlify.app`), `PGSSL=true`.
5. Once deployed, confirm `https://<your-render-app>.onrender.com/api/health` returns `{"status":"ok"}`.

### Frontend → Netlify
1. Before deploying, set the API base in `frontend/index.html` — either edit the `API_BASE` constant directly, or add a tiny inline script before it: `<script>window.VETCARE_API_BASE = 'https://<your-render-app>.onrender.com/api';</script>`.
2. Drag-and-drop the `frontend/` folder onto Netlify (or connect the repo), no build step needed — it's a static file.
3. Add that Netlify URL to the backend's `CLIENT_ORIGIN` env var on Render and redeploy the backend so CORS allows it.

### Environment variables reference
| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Render | Postgres connection string from Neon |
| `JWT_SECRET` | Render | Signs/verifies login tokens — keep secret, rotate to invalidate all sessions |
| `PORT` | Render | Render sets this automatically; `server.js` falls back to 4000 locally |
| `CLIENT_ORIGIN` | Render | Comma-separated list of allowed frontend origins for CORS |
| `NODE_ENV` | Render | `production` on Render, `development` locally |
| `PGSSL` | Both | Force SSL on/off; Neon needs `true` |

## Security notes
- Passwords are hashed with bcrypt (10 salt rounds) — plaintext passwords are never stored or logged.
- JWTs expire after 7 days; expired/invalid tokens get a clean 401 and the frontend drops back to the login screen.
- The delete-confirmation flow re-verifies the doctor's own username + password server-side (`/api/auth/verify-password`) before allowing a delete — it cannot be used to authenticate as a different account.
- CORS is restricted to the origins listed in `CLIENT_ORIGIN` (default `*` for local development only — set this explicitly in production).
