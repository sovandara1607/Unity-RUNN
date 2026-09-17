# Client preview on Dokploy

This deployment uses `docker-compose.dokploy.yml` and keeps PostgreSQL, Redis,
and uploads on a project-scoped Docker network.

The client-facing name is **Unity RUNN Preview**. The test link is
`https://preview.sovandara.lol`; the API and Socket.IO use
`api-preview.sovandara.lol` and `realtime-preview.sovandara.lol`.

## Create the staging stack

1. Point DNS records for `preview.sovandara.lol`,
   `api-preview.sovandara.lol`, and `realtime-preview.sovandara.lol` to the
   Dokploy server.
2. The **Publish client preview images** GitHub Actions workflow runs on each
   push to `client-preview` (and can be started manually). It publishes the API,
   realtime, and frontend images with the `client-preview` tag. The frontend
   image is built with the preview API and realtime URLs.
3. Create a `Unity-RUNN` project with a `client-preview` environment in Dokploy.
   Add a Docker Compose service named `Unity RUNN Preview` from this repository's
   `client-preview` branch. Set the Compose path to `./docker-compose.dokploy.yml` and
   set Dokploy's trigger type to **On Tag**. The Compose file defines a
   project-scoped `runn` network; leave Dokploy's deprecated isolated-deployment
   switch off.
4. Copy [`dokploy.client-preview.env.example`](./dokploy.client-preview.env.example)
   into the Compose Environment tab. Replace the three required secret
   placeholders with unique values. Keep `APP_ENV=staging` and
   `PAYMENT_PROVIDER=mock`.
5. Add these HTTPS domains to that Compose service:
   - `preview.sovandara.lol` → `frontend`, port `3000`
   - `api-preview.sovandara.lol` → `api-gateway`, port `8080`
   - `realtime-preview.sovandara.lol` → `realtime`, port `8081`
6. Check Dokploy's Compose preview: all services should share the project-scoped
   `runn` network, and only the three domain targets should join Dokploy's
   public routing network. Then deploy. The `migrate` service applies pending
   migrations before the API starts.
7. Save the Compose service's deployment webhook URL as the GitHub Actions
   repository secret `DOKPLOY_COMPOSE_WEBHOOK` and enable Dokploy Auto Deploy.
   Keep its trigger type **On Tag**: Dokploy will not deploy on an early branch
   push, while the workflow calls the Compose webhook after all three images
   are published. The workflow sends the `client-preview` branch in its webhook
   payload.

To promote changes from `main` for client testing, fast-forward the preview
branch and push it:

```sh
git fetch origin
git switch client-preview
git merge --ff-only origin/main
git push origin client-preview
```

That push publishes all three images and triggers Dokploy only after they are
ready. Pushes to `main` alone do not change the client preview.

PostgreSQL and Redis bind only to the Dokploy server's loopback interface for
SSH tunneling. Do not bind their ports to a public interface. Dokploy routes
the three public services through Traefik; API and worker ports stay private.

## Make the preview testable

The new database has no events or administrator account. From the running
`api` container's terminal in Dokploy, run `./seed -events-only` to create or
refresh the **Unity RUNN Preview Run** sample event without creating users.
The ordinary `./seed` command creates accounts with fixed demo passwords and
is blocked outside development. Give client testers their own accounts and
keep test payments on the mock provider.

Register an operator account through the site, then promote that account to
`SUPER_ADMIN` through the private database console before using the admin
panel to create more events.

From the `postgres` container's terminal, connect with
`psql -U unity -d unity_run_club` and run this once, replacing the email with
the operator account you just registered. Confirm that exactly one row was
updated:

```sql
UPDATE users SET role = 'SUPER_ADMIN'
WHERE email = 'operator@example.com'
  AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'SUPER_ADMIN');
```

Check the client site and its dependencies:

```sh
curl -fsS -o /dev/null https://preview.sovandara.lol/
curl -fsS https://api-preview.sovandara.lol/ready
curl -fsS https://realtime-preview.sovandara.lol/health
```

Share `https://preview.sovandara.lol` after those checks and a browser pass
through the event, registration, and sign-in flows.

## API load balancing

Set the API domain to target `api-gateway`. This internal Traefik instance distributes
requests between `api:8080` and `api-replica:8080` using equal-weight round robin.
Dokploy's existing Traefik remains the public HTTPS endpoint. The internal gateway
uses a file provider and does not need access to the Docker socket or dashboard.

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

## Remote database access

The Dokploy host listens on `127.0.0.1:15432` for PostgreSQL and
`127.0.0.1:16379` for Redis. These ports are not reachable directly from the
internet. From a laptop with SSH access to the server, keep this tunnel open:

```sh
ssh -N -L 15432:127.0.0.1:15432 -L 16379:127.0.0.1:16379 <ssh-user>@2.28.16.106
```

Connect a local database client to PostgreSQL at `127.0.0.1:15432` with
database `unity_run_club`, user `unity`, and the staging `POSTGRES_PASSWORD`.
Connect a Redis client to `127.0.0.1:16379` with the staging `REDIS_PASSWORD`.
The default host ports can be changed with `POSTGRES_TUNNEL_PORT` and
`REDIS_TUNNEL_PORT` in Dokploy's Compose environment; update the tunnel command
to match. Never share the staging passwords with client testers.

## Production deployment

Keep this client-preview environment on `APP_ENV=staging` with
`PAYMENT_PROVIDER=mock`. For a real launch, create a separate production
environment with its own database and secrets, configure Bakong and SMTP, and
verify the Telegram webhook and Google OAuth callback URLs against its public
domains.
