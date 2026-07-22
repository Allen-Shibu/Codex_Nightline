# CivicPulse

Community-powered civic issue board for Kochi. Residents report nearby issues, confirm reports, and verify when they have been resolved. The app keeps an accountability ledger of open incidents and surfaces community-only flood warnings from recurring local reports.

> Proof of concept for civic reporting; it is not connected to KMRL, the municipality, or another public authority.

## What it does

- Uses precise browser GPS (within 150 m) to place reports on a live OpenStreetMap view.
- Classifies report impact and groups nearby matching reports into one incident. With `OPENAI_API_KEY`, matching uses OpenAI; without it, a local category fallback keeps the app usable.
- Requires a photo for potholes and other physical conditions identified by AI.
- Lets each browser confirm an issue once; 3 reports mark it confirmed and 6 make it critical.
- Requires two different people, each within 250 m, to verify a resolution before an incident leaves the board. Pothole repairs require a photo.
- Shows a flood warning after reports establish repeated flooding in the same approximate area.

## Run locally

Requirements: Node.js 20+ and Docker (or a local PostgreSQL server).

```sh
docker compose up -d db
npm install
npm run dev:api
```

In a second terminal:

```sh
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`. The frontend proxies `/api` and `/uploads` to the API on port 3001. Allow location access to submit or verify reports.

To use a local PostgreSQL server instead of Docker:

```sh
sudo -u postgres psql -c "CREATE ROLE civicpulse LOGIN PASSWORD 'civicpulse';"
sudo -u postgres psql -c "CREATE DATABASE civicpulse OWNER civicpulse;"
PGPASSWORD=civicpulse psql -h localhost -U civicpulse -d civicpulse -f db/init.sql
```

Set `DATABASE_URL` to override the default connection string (`postgres://civicpulse:civicpulse@localhost:5432/civicpulse`). Set `PORT` to change the API port.

## Optional AI matching

Set `OPENAI_API_KEY` before starting the API to enable structured semantic matching, category/impact analysis, and visual-evidence requirements:

```sh
OPENAI_API_KEY=... npm run dev:api
```

`OPENAI_MODEL` optionally overrides the default model, `gpt-4.1-mini`. The key is used only by the server. Without it, category-based matching is used instead.

## Deploy

The frontend is a static Vite build; the API is a long-lived Express server that needs PostgreSQL and a writable disk for photos. They deploy separately.

**Database (Neon).** Create a Neon project and copy the pooled connection string; it already ends in `?sslmode=require`, which the server detects and connects over TLS. On boot the server creates any missing tables and columns, so an empty Neon database needs no manual migration. Set `DATABASE_SSL_NO_VERIFY=true` only for a provider using self-signed certificates.

**API (Render).** `render.yaml` is a blueprint: a Node web service plus a 1 GB disk mounted at `/var/data/uploads`. Point Render at this repo as a Blueprint, then set `DATABASE_URL` to the Neon string, `CORS_ORIGIN` to the frontend origin (for example `https://civicpulse.vercel.app`, no trailing slash), and `OPENAI_API_KEY` if you want AI matching. `UPLOAD_DIR` is wired up by the blueprint.

The disk matters: report and resolution photos are written to `UPLOAD_DIR` and served from `/uploads`. Without a persistent disk every redeploy loses them, which breaks pothole reporting and resolution.

**Frontend (Vercel).** Set the build-time environment variable `VITE_API_URL` to the deployed API origin and redeploy. Leaving it unset keeps the relative `/api` paths used in local development, where Vite proxies to port 3001.

## Data and demo limits

Report and resolution photos are limited to 5 MB and saved locally in `uploads/`; use object storage for a deployed multi-instance app. Browser-generated UUIDs enforce one confirmation per browser, so production should use authenticated identities and stronger anti-abuse controls.

`db/init.sql` runs only when PostgreSQL creates its data volume. To reset local data:

```sh
docker compose down -v
```

To add a demo critical incident with 16 community reports (and unlock the draft letter):

```sh
PGPASSWORD=civicpulse psql -h localhost -U civicpulse -d civicpulse -f db/seed-demo.sql
```
