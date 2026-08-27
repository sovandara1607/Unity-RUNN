# Unity Runn Club frontend

Next.js 16 Pages Router application for runners and race-control staff.

## Local development

Start PostgreSQL, Redis, the Go API, and the Socket.IO gateway from the repository root:

```bash
docker compose up -d --build
make migrate
make seed
```

Then start the frontend:

```bash
cd frontend
npm install
npm run dev
```

- Frontend: http://localhost:3000
- API: http://localhost:8080
- Socket.IO health: http://localhost:8081/health
- Override the API URL with `NEXT_PUBLIC_BASE_URL` when needed.
- Override the realtime URL with `NEXT_PUBLIC_REALTIME_URL` when needed. Copy
  `.env.example` to `.env.local` to persist frontend overrides.

## Checks

```bash
npm run lint
npm run build
```

The app uses client-side API calls, a short-lived JWT access token, and an
HttpOnly rotating refresh-token cookie. Participant QR codes contain the stable
registration number; STAFF+ authentication, event matching, confirmed status,
and a database uniqueness constraint protect check-in.

Super Admins can inspect sanitized runtime configuration and dependency health
at `/admin/system`. The page never receives credential values; it only shows
whether protected settings are configured.
