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
   - `api-dev-server.sovandara.lol` → `api-gateway`, port `8080`, HTTPS
   - `realtime-dev-server.sovandara.lol` → `realtime`, port `8081`, HTTPS
6. Deploy. The `migrate` service applies pending migrations before the API starts.

Do not publish host ports for PostgreSQL, Redis, API, worker, gateway, or realtime. Dokploy routes
the three public services through Traefik, while database traffic stays on the
isolated Compose network.

## API load balancing

The API domain now targets `api-gateway`. This internal Traefik instance distributes
requests between `api:8080` and `api-replica:8080` using equal-weight round robin.
Dokploy's existing Traefik remains the public HTTPS endpoint. The internal gateway
uses a file provider and does not need access to the Docker socket or dashboard.

For an existing deployment, first publish the updated API image containing
`PROCESS_ROLE` support, then deploy the updated Compose file and change the API
domain's target from `api` to `api-gateway`. Keep the public API URL unchanged.
The gateway configuration is supplied through the Compose `api-load-balancer`
config from `deploy/traefik/api.yml`; redeploy when changing that file.

`api` and `api-replica` serve HTTP only. The private `worker` runs notifications,
reminders, event automations, and payment reconciliation, exposing only health
probes. Keep exactly one worker: the email sweep is not designed for concurrent
workers. All three processes share the database, Redis, JWT secret, and uploads.

See [load-balancing.md](./load-balancing.md) for the diagram, verification commands,
capacity limits, and failover behavior.

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
