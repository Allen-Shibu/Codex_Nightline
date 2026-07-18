# CivicPulse

React/TypeScript civic issue board with an Express API and PostgreSQL.

## Run locally

```sh
docker compose up -d db
npm install
npm run dev:api
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`). The frontend proxies `/api` to the API at port 3001.

If you use a locally installed PostgreSQL server instead of Docker, create the development database once:

```sh
sudo -u postgres psql -c "CREATE ROLE civicpulse LOGIN PASSWORD 'civicpulse';"
sudo -u postgres psql -c "CREATE DATABASE civicpulse OWNER civicpulse;"
PGPASSWORD=civicpulse psql -h localhost -U civicpulse -d civicpulse -f db/init.sql
```

`db/init.sql` creates an empty schema. It runs only when PostgreSQL first creates its data volume. To reset local data, run `docker compose down -v` before starting again.

## Voting

The `incident_votes` primary key allows one confirmation per incident per browser-generated UUID. This is suitable for the demo; production should replace the browser UUID with an authenticated user identity.

Reports may include one image up to 5 MB. Images are stored in the local `uploads/` directory and the database stores their path; use object storage before deploying multiple app instances.

## AI incident matching

Set `OPENAI_API_KEY` before starting the API to have the server send each report and nearby open incidents to OpenAI for a structured match-or-new decision. The key stays on the server. Without it, CivicPulse uses the local category/location fallback so the demo remains usable offline.

## Citizen-only flood warning

Every submission is retained as an `incident_reports` event, even when it merges into a live incident. Reports mentioning rain, flooding, waterlogging, overflow, or drains are marked rain-related. A flood warning appears only after citizens have reported flooding on at least three different rain-related days within the same roughly 500 m map cell and there is a new rain-related report there within six hours.
