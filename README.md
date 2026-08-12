# Patil Manufacturing Analytics

Enterprise manufacturing performance platform for **Patil Rail Infrastructure Pvt. Ltd. (PRIL)**.

**Current phase:** Phase 1 — Project Foundation only.

Out of scope right now: OEE engine, Excel ingestion, auth/RBAC, department dashboards, SSE, Google Forms, AI.

TBC business questions remain open — see [`docs/business-confirmations-tbc.md`](docs/business-confirmations-tbc.md).

## Stack (approved)

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite |
| Backend | FastAPI |
| Database | PostgreSQL 16 |
| Local orchestration | Docker Compose (Postgres) |

## Repository layout

```
Patil-Manufacturing-Analytics/
├── backend/                 # FastAPI application
│   ├── app/
│   │   ├── main.py          # App entrypoint
│   │   ├── api/routes/      # HTTP routes (health)
│   │   ├── core/            # Settings / config
│   │   └── db/              # DB engine + connection check
│   ├── tests/               # Pytest
│   ├── requirements.txt
│   └── .env.example
├── frontend/                # React + Vite SPA
│   ├── src/                 # Application shell
│   └── .env.example
├── docs/                    # Specs + project status + TBC list
├── docker-compose.yml       # PostgreSQL for local development
├── .env.example             # Compose env defaults
├── .github/workflows/ci.yml # Lint / typecheck / test / build
└── README.md
```

## Prerequisites

- Node.js 22+ (or 20+)
- Python 3.12+
- Docker Desktop **with WSL2 enabled** (preferred for Postgres via Compose)

> **Windows note:** Docker Compose is the intended local Postgres path (`docker compose up -d postgres`). If Docker Desktop cannot start because WSL is not installed, install WSL (`wsl --install`) and reboot, **or** use a local PostgreSQL 16 instance with the same credentials as `.env.example`.

## 1. Clone / open the repo

```powershell
cd "C:\Users\Preet Jaiswal\Documents\Patil-Manufacturing-Analytics"
```

## 2. Environment files

```powershell
Copy-Item .env.example .env
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env.local
```

Do **not** commit `.env` / `.env.local` files. Only `.env.example` files belong in Git.

## 3. Start PostgreSQL (preferred: Docker Compose)

```powershell
docker compose up -d postgres
docker compose ps
```

Default credentials (local only):

- DB: `pril_analytics`
- User: `pril`
- Password: `pril_dev_password`
- Host port: `5433` (maps to container `5432`; avoids clashing with a host PostgreSQL on `5432`)

> **Important:** Backend/`alembic` must use the same host/port as Compose (`POSTGRES_HOST` / `POSTGRES_PORT` in `backend/.env`). On Windows, a local `postgresql-x64-16` service often already owns `5432`; pointing Alembic at `localhost:5432` migrates that instance while `docker exec pril-postgres` still shows an empty DB.

### Alternative: local PostgreSQL 16

Create role/database to match `.env.example`, set `backend/.env` `POSTGRES_HOST` / `POSTGRES_PORT` to that instance, then skip Compose until WSL/Docker is available.
## 4. Start the backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health check:

- Browser / curl: [http://127.0.0.1:8000/api/v1/health](http://127.0.0.1:8000/api/v1/health)
- OpenAPI docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

Expected when Postgres is up: `"status": "ok"` and `"database.connected": true`.

## 5. Start the frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The shell proxies `/api` to the backend and shows live health status.

## 6. Lint / typecheck / tests

Frontend:

```powershell
cd frontend
npm run typecheck
npm run lint
npm run build
```

Backend:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
ruff check .
pytest
```

## Verification checklist (Phase 1)

1. `docker compose up -d postgres` — container healthy  
2. Backend starts without import errors  
3. `GET /api/v1/health` returns `200` with `database.connected: true`  
4. Frontend loads at port 5173 and shows API health  
5. `npm run typecheck` / `npm run lint` / `npm run build` pass  
6. `pytest` / `ruff check` pass  

## Phase boundary

| Included in Phase 1 | Not included |
|---|---|
| App scaffolds, Docker Postgres, health API, shell UI, CI, README | Schema, Auth, Excel import, OEE, dashboards, SSE, Forms |

Authorize Phase 2 separately before any of the deferred work begins.
