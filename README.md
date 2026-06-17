# SRE-Agent

Infrastructure deployment platform.

## Local development

| Service | URL |
|---------|-----|
| API | http://localhost:3001 |
| Web (user app) | http://localhost:3000 |
| Admin | http://localhost:3002 |

### Environment

Copy env examples and adjust as needed:

- `apps/api/.env` — set `CORS_ORIGIN=http://localhost:3000,http://localhost:3002` and `ADMIN_ORIGIN=http://localhost:3002`
- `apps/web/.env` — `NEXT_PUBLIC_API_URL=http://localhost:3001`
- `apps/admin/.env` — `NEXT_PUBLIC_API_URL=http://localhost:3001`, `NEXT_PUBLIC_USER_APP_URL=http://localhost:3000`

Leave `AUTH_COOKIE_DOMAIN` unset in local dev so the session cookie is shared across ports on `localhost`.

### Run

```bash
bun install
bun run db:generate
bun run dev
```

This starts the API, user app, and admin app in parallel.
