# Deployment Environment Configuration Guide

This document details all environment variables required for **Local Development** and **Render Production**, including purpose, format, sensitivity classification, and target environment.

> **CRITICAL SECURITY REQUIREMENT**: Never commit actual credentials, private keys, or passwords into source control. All production secrets must be configured directly within the hosting provider's secret management console (e.g., Render Dashboard Environment Variables).

---

## 1. Summary Matrix

| Variable Name | Target | Purpose | Secret? | Render Requirement |
|---|---|---|---|---|
| `APP_NAME` | Backend | Application title for OpenAPI & health | No | Optional (defaults to "Patil Manufacturing Analytics API") |
| `APP_ENV` | Backend | Environment identifier (`development` / `production`) | No | Recommended: set to `production` |
| `DATABASE_URL` / `POSTGRES_*` | Backend | PostgreSQL connection parameters | **Yes** | **Required** (Provided by Render PostgreSQL service) |
| `AUTH_SECRET_KEY` | Backend | JWT token signing key (HS256) | **Yes** | **Required** (Generate with `openssl rand -hex 32`) |
| `AUTH_ALGORITHM` | Backend | JWT signing algorithm | No | Optional (defaults to `HS256`) |
| `AUTH_ACCESS_TOKEN_EXPIRE_MINUTES` | Backend | JWT access token lifespan | No | Optional (defaults to `60`) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Backend | Google Cloud Service Account credentials | **Yes** | **Required** (Single-line JSON string) |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | Backend | Path to local credentials JSON file | Path only | Local development only (do NOT use on Render) |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Backend | Medchal Production Spreadsheet ID | No | **Required**: `17iVnCiFOxIEKNDMkTQl-rPSH9sVaYj3Q2Znbt3Ky95o` |
| `GOOGLE_SHEETS_WORKSHEET_NAME` | Backend | Target sheet tab name | No | **Required**: `Sheet1` |
| `GOOGLE_SHEETS_CACHE_TTL_SECONDS` | Backend | In-memory cache TTL for sheet responses | No | Optional (defaults to `45`) |
| `APP_BOOTSTRAP_EMAIL` | Backend | Super-admin email for initial creation | **Yes** | Optional (set together with password & code) |
| `APP_BOOTSTRAP_EMPLOYEE_CODE` | Backend | Super-admin employee code | **Yes** | Optional (e.g., `ADMIN-001`) |
| `APP_BOOTSTRAP_PASSWORD` | Backend | Super-admin initial password | **Yes** | Optional (must be set if bootstrap is used) |
| `VITE_API_BASE_URL` | Frontend | Backend API base URL for frontend requests | No | Optional on Vercel (rewrites handle `/api`) |

---

## 2. Detailed Variable Specification

### Backend Variables (Render & Local)

#### `GOOGLE_SHEETS_SPREADSHEET_ID`
- **Purpose**: Specifies the Google Spreadsheet containing live manufacturing DPR records.
- **Production Value**: `17iVnCiFOxIEKNDMkTQl-rPSH9sVaYj3Q2Znbt3Ky95o`
- **Local Value**: `17iVnCiFOxIEKNDMkTQl-rPSH9sVaYj3Q2Znbt3Ky95o`
- **Classification**: Non-secret configuration.
- **Render Setup**: Add as Environment Variable in Render Dashboard.

#### `GOOGLE_SHEETS_WORKSHEET_NAME`
- **Purpose**: Name of the worksheet tab within the spreadsheet that contains normalized manufacturing records.
- **Value**: `Sheet1`
- **Classification**: Non-secret configuration.
- **Render Setup**: Add as Environment Variable in Render Dashboard.

#### `GOOGLE_SERVICE_ACCOUNT_JSON`
- **Purpose**: Authenticates Google Sheets API requests with read-only permissions (`https://www.googleapis.com/auth/spreadsheets.readonly`).
- **Render Production**: Paste the entire content of the Google Cloud service-account JSON key as a single-line string, or as a Base64-encoded string:
  ```
  GOOGLE_SERVICE_ACCOUNT_JSON=<configured securely in environment>
  ```
- **Local Development**: Can be set to an absolute file path:
  ```
  GOOGLE_SERVICE_ACCOUNT_JSON=/absolute/path/to/service-account.json
  ```
  Or use the dedicated `GOOGLE_SERVICE_ACCOUNT_FILE` variable.
- **Classification**: **CRITICAL SECRET**. Never expose or commit.

#### `GOOGLE_SERVICE_ACCOUNT_FILE`
- **Purpose**: Dedicated variable for local development specifying a file path on disk.
- **Local Example**: `/absolute/path/to/service-account.json`
- **Render Production**: **Leave empty**. Local paths do not exist in cloud containers.
- **Precedence**: If `GOOGLE_SERVICE_ACCOUNT_JSON` is not set, the application checks `GOOGLE_SERVICE_ACCOUNT_FILE`.

#### `DATABASE_URL` / `POSTGRES_*`
- **Render Production**: Connect your Render PostgreSQL database to the Render Web Service. Render injects `DATABASE_URL` automatically:
  ```
  postgresql://[REDACTED_USER]:[REDACTED_PASSWORD]@[REDACTED_HOST].render.com/pril_analytics
  ```
- **Local Development**: Uses Docker Compose (`docker-compose.yml`) published on port 5433:
  ```
  POSTGRES_HOST=127.0.0.1
  POSTGRES_PORT=5433
  POSTGRES_DB=pril_analytics
  POSTGRES_USER=pril
  POSTGRES_PASSWORD=[REDACTED_DEV_PASSWORD]
  ```

#### `AUTH_SECRET_KEY`
- **Purpose**: Secret cryptographic key used to sign and verify JWT authentication tokens.
- **Render Production**: Generate a cryptographically secure 256-bit string:
  ```bash
  python -c "import secrets; print(secrets.token_urlsafe(32))"
  ```
- **Classification**: **CRITICAL SECRET**. Must be set in Render environment variables.

#### `APP_BOOTSTRAP_*` (Optional First-Time Setup)
- **Purpose**: Idempotently seeds the initial `SUPER_ADMIN` account on Render startup when Alembic migrations finish.
- **Variables**:
  - `APP_BOOTSTRAP_EMAIL`: e.g. `admin@patilgroup.com`
  - `APP_BOOTSTRAP_EMPLOYEE_CODE`: e.g. `EMP-ADMIN-01`
  - `APP_BOOTSTRAP_PASSWORD`: Strong temporary password
- **Behavior**: If all three are set, the app creates the admin on startup if not already existing. Once created, these variables can be safely removed from Render.

---

## 3. Frontend Variables (Vercel & Local)

#### `VITE_API_BASE_URL`
- **Local Development**: Leave empty. The Vite development server proxy (`frontend/vite.config.ts`) forwards all `/api/*` requests to `http://127.0.0.1:8000`.
- **Vercel Production**: `frontend/vercel.json` contains a rewrite rule:
  ```json
  {
    "rewrites": [
      {
        "source": "/api/:path*",
        "destination": "https://patilgroup-perfromance-dashboard.onrender.com/api/:path*"
      }
    ]
  }
  ```
  Because the rewrite proxies all `/api/*` traffic server-side through Vercel's edge network directly to the Render backend, `VITE_API_BASE_URL` can remain empty (same-origin). If explicit cross-origin requests are preferred, set `VITE_API_BASE_URL=https://patilgroup-perfromance-dashboard.onrender.com`.

---

## 4. CORS Origins Configuration

The backend `cors_origins` list in `backend/app/core/config.py` allows:
- `http://localhost:5173` (local Vite)
- `http://127.0.0.1:5173` (local Vite)
- `https://patilgroup-perfromance-dashboard.vercel.app` (production Vercel)
- `https://patilgroup-perfromance-dashboard-git-main-patil-group.vercel.app` (Vercel branch preview)
- `https://patilgroup-perfromance-dashboard-iad1s4qau-patil-group.vercel.app` (Vercel deployment)

