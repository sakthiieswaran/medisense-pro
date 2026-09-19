# MediSense server

A small Express API that gives the MediSense app real user accounts and
persistent data storage, instead of only the browser's localStorage.

- **Credentials**: passwords are hashed with `bcryptjs` before they're ever
  written to disk. Sessions are signed JWTs (7-day expiry).
- **Data**: each account gets its own key/value store, persisted to
  `server/data/store.json`. The shape mirrors the frontend's `window.storage`
  API exactly (`get` / `set` / `delete` / `list` by key), so the app doesn't
  need any special-case code to use it.
- **Storage engine**: plain JSON files with atomic (`tmp file + rename`)
  writes, serialized per file so concurrent requests can't corrupt them.
  This is intentionally simple and is fine for personal use, a class
  project, or a small number of users. For anything with real concurrent
  traffic, swap `readJSON`/`writeJSON` in `index.js` for a real database —
  the rest of the routes don't need to change.

## Running it

```bash
cd server
npm install
cp .env.example .env    # then edit JWT_SECRET to a real random value
npm start                # or `npm run dev` to auto-restart on changes
```

The server listens on `http://localhost:4000` by default.

Generate a strong `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Connecting the frontend

The frontend (in `src/`) works completely fine with **no backend running at
all** — it falls back to localStorage automatically, exactly like before.

To enable real accounts and cross-device sync:

1. Start this server (above).
2. In the frontend project root, create `.env` with:
   ```
   VITE_API_URL=http://localhost:4000
   ```
   (This is optional if you're running both on `localhost` with the default
   port — `src/apiStorage.js` already defaults to `http://localhost:4000`.)
3. In the running app, open **Profile & Settings → Account Sync**, and
   create an account or sign in. From then on:
   - Every `window.storage.set(...)` call also mirrors to the server
     (best-effort — it never blocks or breaks the local save).
   - Every `window.storage.get(...)` call tries the server first and falls
     back to localStorage if the server is unreachable.
   - Signing into the same account on a second device pulls that account's
     data down automatically the next time the app loads.

## API reference

All request/response bodies are JSON. Authenticated routes expect
`Authorization: Bearer <token>`.

| Method | Path                | Auth | Body                          | Notes                                  |
|--------|---------------------|------|--------------------------------|-----------------------------------------|
| GET    | `/api/health`       | no   | —                               | Liveness check                          |
| POST   | `/api/auth/register`| no   | `{ name, email, password }`     | Password must be ≥ 8 characters         |
| POST   | `/api/auth/login`   | no   | `{ email, password }`           |                                          |
| GET    | `/api/me`           | yes  | —                               | Returns the current user                |
| GET    | `/api/data`         | yes  | —                               | `?prefix=` filters keys by prefix       |
| GET    | `/api/data/:key`    | yes  | —                               | 404 if the key doesn't exist            |
| PUT    | `/api/data/:key`    | yes  | `{ value }` (`value` is a string)| Value capped at 5MB                     |
| DELETE | `/api/data/:key`    | yes  | —                               |                                          |

## Security notes

- Change `JWT_SECRET` before running this anywhere other than your own
  machine — the fallback in `index.js` is intentionally insecure and logs a
  warning if you forget.
- `CORS_ORIGIN` defaults to `*` for local development. Set it to your actual
  frontend origin before deploying.
- There's no rate limiting on `/api/auth/*` in this minimal version — add
  `express-rate-limit` (or a reverse-proxy rule) before exposing this
  publicly.
