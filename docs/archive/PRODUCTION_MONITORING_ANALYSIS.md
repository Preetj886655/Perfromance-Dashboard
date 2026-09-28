# PRODUCTION MONITORING DASHBOARD — ANALYSIS & ARCHITECTURE REPORT

**Prepared:** 13-Aug-2026  
**Status:** Phase 2 Planning — Ready for Implementation  
**Scope:** Integration of Google Forms, Google Sheets, Excel, CSV into unified Master Data dashboard

---

## EXECUTIVE SUMMARY

Your existing Patil Manufacturing Analytics project has a **solid foundation** for production monitoring:

✅ **Production Record Model** — Comprehensive fields for capturing production data (planned_qty, actual_qty, loss_qty, idle_time, rejection, rework, downtime)  
✅ **Excel Import Pipeline** — DPR_OEE ingestion with duplicate prevention via external_row_key and source_import_id tracking  
✅ **OEE Dashboard** — Real-time KPI visualization with SSE live updates, plant/line/machine filtering  
✅ **Data Lineage** — DataSource model and tracking for audit trail  
✅ **Master Data** — Plants, Lines, Machines, Shifts, Operators already in place  
✅ **Backend Framework** — FastAPI + SQLAlchemy with RBAC authentication  
✅ **Frontend Framework** — React + TypeScript + ECharts for charts  
✅ **Database** — PostgreSQL 16 with Alembic migrations (015 current)  

❌ **Missing:** CSV upload, Google Sheets integration, Google Forms, column mapping UI, production KPI dashboard (separate from OEE), hourly reminders

---

## SECTION 1: CURRENT ARCHITECTURE

### 1.1 Technology Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Frontend** | React | 19.2.8 | UI components, dashboards, forms |
| **Frontend** | TypeScript | ~6.0.2 | Type safety |
| **Frontend** | Vite | 8.2.0 | Build, dev server |
| **Frontend** | ECharts | 6.1.0 | Data visualization, charts, graphs |
| **Backend** | FastAPI | 0.115.12 | REST API framework |
| **Backend** | SQLAlchemy | 2.0.40 | ORM, database abstraction |
| **Backend** | Alembic | 1.15.2 | Database migrations |
| **Backend** | PostgreSQL | 16 | Persistent data storage |
| **Backend** | Python | 3.12+ | Server-side logic |
| **Auth** | JWT | PyJWT 2.10.1 | Token-based authentication |
| **Security** | bcrypt | 4.1.2 | Password hashing |
| **File I/O** | openpyxl | 3.1.5 | Excel file reading/writing |
| **Real-time** | SSE | Built-in | Server-Sent Events for live updates |

### 1.2 Backend Architecture

```
backend/
├── app/
│   ├── main.py                      # FastAPI app setup
│   ├── api/
│   │   ├── routes/
│   │   │   ├── auth.py              # Login, logout, token
│   │   │   ├── dashboard.py         # OEE snapshots, SSE stream
│   │   │   ├── imports.py           # Excel DPR_OEE upload
│   │   │   ├── production_records.py # Production data read
│   │   │   ├── masters.py           # Master data CRUD (Plants, Lines, Machines)
│   │   │   ├── users.py             # User management
│   │   │   └── health.py            # Health check
│   │   └── schemas/                 # Pydantic request/response models
│   │       ├── imports.py
│   │       ├── dashboard.py
│   │       ├── production_records.py
│   │       ├── masters.py
│   │       └── ...
│   ├── models/
│   │   ├── production_record.py      # Raw production data
│   │   ├── production_record_metrics.py # Calculated metrics
│   │   ├── data_source.py            # Data source registry
│   │   ├── import_job.py             # Import tracking
│   │   ├── plant.py                  # Master data
│   │   ├── line.py
│   │   ├── machine.py
│   │   ├── shift.py
│   │   ├── operator.py
│   │   ├── oee_snapshot.py           # OEE calculations
│   │   └── ...
│   ├── services/
│   │   ├── dpr_oee_ingestion.py      # Excel parsing & loading
│   │   ├── oee_rollup.py             # OEE calculations
│   │   ├── sse.py                    # Real-time event broadcaster
│   │   ├── dashboard_oee.py          # Dashboard queries
│   │   └── ...
│   ├── core/
│   │   ├── config.py                 # Settings, environment
│   │   ├── rbac.py                   # Role-based access control
│   │   └── security.py               # JWT, auth helpers
│   └── db/
│       ├── session.py                # DB connection
│       ├── base.py                   # ORM base class
│       └── seeds/                    # Initial data
├── alembic/
│   └── versions/
│       ├── 001_extensions_and_types.py
│       ├── ...
│       └── 015_oee_metrics_nullable.py
└── tests/
    └── test_*.py                      # Pytest test suite (180+ tests)
```

### 1.3 Current Data Model (Production Records)

**Table: `production_records`** (Alembic Migration 005)

```sql
production_records:
  id (UUID, PK)
  plant_id (UUID, FK)
  line_id (UUID, FK, nullable)
  shift_id (UUID, FK)
  machine_id (UUID, FK)
  part_id (UUID, FK)
  operator_id (UUID, FK, nullable)
  production_date (Date)
  start_at (DateTime, nullable)
  stop_at (DateTime, nullable)
  planned_qty (Numeric, nullable)
  actual_qty (Numeric, nullable)
  rejection_qty (Numeric, nullable)
  rework_qty (Numeric, nullable)
  loss_qty (Numeric, nullable)
  idle_time_minutes (Integer, nullable)
  remarks (Text, nullable)
  source_import_id (UUID, FK, nullable) → import_jobs (Lineage)
  external_row_key (String, unique) (Idempotency)
  created_at, updated_at (Timestamps)
```

### 1.4 Current Data Model (Master Data)

**Table: `data_sources`** (Alembic Migration 007)

```sql
data_sources:
  id (UUID, PK)
  code (String, unique) — stable identifier
  name (String)
  source_type (VARCHAR: 'excel' | 'csv' | 'form' | 'sheets' | 'manual' | 'api')
  config (JSONB) — non-secret metadata only
  freshness_sla_minutes (Integer, nullable)
  is_active (Boolean)
  created_at, updated_at (Timestamps)
```

**Example data_source record:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "code": "google_sheet_production_main",
  "name": "Google Sheet - Production Responses",
  "source_type": "sheets",
  "config": {
    "spreadsheet_id": "1A2B3C4D5E6F...",
    "sheet_title": "Form Responses 1",
    "service_account_email": "pril-analytics@...",
    "last_synced_row": 1245
  },
  "freshness_sla_minutes": 5,
  "is_active": true
}
```

### 1.5 Current API Routes

**Existing Endpoints:**

| Method | Route | Purpose | Auth |
|---|---|---|---|
| GET | `/api/v1/health` | Health check | None |
| POST | `/api/v1/auth/login` | User login | None |
| GET | `/api/v1/auth/me` | Current user | JWT |
| GET | `/api/v1/users` | List users | JWT + RBAC |
| POST | `/api/v1/users` | Create user | JWT + RBAC |
| GET | `/api/v1/masters/plants` | List plants | JWT |
| POST | `/api/v1/masters/plants` | Create plant | JWT + RBAC ("masters", "CREATE") |
| GET | `/api/v1/masters/lines` | List lines | JWT |
| POST | `/api/v1/masters/lines` | Create line | JWT + RBAC |
| GET | `/api/v1/masters/machines` | List machines | JWT |
| POST | `/api/v1/masters/machines` | Create machine | JWT + RBAC |
| POST | `/api/v1/imports/dpr-oee` | Upload Excel DPR_OEE | JWT + RBAC ("imports", "CREATE") |
| GET | `/api/v1/production-records/{id}` | Get production record | JWT |
| GET | `/api/v1/dashboard/oee` | Get OEE snapshot | JWT + RBAC ("production", "READ") |
| GET | `/api/v1/dashboard/stream` | SSE stream (live updates) | JWT |

### 1.6 Current Frontend Architecture

```
frontend/src/
├── pages/
│   ├── OeeDashboard.tsx          # Main dashboard with OEE KPIs
│   ├── MasterDataPage.tsx        # Master data management
│   ├── UserManagementPage.tsx    # User/role management
│   └── LoginPage.tsx
├── components/
│   ├── dashboard/
│   │   ├── OeeDashboard.tsx
│   │   ├── FilterBar.tsx
│   │   ├── KpiCards.tsx
│   │   ├── TrendChart.tsx
│   │   ├── BreakdownChart.tsx
│   │   └── SnapshotTable.tsx
│   ├── masters/
│   │   ├── PlantForm.tsx
│   │   ├── LineForm.tsx
│   │   └── ...
│   └── ...
├── api/
│   ├── client.ts                 # HTTP client with auth
│   ├── dashboard.ts              # Dashboard API calls
│   ├── masters.ts                # Master data API calls
│   └── ...
├── auth/
│   ├── AuthContext.tsx           # Auth state management
│   └── useAuth.ts                # Auth hook
├── types/
│   ├── dashboard.ts              # TypeScript types
│   └── ...
└── utils/
    └── ...
```

---

## SECTION 2: CURRENT DATA FLOW

### 2.1 Excel (DPR_OEE) Import Flow

```
1. Administrator
   ↓
2. Upload Excel File
   ├─ POST /api/v1/imports/dpr-oee
   ├─ file: *.xlsx (multipart/form-data)
   └─ plant_id: UUID
   ↓
3. Backend Processing
   ├─ app/services/dpr_oee_ingestion.py
   │  ├─ Parse Excel rows
   │  ├─ Validate columns
   │  ├─ Detect duplicates (external_row_key)
   │  └─ Insert ProductionRecords
   ├─ app/services/oee_rollup.py
   │  ├─ Calculate OEE metrics
   │  └─ Create/update OeeSnapshot records
   └─ app/services/sse.py
      └─ Emit "oee_updated" event
   ↓
4. Frontend (OeeDashboard)
   ├─ Receive SSE event
   ├─ Refresh OEE data
   └─ Update charts
   ↓
5. Production Dashboard
   └─ Shows imported production data
```

**Key Features:**
- Duplicate prevention via `external_row_key` unique index
- Lineage tracking via `source_import_id` FK
- Real-time refresh via SSE events
- OEE auto-calculation on import

### 2.2 Current OEE Dashboard Flow

```
1. User Filter Selection
   ├─ Plant
   ├─ Line
   └─ Machine
   ↓
2. API Call
   └─ GET /api/v1/dashboard/oee?scope_type=machine&scope_id=...
   ↓
3. Backend
   ├─ Query OeeSnapshot
   ├─ Calculate KPIs (Availability, Performance, Quality, OEE)
   └─ Return OeeSnapshotResponse
   ↓
4. Frontend Visualization
   ├─ KPI cards
   ├─ Breakdown chart
   ├─ Trend chart
   └─ Details table
```

---

## SECTION 3: WHAT NEEDS TO BE ADDED

### 3.1 Data Source Support

| Source | Current | Needed | Priority |
|---|---|---|---|
| **Excel** | ✅ DPR_OEE only | ✅ Generic with column mapping | HIGH |
| **CSV** | ❌ None | ✅ Full support | HIGH |
| **Google Sheets** | ❌ None | ✅ OAuth + live sync | MEDIUM |
| **Google Forms** | ❌ None | ✅ Create/configure forms | MEDIUM |
| **Manual** | ❌ None | ✅ UI form entry | LOW |

### 3.2 Missing Features

| Feature | Current | Needed |
|---|---|---|
| **Column Mapping UI** | None | Map uploaded file columns to ProductionRecord fields |
| **Data Preview** | None | Show first N rows before import |
| **Validation Errors** | Limited | Detailed error reporting per row |
| **CSV Upload** | None | Full CSV parsing and import |
| **Google Sheets API** | None | OAuth, spreadsheet access, sync |
| **Google Forms API** | None | Create/configure forms, field management |
| **Column Mapping Template** | Table exists in DB | UI for visual mapping configuration |
| **Production Dashboard** | OEE only | Plan vs Actual, Loss Analysis, Idle Time, Shift/Machine Performance |
| **Hourly Reminders** | None | Google Calendar/Apps Script automation |
| **Data Export** | None | CSV/Excel export of Master Data and production records |
| **Duplicate Prevention** | ✅ For imports | Enhance for Google Sheets sync (row-level identification) |

### 3.3 Missing Formulas/KPIs

| KPI | Formula | Current | Needed |
|---|---|---|---|
| **Plan vs Actual** | Actual / Planned × 100 | Partial (in snapshots) | ✅ Dashboard visualization |
| **Production Loss** | Planned - Actual | Calculated in DB | ✅ Dashboard KPI card |
| **Loss %** | Loss / Planned × 100 | None | ✅ Calculate & display |
| **Idle Time** | Sum of idle_time_minutes | In ProductionRecord | ✅ KPI card + analysis |
| **Efficiency** | (Actual / Planned) × 100 | Partial | ✅ Configure formulas |
| **Hourly Breakdown** | Sum production by hour | None | ✅ Hourly chart |
| **Shift Performance** | Aggregated by shift | None | ✅ Shift comparison |
| **Machine Performance** | Aggregated by machine | Partial (OEE) | ✅ Machine comparison |

### 3.4 Missing UI Components

| Component | Purpose | Priority |
|---|---|---|
| **Data Sources Page** | Manage Google Sheets, Excel, CSV connections | HIGH |
| **Upload Form** | File upload + column mapping | HIGH |
| **Data Preview Table** | Show first rows before import | HIGH |
| **Production KPI Dashboard** | Plan vs Actual, Loss, Idle Time KPIs | MEDIUM |
| **Hourly Production Chart** | Production trend by hour | MEDIUM |
| **Loss Analysis Dashboard** | Loss by reason, machine, shift | MEDIUM |
| **Idle Time Analysis** | Idle time breakdown | MEDIUM |
| **Shift Performance** | Shift-wise comparison | MEDIUM |
| **Machine Performance** | Machine-wise metrics | MEDIUM |
| **Google Sheet Manager** | Configure Google Sheets connection | MEDIUM |
| **Google Form Creator** | Create/configure Google Forms | MEDIUM |

---

## SECTION 4: PROPOSED INTEGRATION ARCHITECTURE

### 4.1 Data Flow (Unified Master Data)

```
                    OPERATOR
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
    Google Form     Excel File     CSV File
    (Hourly)        (Batch)        (Batch)
        │               │               │
        └───────────────┴───────────────┘
                        │
                        ▼
            COLUMN MAPPING & VALIDATION
                        │
        ┌───────────────┴───────────────┐
        │                               │
        ▼                               ▼
    DataSource                   ProductionRecord
    (Track origin)               (Unified structure)
        │                               │
        │                               │
        └───────────────┬───────────────┘
                        │
                        ▼
                    MASTER DATA
            (production_records table)
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
    KPI              Rollup          Analysis
    Calculation      (OEE)           (Loss, Idle)
        │               │               │
        └───────────────┴───────────────┘
                        │
                        ▼
              PRODUCTION DASHBOARD
        ┌───────────────┬───────────────┐
        │               │               │
        ▼               ▼               ▼
    KPI Cards      Graphs          Tables
    (Metrics)   (Trends, Loss)   (Details)
```

### 4.2 Database Schema Additions (No Breaking Changes)

**New Tables:**
- `google_auth_sessions` — Store OAuth state tokens (temporary)
- `google_sheet_sync_state` — Track last synced row per data source
- `column_mapping_instances` — Store user's column mappings for re-use

**Modified Tables:**
- `data_sources` — Already supports all source types (excel, csv, form, sheets)
- `production_records` — Already has source_import_id + external_row_key (no changes)
- `import_jobs` — Already tracks import metadata (no changes)

**Reused Tables:**
- `column_mapping_template` — For storing field definitions

### 4.3 New API Routes

**Data Sources:**
- `GET /api/v1/data-sources` — List all configured data sources
- `POST /api/v1/data-sources` — Create data source
- `PATCH /api/v1/data-sources/{id}` — Update data source config
- `DELETE /api/v1/data-sources/{id}` — Deactivate data source

**Google Integration:**
- `POST /api/v1/google/auth/init` — Start OAuth flow
- `GET /api/v1/google/auth/callback` — OAuth callback handler
- `POST /api/v1/google/sheets/connect` — Connect existing Google Sheet
- `POST /api/v1/google/sheets/sync` — Manual sync trigger
- `POST /api/v1/google/forms/create` — Create Google Form
- `GET /api/v1/google/forms/{form_id}` — Get form structure

**File Upload:**
- `POST /api/v1/imports/upload` — Generic file upload (Excel/CSV)
- `POST /api/v1/imports/preview` — Preview file before import
- `POST /api/v1/imports/confirm` — Confirm import after preview

**Production Data:**
- `GET /api/v1/production-data` — List production records with filters
- `GET /api/v1/production-data/kpis` — KPI calculations (Plan vs Actual, Loss, Idle)
- `GET /api/v1/production-data/hourly` — Hourly breakdown
- `GET /api/v1/production-data/by-shift` — Shift performance
- `GET /api/v1/production-data/by-machine` — Machine performance
- `POST /api/v1/production-data/export` — Export filtered data

### 4.4 Frontend Routes

**New Pages:**
- `#/data-sources` — Data source management
- `#/google-integration` — Google Sheets/Forms configuration
- `#/production` — Production KPI dashboard
- `#/production/loss-analysis` — Loss breakdown
- `#/production/idle-analysis` — Idle time breakdown
- `#/production/shift-performance` — Shift comparison
- `#/production/machine-performance` — Machine comparison

**Shared Components:**
- `DataSourceList` — Display connected data sources
- `FileUploader` — Upload Excel/CSV with preview
- `ColumnMapper` — Map file columns to ProductionRecord fields
- `ProductionKpiCards` — KPI cards for production metrics
- `HourlyChart` — Hourly production trend
- `LossBreakdown` — Loss analysis visualization

### 4.5 Services to Add

**Backend Services:**
- `app/services/csv_ingestion.py` — CSV parsing and import
- `app/services/google_sheets_sync.py` — Google Sheets API integration
- `app/services/google_forms_manager.py` — Google Forms API integration
- `app/services/column_mapper.py` — Column mapping logic
- `app/services/production_kpi.py` — KPI calculations
- `app/services/google_oauth_handler.py` — OAuth flow management

**Frontend Services:**
- `src/api/production.ts` — Production data API calls
- `src/api/dataSources.ts` — Data source API calls
- `src/api/google.ts` — Google integration API calls
- `src/utils/fileParser.ts` — CSV/Excel file parsing utilities
- `src/utils/columnMapper.ts` — Column mapping UI helpers

### 4.6 Security Considerations

**Secrets Management:**
```
Backend Environment Variables:
├── GOOGLE_CLIENT_ID           # OAuth client ID
├── GOOGLE_CLIENT_SECRET       # OAuth client secret (NEVER in frontend)
├── GOOGLE_REDIRECT_URI        # OAuth callback URL
├── GOOGLE_SERVICE_ACCOUNT_JSON # Service account key (if using service account)
└── ENCRYPTION_KEY             # For encrypting OAuth tokens at rest
```

**OAuth Flow:**
```
Frontend                    Backend                     Google
   │                            │                           │
   ├─ User clicks "Connect" ──────────────────────────────┤
   │                            │
   │                            ├─ Generate state token
   │                            ├─ Save state to DB/session
   │                            ├─ Redirect to Google
   │                            │
   │                            │◄──────────────────────────┤
   │                            │       Auth Code
   │◄───────────────────────────┤
   │   Redirect with code        │
   │                             │
   │                             ├─ Exchange code for token
   │                             ├─ Encrypt & store token
   │                             ├─ Create DataSource record
   │◄───────────────────────────┤
   │    Success response         │
```

**Token Storage:**
- ✅ Access tokens stored encrypted in `data_sources.config` (non-secret wrapper)
- ✅ Refresh tokens stored in secure backend database
- ✅ Frontend NEVER has access to Google OAuth tokens
- ✅ All Google API calls go through backend proxy endpoints

---

## SECTION 5: IMPLEMENTATION PHASES

### Phase 2A: Foundation (Week 1)
- Add CSV upload support
- Implement column mapping UI
- Add data preview functionality
- Generic file import pipeline
- Tests for CSV ingestion

### Phase 2B: Production Dashboard (Week 2)
- Create production data KPI dashboard
- Implement KPI calculations (Plan vs Actual, Loss, Idle)
- Add hourly production charts
- Add shift/machine performance
- Loss analysis visualization

### Phase 2C: Google Integration (Week 3)
- Set up Google OAuth
- Implement Google Sheets connection
- Implement Google Forms creation
- Sync scheduler
- Tests for Google integration

### Phase 2D: Automation & Polish (Week 4)
- Hourly Google Form reminders
- Error logging and recovery
- Data quality dashboards
- Documentation and deployment

---

## SECTION 6: KEY DECISIONS & RATIONALE

### Decision 1: Unified Master Data (Not Separate Tables)

**Choice:** Use existing `production_records` table for all sources  
**Rationale:**
- Schema already supports all required fields
- Duplicate prevention via `external_row_key` already in place
- Lineage tracking via `source_import_id` already exists
- Eliminates data duplication and sync complexity
- Consistent KPI calculations across sources

**Alternative Considered:** Separate tables per source (rejected — too complex)

### Decision 2: DataSource Registry (Not Hardcoded)

**Choice:** Use `data_sources` table with flexible config JSONB  
**Rationale:**
- Source types (excel, csv, form, sheets) already defined as VARCHAR enum
- Config field allows storing source-specific metadata (sheet IDs, mapping, etc.)
- Audit trail for which data came from where
- Future extensibility without schema changes

### Decision 3: Column Mapping (UI-Based, Not Auto-Detect)

**Choice:** Require user confirmation of column mapping  
**Rationale:**
- Safer than automatic detection (reduces data corruption risk)
- Supports flexible naming (user data can have non-standard column names)
- Preview shows user what will be imported
- Column mapping can be saved/reused for future imports

### Decision 4: OAuth Backend Proxy (Not Direct Frontend)

**Choice:** All Google API calls go through FastAPI backend  
**Rationale:**
- Secrets stay on backend (client_secret, service account keys)
- Frontend never handles OAuth tokens directly
- Centralized error handling and retry logic
- Easier to implement refresh token rotation
- Follows security best practices

### Decision 5: SSE for Live Updates (Not WebSocket)

**Choice:** Continue using existing SSE architecture  
**Rationale:**
- Already implemented and tested (166+ tests passing)
- Simpler than WebSocket for one-way server→client
- Lower overhead for production monitoring use case
- Compatible with existing dashboard refresh logic

---

## SECTION 7: ENVIRONMENT VARIABLES REQUIRED

### Existing (Keep As-Is)

```bash
# Database
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5433
POSTGRES_DB=pril_analytics
POSTGRES_USER=pril
POSTGRES_PASSWORD=pril_dev_password

# App
APP_NAME=Patil Manufacturing Analytics API
APP_ENV=development
```

### New (Add for Google Integration)

```bash
# Google OAuth 2.0
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/google/auth/callback

# Optional: Google Service Account (for serverless Google Sheets access)
GOOGLE_SERVICE_ACCOUNT_EMAIL=pril-analytics@project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_KEY_JSON=<base64-encoded service account JSON>

# Security
ENCRYPTION_KEY=<for encrypting OAuth tokens at rest>

# CSV Settings (optional)
CSV_MAX_ROWS=50000
CSV_MAX_UPLOAD_SIZE_MB=100
```

---

## SECTION 8: DEPENDENCIES TO ADD

### Backend Python Packages

```python
# CSV & Excel handling
pandas==2.2.0              # CSV/Excel reading
openpyxl==3.1.5           # Already present (Excel)

# Google APIs
google-auth==2.28.0       # OAuth
google-auth-httplib2==0.2.0
google-auth-oauthlib==1.2.0
google-api-python-client==1.12.0
google-cloud-storage==2.14.0

# Async & background tasks
celery==5.3.4             # For hourly syncs (optional, polling is simpler)
redis==5.0.1              # For Celery (optional)

# Encryption
cryptography==42.0.4      # For encrypting OAuth tokens

# Data validation
marshmallow==3.20.0       # Column schema validation
jsonschema==4.21.0        # Config validation
```

### Frontend NPM Packages

Already have:
- react, react-dom, vite, typescript, echarts

May add:
```json
{
  "devDependencies": {
    "xlsx": "^0.18.5",      // Excel reading in browser (optional)
    "papaparse": "^5.4.1"   // CSV parsing in browser
  }
}
```

---

## SECTION 9: DATABASE MIGRATIONS NEEDED

**No Breaking Changes Required.**

New migrations will add:
- `google_auth_sessions` table (temporary OAuth state)
- `google_sheet_sync_state` table (track sync progress)
- Indexes on `production_records` for common filters
- No modifications to existing 001-015 migrations

---

## SECTION 10: TESTING STRATEGY

### Unit Tests
- CSV ingestion logic
- Column mapping validation
- KPI calculation formulas
- Google API error handling

### Integration Tests
- Excel file upload → production_records
- CSV upload → production_records
- Google Sheets sync → production_records
- Duplicate prevention across all sources
- Column mapping application
- OEE rollup on new records

### E2E Tests
- Full workflow: Upload file → Map columns → Import → Verify dashboard
- Google Sheets: Connect → Sync → Verify records
- Google Forms: Create → Configure → Receive submission → Sync
- Dashboard: Verify KPIs update after import

### Manual Testing
- Test with actual Google Form and Google Sheet
- Test with real production data files
- Test permission errors (Google Sheet access denied)
- Test network failures and retry logic

---

## SECTION 11: DEPLOYMENT CONSIDERATIONS

### Development
- Docker Compose: PostgreSQL + FastAPI + frontend dev server
- Google OAuth: Use "http://localhost:8000" for redirect URI
- No service account needed (user OAuth sufficient)

### Staging
- Real PostgreSQL instance
- Google OAuth with staging credentials
- Test with production-like data volumes

### Production
- Cloud-hosted PostgreSQL (managed service recommended)
- Production Google OAuth credentials
- Service account for server-side Google Sheets access
- Encrypted secret storage (e.g., AWS Secrets Manager, Azure Key Vault)
- Scheduled sync jobs (Celery + Redis or cloud functions)
- Monitoring and alerting for sync failures
- Backup strategy for production_records table

---

## SECTION 12: RISK MITIGATION

| Risk | Impact | Mitigation |
|---|---|---|
| **Google API quota exceeded** | Sync stops | Implement quota monitoring, backoff strategy |
| **Large file upload** | Server memory | Chunked upload, streaming file read |
| **Duplicate data imported** | Bad metrics | Maintain external_row_key unique index |
| **Column mapping errors** | Data corruption | User preview + validation before import |
| **OAuth token expired** | Sync fails | Implement refresh token rotation |
| **Google permission denied** | Sync fails | Clear error message, permission checker |
| **Network timeout** | Partial import | Transaction rollback, retry logic |
| **Google Sheets tab deleted** | Sync fails | Validation before sync, clear error |

---

## NEXT STEPS

**Immediate (Today):**
1. ✅ Review this analysis
2. ✅ Provide actual Google Form field list (will provide expected columns)
3. ✅ Confirm KPI formulas (Plan vs Actual, Loss, Idle calculations)
4. ✅ Decide: Celery for scheduled syncs vs. simple polling

**Week 1:**
1. Start Phase 2A: CSV upload + column mapping
2. Create generic file import pipeline
3. Build preview UI

**Week 2:**
1. Build production KPI dashboard
2. Implement all KPI calculations
3. Add visualizations

**Week 3:**
1. Implement Google OAuth
2. Google Sheets integration
3. Google Forms management

**Week 4:**
1. Automation (hourly reminders)
2. Testing & documentation
3. Deployment preparation

---

## APPENDIX A: EXISTING TEST COVERAGE

```
Backend Tests: 180/180 passing ✅
├── test_dashboard_oee_api.py        (20+ tests)
├── test_dpr_oee_api.py              (15+ tests)
├── test_dpr_oee_ingestion.py        (20+ tests)
├── test_oee_calculator.py           (25+ tests)
├── test_oee_e2e_uat.py              (10+ tests)
├── test_oee_persistence.py          (15+ tests)
├── test_oee_rollup.py               (30+ tests)
├── test_rbac.py                     (10+ tests)
├── test_user_management.py          (10+ tests)
└── ... (other integration tests)

All tests use real PostgreSQL via docker-compose
No mocking of database layer
```

This baseline must be preserved (no breaking changes).

---

## APPENDIX B: ALEMBIC MIGRATION STATUS

```
Current: Migration 015 (oee_metrics_nullable)

Migration History:
001 — extensions_and_types
002 — org_masters
003 — asset_people_masters
004 — part_reason_masters
005 — production_raw
006 — production_calculated
007 — ingestion_lineage
008 — kpi_registry
009 — security_concepts
010 — audit_alerts_actions
011 — maintenance
012 — ppc
013 — quality_extended
014 — scm_logistics_thin
015 — oee_metrics_nullable

No new migrations needed for production monitoring feature
(reuse existing tables, add supporting tables only)
```

---

**End of Analysis Report**

*Next: Proceed with Phase 2A implementation upon confirmation of requirements.*
