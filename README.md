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

`db/init.sql` creates the schema and demo incidents. It runs only when PostgreSQL first creates its data volume. To reset demo data, run `docker compose down -v` before starting again.

## Voting

The `incident_votes` primary key allows one confirmation per incident per browser-generated UUID. This is suitable for the demo; production should replace the browser UUID with an authenticated user identity.

Reports may include one image up to 5 MB. Images are stored in the local `uploads/` directory and the database stores their path; use object storage before deploying multiple app instances.
