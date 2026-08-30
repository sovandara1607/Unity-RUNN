# Dokploy deployment: `dev-server`

This deployment uses `docker-compose.dokploy.yml` and keeps PostgreSQL, Redis,
and uploads private inside an isolated Dokploy Compose deployment.

## Dokploy setup

1. Create the `Unity-RUNN` project and a `dev-server` environment.
2. Add a Docker Compose service from the GitHub repository, branch `main`.
3. Set the Compose path to `./docker-compose.dokploy.yml` and enable isolated deployments.
4. Copy the variables from `deploy/dokploy.env.example` into the Compose Environment tab,
   replacing all required placeholder secrets.
5. Add these native Dokploy domains:
   - `dev-server.sovandara.lol` → `frontend`, port `3000`, HTTPS
   - `api-dev-server.sovandara.lol` → `api`, port `8080`, HTTPS
   - `realtime-dev-server.sovandara.lol` → `realtime`, port `8081`, HTTPS
6. Deploy. The `migrate` service applies pending migrations before the API starts.

Do not publish host ports for PostgreSQL, Redis, API, or realtime. Dokploy routes
the three public services through Traefik, while database traffic stays on the
isolated Compose network.

## Persistence and backups

The stack uses named volumes `postgres_data`, `redis_data`, and `event_uploads`.
Configure Dokploy volume backups to an S3-compatible destination. Also schedule
a nightly logical PostgreSQL backup; a raw live-volume snapshot is not a substitute
for `pg_dump`.

For durable media independent of this server, set `OBJECT_STORAGE_PROVIDER=r2`
and fill in all `R2_*` values. Until then, uploads persist in `event_uploads`.

## Production promotion

Keep this environment on `APP_ENV=staging` with `PAYMENT_PROVIDER=mock`. Before a
real launch, configure Bakong and SMTP, change `APP_ENV=production`, and verify the
Telegram webhook and Google OAuth callback URLs against the public domains.
