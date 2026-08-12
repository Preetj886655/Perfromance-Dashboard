# Patil Manufacturing Analytics Platform



## Project Status



Current Phase: **Phase 2 — Stage B IN PROGRESS (OEE E2E/UAT tests complete — awaiting next-layer approval)**



- Phase 1 — Project Foundation: **COMPLETE**

- Phase 2 Stage A — Database design & review: **FINAL-APPROVED** (2026-08-10)

- Phase 2 Stage B — Schema / migrations / ORM / seeds: **IN PROGRESS**

  - **B0 + Migration 001 complete** (Alembic scaffold + `pgcrypto` extension)

  - **Migration 002 complete** (org masters: `plants`, `departments`, `lines`) — validated 2026-08-10

  - **Migration 003 complete** (asset/people masters: `machine_types`, `machine_statuses`, `machines`, `operators`, `shifts`, `shift_calendars`) — validated 2026-08-11

  - **Migration 004 complete** (part/reason masters: `parts`, `downtime_reasons`, `rejection_reasons`, `machine_part_standards`) — validated 2026-08-11

  - **Rejection reasons seed complete** (Excel A–J catalog; **separate from Alembic** — revision stays `004`) — validated 2026-08-11

  - **Migration 005 complete** (production raw: `production_records`, `downtime_events`, `rejection_events`) — validated 2026-08-11

  - **Migration 006 complete** (production calculated / OEE: `production_record_metrics`, `oee_snapshots`) — validated 2026-08-11

  - **Migration 007 complete** (ingestion / lineage: `import_jobs`, `import_job_rows`, `column_mapping_templates`, `data_sources`, `custom_field_definitions`) — validated 2026-08-11

  - **Migration 008 complete** (KPI registry: `kpi_definitions`, `kpi_results`) — validated 2026-08-11

  - **Migration 009 complete** (security concepts: `users`, `roles`, `role_permissions`, `user_roles`; `owner_role_id` FK) — validated 2026-08-11

  - **Migration 010 complete** (audit / alerts / actions: `audit_logs`, `alert_rules`, `alerts`, `actions`, `action_links`) — validated 2026-08-11

  - **Migration 011 complete** (maintenance: `maintenance_tickets`, `pm_schedules`, `pm_completions`) — validated 2026-08-11

  - **Migration 012 complete** (PPC: `production_plans`) — validated 2026-08-11

  - **Migration 013 complete** (quality extended: `quality_inspections`, `customer_complaints`) — validated 2026-08-11

  - **Migration 014 complete** (SCM / logistics thin: `materials`, `inventory_snapshots`, `grn_records`, `customers`, `dispatch_records`) — validated 2026-08-11

  - **Migration 015 complete** (OEE metrics nullability: DROP NOT NULL on Excel-blank-capable `production_record_metrics` columns) — validated 2026-08-11

  - **Waiting approval for Migration 016** (partitioning — deferred until volume trigger)

- Phase 2+ implementation:
  - **OEE row-level calculation service complete** (dpr_oee_v1 / formula_version=1) — validated 2026-08-11 (pure calculator only; no API/rollups)
  - **OEE row-level metrics persistence complete** (`persist_production_record_metrics` → `production_record_metrics`) — validated 2026-08-11
  - **OEE metrics nullability (Migration 015)** — calculator `None` persists as SQL NULL; validated 2026-08-11
  - **DPR_OEE Excel ingestion service complete** (`ingest_dpr_oee_workbook` → import_jobs / raw / events / metrics) — validated 2026-08-11
  - **DPR_OEE FastAPI API boundary complete** (import + row-level production/metrics/events) — validated 2026-08-11
  - **Import worker / in-process execution boundary complete** (`run_import_job` → existing `ingest_dpr_oee_workbook`) — validated 2026-08-11
  - **OEE period rollup service complete** (`oee_rollup` → `oee_snapshots`, ratio-of-sums runtime / AF path) — validated 2026-08-11
  - **Dashboard read-only OEE API complete** (`/api/v1/dashboard/oee*`, reads `oee_snapshots` only) — validated 2026-08-11
  - **Frontend OEE dashboard UI complete** (React+Vite; `/api/v1/dashboard/*`; ECharts) — validated 2026-08-11
  - **OEE E2E / UAT integration tests complete** (`backend/tests/test_oee_e2e_uat.py`; ingest → metrics → rollup → dashboard; transactional rollback) — validated 2026-08-11
  - Auth / RBAC / ingestion UI / SSE: **NOT STARTED**



## Approval Record (2026-08-10)



- [x] Implementation plan approved as working architecture baseline

- [x] Technical stack approved (React+TS+Vite, FastAPI, PostgreSQL, ECharts, AG Grid, SSE, Docker Compose)

- [x] Excel DPR_OEE formulas confirmed as OEE calculation source of truth

- [x] Phase 1 foundation explicitly authorized and completed

- [x] TBC business questions documented as still TBC (not resolved)

- [x] Phase 2 Stage A database design authorized and completed (documentation only)

- [x] Stage A design revision applied (timestamps, no PG ENUM for configurable categories, formula_key KPIs, consistent oee_snapshots scope)

- [x] Stage A **FINAL-APPROVED** by stakeholder

- [x] Stage B preparation/inspection completed (backend inventory; no schema created)

- [x] Stage B **GO-AHEAD** for B0 / Migration 001 (extensions and types only)

- [x] Stage B **B0 + Migration 001 implemented**

- [x] Stage B **B0 Alembic infra validation failure fixed and re-validated** against Compose `pril_analytics`

- [x] Stage B **Migration 002** (plants, departments, lines) implemented and validated

- [x] Stage B **Migration 003** (asset/people masters) implemented and validated

- [x] Stage B **Migration 004** (part/reason masters) implemented and validated

- [x] Stage B **rejection_reasons seed** (Excel A–J; separate from migrations) implemented and validated

- [x] Stage B **Migration 005** (production raw) implemented and validated

- [x] Stage B **Migration 006** (production calculated / OEE metrics) implemented and validated

- [x] Stage B **Migration 007** (ingestion / lineage) implemented and validated

- [x] Stage B **Migration 008** (KPI registry) implemented and validated

- [x] Stage B **Migration 009** (security concepts) implemented and validated

- [x] Stage B **Migration 010** (audit / alerts / actions) implemented and validated

- [x] Stage B **Migration 011** (maintenance) implemented and validated

- [x] Stage B **Migration 012** (PPC / production planning) implemented and validated

- [x] Stage B **Migration 013** (quality extended) implemented and validated

- [x] Stage B **Migration 014** (SCM / logistics thin) implemented and validated

- [x] Stage B **OEE row calculator** (dpr_oee_v1) implemented and validated (no schema/API)
- [x] Stage B **OEE row metrics persistence** implemented and validated (no schema/API/rollups)
- [x] Stage B **Migration 015** (OEE metrics nullability compatibility) implemented and validated
- [x] Stage B **DPR_OEE Excel ingestion service** implemented and validated (no frontend/rollups)
- [x] Stage B **DPR_OEE FastAPI API boundary** implemented and validated (no workers/rollups/frontend)
- [x] Stage B **Import worker execution boundary** implemented and validated (no Redis/Celery/storage; no rollups/frontend)
- [x] Stage B **Q6 OEE rollup service** implemented and validated (ratio-of-sums runtime → `oee_snapshots`; no dashboard/API/frontend)
- [x] Stage B **Dashboard read-only OEE API** implemented and validated (`/api/v1/dashboard/oee*`; reads snapshots only; no frontend)
- [ ] Stage B Migration 016 — **awaiting approval** (partitioning deferred)
- [x] Stage B **Frontend OEE dashboard UI** implemented and validated (no backend contract changes)
- [ ] Next layer after frontend dashboard (auth / ingestion UI / SSE / etc.) — **awaiting approval**



## OEE Rollup Service (Q6 ratio-of-sums) — 2026-08-11

Service layer only — period OEE via component ratio-of-sums into existing `oee_snapshots`. No Migration 016, no schema changes, no new APIs/frontend/schedulers/Redis/Celery, no department OEE, no Q1/Q11/Q13 inventions. Performance uses **AF / run-time** capacity (not AG). Never averages row OEE %.

| Item | Status |
|---|---|
| Module `backend/app/services/oee_rollup.py` | Done |
| Formulas: A=Σrun/Σavailable; P=Σprod/Σ(run/60×target); Q=Σgood/Σprod; OEE=A×P×Q | Done |
| Scopes: machine / line (mapped `line_id` only) / plant — **no department** | Done |
| Periods: day (`production_date`); week (ISO Monday helper — ASSUMED); month (1st) | Done |
| `FORMULA_VERSION=1` source filter; `AGGREGATION_RULE_KEY=ratio_of_sums_runtime`, version `1` | Done |
| NULL all-or-nothing exclusion; empty/zero-denom → **skip snapshot** (ratios NOT NULL on table) | Done |
| Idempotent upsert on `(scope_type, scope_id, period_type, period_start, aggregation_rule_version)` | Done |
| Tests `backend/tests/test_oee_rollup.py` (items 1–20 + leftovers) | Passed |
| Sample rows 5–6 combined OEE ≈ **0.844815** (~84.48%); ≠ average row OEE; ≠ AG path | Confirmed |
| Full pytest (rollup + worker + API + ingestion + calculator + persistence + health) | **87 passed** (historical; suite now includes dashboard) |
| Alembic `current`/`heads` = `015`; `alembic check` clean; autogenerate empty; no Migration 016 | Confirmed |
| Leftover operational table counts = 0 after rollback fixtures | Confirmed |
| Dashboard / OEE snapshot APIs | Done — see Dashboard Read-Only OEE API section below |
| Frontend OEE dashboard UI | Done — see Frontend OEE Dashboard UI section below |

**STOP gate (historical):** Dashboard API layer now implemented — see section below.

## Dashboard Read-Only OEE API — 2026-08-11

Read-only FastAPI layer over existing `oee_snapshots`. No Migration 016, no schema changes, no OEE recalculation, no average of child OEEs, no frontend/workers/Redis/seeds, no department OEE, no auth invention.

| Item | Status |
|---|---|
| Prefix `/api/v1/dashboard` | Done |
| `GET /oee` (scope × period snapshot) | Done |
| `GET /oee/summary` (latest by period_start/computed_at) | Done |
| `GET /oee/trend` (inclusive range, ascending) | Done |
| `GET /oee/breakdown` (A/P/Q/OEE + component sums) | Done |
| `GET /oee/machines` (plant machines via `machines.plant_id`) | Done |
| `GET /oee/lines` (plant lines via `lines.plant_id`) | Done |
| `GET /oee/plants` (optional `plant_id` filter) | Done |
| Default `aggregation_rule_version=1` (`AGGREGATION_RULE_VERSION`) | Done |
| Query service `dashboard_oee.py` — SELECT only | Done |
| `machine_utilisation` always JSON null (column absent on `oee_snapshots`; AG not computed in API) | Documented deviation |
| Tests `backend/tests/test_dashboard_oee_api.py` (items 1–19) | Passed |
| Full pytest | **108 passed** |
| Alembic `current`/`heads` = `015`; `alembic check` clean; autogenerate empty; no Migration 016 | Confirmed |
| Leftover operational table counts = 0 after rollback fixtures | Confirmed |
| Frontend OEE dashboard UI | Done — see Frontend OEE Dashboard UI section below |
| Auth / ingestion UI / SSE | **Not done** (awaiting approval) |

**STOP gate (historical):** Frontend dashboard UI now implemented — see section below.


## OEE E2E / UAT Integration Tests — 2026-08-11

End-to-end pipeline tests only (no features, schema, Migration 016, formula/API contract, or frontend changes). Covers seed → DPR_OEE ingest / import worker → raw+events+metrics → `oee_rollup` → dashboard GETs; AF≠AG; last-wins documented; distinct-key synthetics for ~84.48% ROS; Q1 incomplete excluded; idempotent re-ingest; leftovers=0 via rollback.

| Item | Status |
|---|---|
| File `backend/tests/test_oee_e2e_uat.py` (10 scenarios) | Done |
| Full pytest | **118 passed** (108 prior + 10 E2E) |
| Alembic `current`/`heads`/`check` | **015**; no Migration 016 |
| Leftover operational table counts | **0** |
| Production code / migrations / frontend | **Unchanged** |

**STOP gate:** STOPPED AFTER OEE E2E/UAT TESTS — awaiting next approval.


## Frontend OEE Dashboard UI — 2026-08-11

Read-only React+Vite dashboard consuming existing `/api/v1/dashboard/oee*` APIs. No Migration 016, no schema/API/OEE formula changes, no auth, no fake live status, no client-side OEE=A×P×Q, no NULL→0, no AG substitution. Backend pytest was 108 passed at UI layer; suite now **118** with E2E/UAT; Alembic head `015`.

| Item | Status |
|---|---|
| Framework | Existing React 19 + TypeScript + Vite (reused) |
| Route | App root `/` → `OeeDashboard` |
| API client | `frontend/src/api/client.ts`, `frontend/src/api/dashboard.ts` |
| Endpoints | GET `/oee`, `/oee/summary`, `/oee/trend`, `/oee/breakdown`, `/oee/machines`, `/oee/lines`, `/oee/plants` |
| Filters | `scope_type` plant\|line\|machine; `period_type` day\|week\|month; `scope_id`; `period_start`; Apply/Reset |
| KPI cards | OEE / Availability / Performance / Quality from API; Machine Utilisation N/A when null |
| Charts | ECharts breakdown + trend (OEE primary; optional A/P/Q toggles, no recalc) |
| Tables | Machines / Lines (plant scope) / Plants; drill via filter state |
| Presentation formatters | Decimal ratio → % display only (e.g. 0.844815 → 84.48%) |
| Vitest | Not present — manual validation documented in `frontend/README.md` |
| Backend pytest | **118 passed** (includes OEE E2E/UAT) |
| Alembic `current`/`heads`/`check` | **015**; no new upgrade ops; no Migration 016 |
| Backend OEE services/APIs/migrations | **Unchanged** in this layer |
| Auth / Redis / Celery / seeds / next modules | **Not done** (awaiting approval) |

**API gaps (reported, not invented):** no plant/line/machine master-list APIs (manual UUID); machines/lines tables need `plant_id` (only when `scope_type=plant`); trend from/to is a UI presentation window.

**STOP gate:** STOP AFTER FRONTEND DASHBOARD UI — AWAITING APPROVAL BEFORE NEXT LAYER.

## Import Worker / Execution Boundary — 2026-08-11

In-process worker/service boundary only — executes an existing `ImportJob` by reusing `ingest_dpr_oee_workbook` (no duplicated Excel/OEE logic). No Migration 016, no schema changes, no Redis/Celery/RabbitMQ/Kafka, no S3/GCS, no locking tables, no rollups/frontend. Q1/Q2/Q11/Q13/Q17 unresolved (Q6 rollup service now implemented — see section above).

| Item | Status |
|---|---|
| Module `backend/app/services/import_worker.py` (`run_import_job`, `prepare_dpr_oee_import_job`) | Done |
| Optional `import_job=` reuse hook on `ingest_dpr_oee_workbook` (minimal; clears prior job rows on retry) | Done |
| Statuses app-level only (Migration 007 has **no** status CHECK): `pending` → `validating` → `committed`/`failed` | Documented |
| Completed jobs skipped unless `force=True`; failed jobs retry when `file_bytes` provided | Done |
| Idempotency via existing `external_row_key` upsert | Confirmed |
| `file_bytes` required when `file_uri` is null — true async needs future file storage | Documented |
| No distributed lock — concurrency best-effort via DB session only | Documented |
| POST `/imports/dpr-oee` remains **synchronous** ingest (does not fake async queue) | Confirmed |
| Flush-only worker; caller commits (same as API) | Confirmed |
| Tests `backend/tests/test_import_worker.py` (items 1–12 + missing-bytes) | Passed |
| Full pytest (worker + API + ingestion + calculator + persistence + health) | 68 passed |
| Alembic `current`/`heads` = `015`; `alembic check` clean; no Migration 016 | Confirmed |
| Leftover operational table counts = 0 after rollback fixtures | Confirmed |
| Q6 rollup service | Done — see OEE Rollup Service section above |
| Dashboards / durable async queue | **Not done** (awaiting approval) |

**STOP gate (historical):** Rollup layer now implemented — see OEE Rollup Service section above.

## DPR_OEE FastAPI API Boundary — 2026-08-11

API layer only — wires existing `ingest_dpr_oee_workbook` + row-level inspection. No Migration 016, no schema changes, no formula/ingestion semantics changes, no rollups/frontend. Q1/Q2/Q6/Q11/Q13/Q17 unresolved. Development/internal — auth not implemented (not faked).

| Item | Status |
|---|---|
| `POST /api/v1/imports/dpr-oee` (multipart Excel + plant_id + optional uploaded_by) | Done |
| `GET /api/v1/imports/{import_id}` summary | Done |
| `GET /api/v1/imports/{import_id}/rows` paginated (limit/offset or page/size) | Done |
| `GET /api/v1/production-records/{id}` RAW + lineage (no OEE on root) | Done |
| `GET /api/v1/production-records/{id}/metrics` (SQL NULL → JSON null) | Done |
| `GET /api/v1/production-records/{id}/events` (downtime + rejection collections) | Done |
| Pydantic response models; routers wired in `main.py` | Done |
| `get_db` commit on success / rollback on error; service does not commit | Done |
| Idempotency via existing `external_row_key` only | Confirmed |
| `python-multipart` added to `requirements.txt` | Done |
| Tests `backend/tests/test_dpr_oee_api.py` (items 1–12) | Passed |
| Full pytest (API + ingestion + calculator + persistence + health) | 55 passed (historical; suite now includes worker) |
| Alembic `current`/`heads` = `015`; `alembic check` clean; autogenerate empty (review deleted) | Confirmed |
| Migrations 001–015 untouched; no Migration 016; leftover ops counts = 0 | Confirmed |
| Import worker execution boundary | Done — see section above |
| Q6 rollups | Done — see OEE Rollup Service section |
| Dashboard read-only OEE APIs | Done — see Dashboard Read-Only OEE API section |
| Frontend | **Not done** (awaiting approval) |

**STOP gate (historical):** Worker layer now implemented — see Import Worker / Execution Boundary section above.

## DPR_OEE Excel Ingestion (service layer) — 2026-08-11

Service-layer pipeline only — Excel → `import_jobs` / `import_job_rows` → RAW `production_records` + non-zero downtime/rejection events → approved calculator + `persist_production_record_metrics`. No Migration 016, no schema changes, no APIs/frontend/workers/rollups. Q1/Q2/Q6/Q11/Q13/Q17 unresolved. Downtime reasons 1–11 seeded in **test fixtures only**; rejection A–J use existing DB seed.

| Item | Status |
|---|---|
| Module `backend/app/services/dpr_oee_ingestion.py` (`ingest_dpr_oee_workbook`) | Done |
| `plant_id` required parameter (Q11 — not hard-coded) | Confirmed |
| Built-in DPR_OEE column map B–AV; sheet `DPR_OEE`; idle Q–AA; rejection AH–AQ | Done |
| openpyxl + tzdata added to `requirements.txt` (parse only; no schema change) | Done |
| Timestamps: Excel Date(B)+Time(E/F) in `plants.timezone` (else UTC); `production_date` = Excel date | Documented |
| Empty template rows (formulas only) skipped | Confirmed |
| Masters resolved (machine/shift/part/operator/reasons); missing → row validation error (no invent) | Confirmed |
| Idempotent `external_row_key`; re-import updates + replaces child events + re-persists metrics | Confirmed |
| Sample Excel rows 5–6 share business unique key → last-wins upsert (documented; distinct-key tests for dual OEE) | Confirmed |
| OEE via existing calculator/persistence; AF≠AG; Q1 no +24h; NULL metrics (015) | Confirmed |
| Tests `backend/tests/test_dpr_oee_ingestion.py` (Postgres 5433, transactional rollback) | 14 passed |
| Full pytest (ingestion + calculator + persistence + health) | 43 passed |
| Alembic `current`/`heads` = `015`; autogenerate empty (review file deleted) | Confirmed |
| Migrations 001–015 untouched; no leftover production/import data | Confirmed |
| Migration 016 / workers | **Not done** (awaiting approval) |
| Q6 rollups / dashboard read-only APIs | Done |
| Frontend | **Not done** (awaiting approval) |

**STOP gate (historical):** API layer now implemented — see DPR_OEE FastAPI API Boundary section above.

## Stage B — Migration 015 (2026-08-11)

OEE nullability compatibility fix only — aligns `production_record_metrics` with Excel-faithful calculator `None` (IFERROR blank). Does not modify migrations 001–014 (006 frozen). No formula changes, no AF/AG change, no `formula_key` column, no `oee_snapshots` changes, no APIs/ingestion/frontend/workers/rollups. Q1/Q2/Q6/Q11/Q13/Q17 unresolved. None not coerced to zero.

| Item | Status |
|---|---|
| Alembic `015_oee_metrics_nullable` (`down_revision = 014`) | Done |
| DROP NOT NULL on: `shift_time_min`, `available_time_min`, `run_time_min`, `target_qty_per_hr`, `actual_qty_per_hr`, `availability`, `performance`, `machine_utilisation`, `rejection_ppm`, `quality`, `oee` | Done |
| Keep NOT NULL: `production_record_id`, `total_idle_time_min`, `total_rejection_qty`, `computed_at`, `formula_version` | Confirmed |
| Existing CHECK `>= 0` unchanged (incl. `quality >= 0`, `oee >= 0`) | Confirmed |
| ORM `ProductionRecordMetrics` nullable typing aligned | Done |
| Downgrade: restore NOT NULL only if no NULLs; else clear RuntimeError (no NULL→0) | Passed |
| Persistence edge cases A–I (NULL flush + rejection>produced CHECK still blocks) | Passed |
| DPR row 5 ≈ 0.8977272727 / row 6 ≈ 0.7942028985 regression | Passed |
| Pytest (persistence + calculator + health) | 29 passed |
| Alembic `current`/`heads` = `015` linear; autogenerate empty (review file deleted) | Confirmed |
| Migrations 001–014 checksums unchanged | Confirmed |
| No leftover production seed data | Confirmed |
| Migration 016 / ingestion APIs / Q6 rollups | **Not done** (awaiting approval) |

**STOP gate (historical):** Ingestion service layer now implemented — see DPR_OEE Excel Ingestion section above.

## Stage B — Migration 014 (2026-08-11)


SCM / logistics thin schema only — `materials`, `inventory_snapshots`, `grn_records`, `customers`, `dispatch_records`. No MRP/BOM/work orders/routing, no supplier master, no inventory ledger/movements, no WMS, no procurement/logistics APIs, frontend, workers, KPI engines, or seeds. Migrations 001–013 unchanged; `customer_complaints` not altered (no retroactive FK to `customers`).


| Item | Status |

|---|---|

| SQLAlchemy models `Material`, `InventorySnapshot`, `GrnRecord`, `Customer`, `DispatchRecord` | Done |

| Alembic `014_scm_logistics_thin` (`down_revision = 013`) | Done |

| `materials`: UUID PK; UNIQUE `code`; `name`; nullable VARCHAR `unit`; nullable `plant_id`→`plants`; `is_active`; timestamps | Done |

| `inventory_snapshots`: UUID PK; `snapshot_date`; `material_id`→`materials` NOT NULL; nullable `plant_id`→`plants`; `quantity_on_hand` NUMERIC + CHECK `>= 0`; nullable `reorder_point` + CHECK `>= 0`; timestamps; no movement/ledger table | Done |

| `grn_records`: UUID PK; `grn_date`; UNIQUE `grn_number` (document identity); `material_id`→`materials` NOT NULL; `quantity_received` + CHECK `>= 0`; nullable free-text `supplier_name`; nullable `plant_id`; nullable VARCHAR `status`; timestamps | Done |

| `customers`: UUID PK; UNIQUE `code`; `name`; `is_active`; timestamps — thin master only | Done |

| `dispatch_records`: UUID PK; nullable `dispatch_date` / `planned_dispatch_date`; `customer_id`→`customers` NOT NULL; `part_id`→`parts` NOT NULL; nullable `planned_qty` / `dispatched_qty` + CHECKs `>= 0`; nullable VARCHAR `status`; nullable `plant_id`; timestamps | Done |

| Indexes: date / status / FK browse patterns only; no uniqueness inventing that blocks multiple snapshots or dispatches | Confirmed |

| No PG ENUM; no MRP/BOM/suppliers/stock_movements tables | Confirmed |

| `customer_complaints` / Migration 013 untouched | Confirmed |

| 001–013 migration file content unchanged; quality + PPC + maintenance remain after downgrade | Confirmed |

| Q1/Q2/Q6/Q11/Q13/Q17/Hosting remain unresolved | Preserved |

| Validated: upgrade → inspect → downgrade 013 (014 tables gone; quality/PPC/maintenance remain) → re-upgrade head | Passed |

| Alembic `current` = `014 (head)` | Confirmed |

| Alembic target fingerprint: Compose via `127.0.0.1:5433` / `pril_analytics` | Confirmed |

| Health pytest | 3 passed |

| SCM/logistics APIs / WMS / seeds / 015+ | **Not done** (out of 014 scope) |


**Deviation / note:** Stage A Steps 8/9 list the five entities as thin stubs without full column sketches. Field shapes follow DOCX SCM/Logistics KPI inputs (GRN, FG stock/reorder, Delivery Accuracy) plus prior master/transaction patterns. `inventory_snapshots` keys off `materials` (Stage A entity), while `dispatch_records` keys off `parts` (finished-goods dispatch). `grn_number` UNIQUE as document identity (same pattern as `ticket_code` / `complaint_code`). No snapshot uniqueness on (material, date, plant) invented.


**STOP gate:** Do not implement Migration 015 / 016 until explicit approval.

## OEE Metrics Persistence (row-level) — 2026-08-11

Service wiring only — calls approved `calculate_oee_metrics()`; upserts existing `production_record_metrics`. No schema changes, no Migration 015/016, no APIs/frontend/workers/ingestion, no `oee_snapshots` rollups, no permanent production seeds.

| Item | Status |
|---|---|
| Module `backend/app/services/oee_persistence.py` (`persist_production_record_metrics`) | Done |
| Maps calculator outputs to existing metrics columns only (no invented cols) | Confirmed |
| Raw fields stay on `production_records` / events (`planned_downtime_min`, `produced_qty`, per-reason qty) | Confirmed |
| `formula_version=1` stored; `FORMULA_KEY=dpr_oee_v1` service constant only (no `formula_key` column on metrics) | Confirmed |
| Idempotent upsert by `production_record_id` PK | Confirmed |
| None not coerced to 0; Q1 no +24h invent | Confirmed |
| Migration 006 NOT NULL note (superseded by Migration 015) | Historical — fixed in 015 |
| Tests `backend/tests/test_oee_persistence.py` (Postgres 5433, transactional rollback) | Updated for 015 nullability (A–I) |
| Calculator + health pytest | Included in Migration 015 validation (29 total) |
| Alembic head after 015 | `015` |
| Migrations 001–014 unchanged; no leftover test data | Confirmed |
| Ingestion APIs / Q6 rollups / 016 | **Not done** (awaiting approval) |

**Note:** Row-level persistence was validated pre-015 with IntegrityError on NULL edge cases. Migration 015 makes those flushes succeed with SQL NULL.

## OEE Calculation Engine (row-level) — 2026-08-11

Pure Excel DPR_OEE row calculator only — no schema changes, no Migration 015/016, no APIs/frontend/workers, no production seeds, no auto-persist, no period/plant/line rollups (Q6 TBC).

| Item | Status |
|---|---|
| Module backend/app/services/oee_calculator.py (calculate_oee_metrics) | Done |
| Formula registry FORMULA_KEY=dpr_oee_v1, FORMULA_VERSION=1 | Done |
| Decimal math; blank idle/rejection as 0; div-by-zero as None | Confirmed |
| OEE = AD*AF*AT; AG (machine_utilisation) separate from OEE P | Confirmed |
| Q1 midnight: stop_at < start_at => shift-derived metrics None (no +24h invent) | Preserved |
| Explicit shift_time_min input path for fixtures / approved duration | Done |
| Unit tests backend/tests/test_oee_calculator.py (rows 5-6 + edges) | 14 passed |
| Health pytest | 3 passed |
| Migrations 001-014 unchanged; Alembic autogenerate empty (review file deleted, not applied) | Confirmed |
| No production data inserted | Confirmed |
| Persist layer / APIs / Q6 rollups / 015+ | **Not done** (awaiting approval) |

**STOP gate (historical):** Persistence layer now implemented — see OEE Metrics Persistence section above.

## Stage B — Migration 013 (2026-08-11)


Quality extended schema only — `quality_inspections`, `customer_complaints`. No `customers` master (014), no CAPA tables (actions in 010), no quality APIs, frontend, workers, calculators, or seed inspections/complaints. No stored Inspection Pass Rate / Final PPM / Customer PPM. Migrations 001–012 files unchanged.


| Item | Status |

|---|---|

| SQLAlchemy models `QualityInspection`, `CustomerComplaint` | Done |

| Alembic `013_quality_extended` (`down_revision = 012`) | Done |

| `quality_inspections`: UUID PK; `inspection_date` DATE NOT NULL; VARCHAR `inspection_type` (in_process/final concepts; no ENUM; no restrictive CHECK); `part_id`→`parts` NOT NULL; nullable `machine_id`→`machines`; nullable `production_record_id`→`production_records` ON DELETE SET NULL; nullable `lot_code`; `inspected_qty`/`passed_qty`/`rejected_qty` NUMERIC + CHECK `>= 0`; nullable VARCHAR `result_status`; nullable `remarks`; nullable `inspected_by`→`users` ON DELETE SET NULL; timestamps | Done |

| Indexes: `inspection_date`; `(part_id, inspection_date)`; `inspection_type`; `machine_id`; `production_record_id`; `inspected_by` | Done |

| `customer_complaints`: UUID PK; `complaint_date` DATE NOT NULL; UNIQUE `complaint_code`; `customer_name` VARCHAR (customers master deferred to 014); nullable `part_id`→`parts`; nullable `returned_qty` NUMERIC + CHECK `>= 0` when present; VARCHAR `status` (no ENUM); nullable `description`/`severity`/`closed_at`; nullable `created_by`→`users` ON DELETE SET NULL; timestamps | Done |

| Indexes: `complaint_date`; `status`; `(part_id, complaint_date)`; `created_by` | Done |

| No PG ENUM; no stored pass-rate / PPM columns; no `customers` / materials / dispatch tables | Confirmed |

| No seed inspections/complaints | Confirmed |

| 001–012 migration file content unchanged; `production_plans` (012) and maintenance (011) remain after downgrade | Confirmed |

| Q1/Q2/Q6/Q11/Q13/Q17/Hosting remain unresolved | Preserved |

| Validated: upgrade → inspect → downgrade 012 (013 tables gone; PPC + maintenance remain) → re-upgrade head | Passed |

| Alembic `current` = `013 (head)` | Confirmed |

| Alembic target fingerprint: Compose via `127.0.0.1:5433` / `pril_analytics` | Confirmed |

| Health pytest | 3 passed |

| Quality APIs / CAPA workflow / customers master / seeds | **Not done** (out of 013 scope) |


**Deviation / note:** Stage A Step 5.2 / Step 23 lists `quality_inspections` and `customer_complaints` as stubs without a full column sketch. Field shapes follow DOCX Quality KPI inputs (Inspection Pass Rate, Final PPM, Customer Complaints count, Customer PPM numerator) plus existing optional-link patterns from maintenance. `customers` stays in Migration 014 — `customer_name` is free-text until then. CAPA remains polymorphic `actions` / `action_links` (010). Optional Part/Machine/ProductionRecord/User relationships registered.


**STOP gate (historical at 013 completion):** Migration 014 now implemented — see Migration 014 section above.

## Stage B — Migration 012 (2026-08-11)


PPC / production planning schema only — `production_plans` only. No `material_availability_checks`, work orders, MRP, BOM, routing, PPC APIs, frontend, workers, or seed plans. Migrations 001–011 files unchanged.


| Item | Status |

|---|---|

| SQLAlchemy model `ProductionPlan` | Done |

| Alembic `012_ppc` (`down_revision = 011`) | Done |

| `production_plans`: UUID PK; `plan_date` DATE NOT NULL; VARCHAR `horizon` (configurable; no ENUM; no restrictive CHECK); `part_id`→`parts` NOT NULL; nullable `machine_id`→`machines`; nullable `line_id`→`lines` (Q13 TBC); `plan_qty` NUMERIC + CHECK `>= 0`; nullable VARCHAR `status`; nullable `remarks`; timestamps | Done |

| Indexes: `plan_date`; `(part_id, plan_date)`; `(machine_id, plan_date)`; `(line_id, plan_date)` | Done |

| No uniqueness inventing that blocks multiple plans for same part/date/horizon | Confirmed |

| No stored `actual_qty` / achievement% / variance / plan_vs_actual / OEE columns | Confirmed |

| No MRP / work-order / BOM / `material_availability_checks` tables | Confirmed |

| No PG ENUM | Confirmed |

| No seed plans | Confirmed |

| 001–011 migration file content unchanged; maintenance tables remain after downgrade | Confirmed |

| Q1/Q2/Q6/Q11/Q13/Q17/Hosting remain unresolved | Preserved |

| Validated: upgrade → inspect → downgrade 011 (`production_plans` gone; maintenance remain) → re-upgrade head | Passed |

| Alembic `current` = `012 (head)` | Confirmed |

| Alembic target fingerprint: Compose via `127.0.0.1:5433` / `pril_analytics` | Confirmed |

| Health pytest | 3 passed |

| PPC APIs / MRP / scheduling / seeds | **Not done** (out of 012 scope) |


**Deviation / note:** Stage A Step 7 lists `production_plans` and optional thin `material_availability_checks`; Migration 012 creates **only** `production_plans` per approved scope. `horizon` is open VARCHAR (Stage A n/n+1/n+2 concepts documented; no CHECK locking those three). Plan vs Actual remains a query-time join to `production_records` (no stored actual columns). Optional Part/Machine/Line relationships registered.


**STOP gate (historical at 012 completion):** Migration 013 now implemented — see Migration 013 section above.

## Stage B — Migration 011 (2026-08-11)


Maintenance schema only — no MTTR/MTBF/PM% stored columns, no scheduling engine, workers, notifications, maintenance APIs, dashboards, or seed tickets/schedules/completions. Migrations 001–010 files unchanged; `production_records` / `downtime_events` not modified.


| Item | Status |

|---|---|

| SQLAlchemy models `MaintenanceTicket`, `PmSchedule`, `PmCompletion` | Done |

| Alembic `011_maintenance` (`down_revision = 010`) | Done |

| `maintenance_tickets`: UUID PK; `machine_id`→`machines` NOT NULL; nullable `production_record_id`→`production_records` SET NULL; nullable `downtime_event_id`→`downtime_events` SET NULL; UNIQUE `ticket_code`; VARCHAR `maintenance_type`/`priority`/`status` (no ENUM); `problem`/`root_cause`/`corrective_action` TEXT; `opened_at`/`started_at`/`completed_at`; nullable `assigned_to`→`users` SET NULL; timestamps; indexes `machine_id`, `status`, `opened_at`, `(machine_id, opened_at)` | Done |

| `pm_schedules`: UUID PK; `machine_id`→`machines`; `code`/`name`; `description`; `frequency_config` JSONB; nullable `next_due_date`; `is_active`; nullable `owner_id`→`users` SET NULL; UNIQUE(`machine_id`,`code`); timestamps — **no scheduling engine** | Done |

| `pm_completions`: UUID PK; `pm_schedule_id`→`pm_schedules` CASCADE; denormalized `machine_id`→`machines` (app copies schedule.machine_id; no consistency trigger); nullable `completed_by`→`users` SET NULL; nullable `due_date`; `completed_at`; VARCHAR `result_status`; `remarks`; nullable `evidence` JSONB; timestamps | Done |

| No PG ENUM for type/priority/status/result | Confirmed |

| No stored MTTR / MTBF / PM completion % columns | Confirmed |

| No seed maintenance data | Confirmed |

| 001–010 migration file content unchanged; KPI/security/audit tables intact after downgrade | Confirmed |

| Q1/Q2/Q6/Q11/Q13/Q17/Hosting remain unresolved | Preserved |

| Validated: upgrade → inspect → downgrade 010 (011 tables gone; 010 + KPI/security remain) → re-upgrade head | Passed |

| Alembic `current` = `011 (head)` | Confirmed |

| Alembic target fingerprint: Compose via `127.0.0.1:5433` / `pril_analytics` | Confirmed |

| Health pytest | 3 passed |

| Maintenance APIs / scheduling workers / notifications / seeds | **Not done** (out of 011 scope) |


**Deviation / note:** Stage A Step 6 lists entities only (no column list). Column design follows approved implementation brief: real FKs for machine/production_record/downtime_event (not polymorphic); `frequency_config` JSONB for flexible PM cadence; `pm_completions.machine_id` denormalized for history queries with documented app consistency expectation (no fragile DB trigger). Optional Machine/User relationships registered.


**STOP gate:** Migration 011 complete and approved; proceed only under explicit Migration 012+ authorization (012 done — see section above).

## Stage B — Migration 010 (2026-08-11)


Audit, alerts & CAPA actions schema only — no alert engines, workers, email, CAPA workflow, frontend, auth, or seed rules/alerts/actions/users. Migrations 001–009 files unchanged.


| Item | Status |

|---|---|

| SQLAlchemy models `AuditLog`, `AlertRule`, `Alert`, `Action`, `ActionLink` | Done |

| Alembic `010_audit_alerts_actions` (`down_revision = 009`) | Done |

| `audit_logs`: UUID PK; nullable `user_id`→`users` **ON DELETE SET NULL**; `entity_type`/`entity_id` soft refs (no polymorphic business FKs); `field`; `old_value`/`new_value` JSONB; `reason`; Stage A timestamp column `at`; indexes `(entity_type, entity_id, at DESC)`, `(user_id, at DESC)` | Done |

| `alert_rules`: UUID PK; UNIQUE `code`; `name`; nullable `kpi_definition_id`→`kpi_definitions`; `threshold_config` JSONB; VARCHAR `severity` (no ENUM); nullable `condition_config` JSONB; `is_active`; timestamps — **no seed rules** | Done |

| `alerts`: FK `alert_rule_id`→`alert_rules` CASCADE; VARCHAR `severity`; `message`; `acknowledged_at`/`acknowledged_by`→`users` SET NULL; `escalated_at`/`escalated_to`→`users` SET NULL; timestamps; partial unacknowledged index + severity/created_at/alert_rule_id indexes | Done |

| `actions`: CAPA fields; `owner_id`→`users`; VARCHAR `priority`; VARCHAR `status` + CHECK (Open/In Progress/On Hold/Completed/Verified/Closed); `due_date`; `evidence` JSONB; nullable `department_id`→`departments`; indexes `(status, due_date)`, `(department_id)` — no overdue boolean | Done |

| `action_links`: FK `action_id`→`actions` CASCADE; VARCHAR `source_module`; `source_entity_id`; UNIQUE(action_id, source_module, source_entity_id) — no polymorphic FKs | Done |

| No PG ENUM for status/severity/module | Confirmed |

| No seed alerts/actions/rules/users | Confirmed |

| 001–009 migration file content unchanged; `kpi_definitions.owner_role_id` FK intact | Confirmed |

| Q1/Q2/Q6/Q11/Q13/Q17/Hosting remain unresolved | Preserved |

| Validated: upgrade → inspect → downgrade 009 (010 tables gone; security remain; owner_role FK remains) → re-upgrade head | Passed |

| Alembic `current` = `010 (head)` | Confirmed |

| Alembic target fingerprint: Compose via `127.0.0.1:5433` / `pril_analytics` | Confirmed |

| Health pytest | 3 passed |

| Alert engine / CAPA workflow / notifications / seeds | **Not done** (out of 010 scope) |


**Deviation / note:** Stage A Step 13 uses timestamp name `at` (kept; not renamed to `created_at`). `audit_logs.user_id` uses ON DELETE SET NULL (prefer over RESTRICT) so deleting a user retains audit history. Stage A Step 15 lists `action_links` with optional explicit FKs; implemented as soft `source_module` + `source_entity_id` (no polymorphic FKs to production/downtime/etc.). `actions.status` uses VARCHAR + CHECK for Stage A recommended statuses (not irreversible PG ENUM). Escalation on `alerts` is schema-only (`escalated_at`/`escalated_to`).


**STOP gate:** Migration 010 complete and approved; proceed only under explicit Migration 011+ authorization (011 done — see section above).

## Stage B — Migration 009 (2026-08-11)



Security concepts schema only — no JWT, OAuth, sessions, login, signup, middleware, password hashing service, API auth, frontend permissions, RLS, or user/role/permission seeds. Migrations 001–008 files unchanged; adds FK only on existing `kpi_definitions.owner_role_id`.



| Item | Status |

|---|---|

| SQLAlchemy models `User`, `Role`, `RolePermission`, `UserRole` | Done |

| Alembic `009_security_concepts` (`down_revision = 008`) | Done |

| `roles`: UUID PK; `code` UNIQUE VARCHAR (no PG ENUM); `name`; `description`; `is_active`; timestamps — **no seed** of 8 conceptual roles | Done |

| `users`: UUID PK; UNIQUE `employee_code`/`email`; nullable `password_hash` only (no plaintext password); nullable `plant_id`→`plants`, `department_id`→`departments` (**Q11 TBC** — not forced NOT NULL); `is_active`; timestamps — **no seed users** | Done |

| `role_permissions`: FK `role_id`→`roles` CASCADE; VARCHAR `module`/`action` (no ENUM); `is_allowed`; timestamps; UNIQUE(role_id, module, action) — **no permission catalog seed** | Done |

| `user_roles`: FK `user_id`→`users` CASCADE; FK `role_id`→`roles` CASCADE; `created_at`; UNIQUE(user_id, role_id); `created_by` omitted | Done |

| FK `kpi_definitions.owner_role_id` → `roles.id` (+ index); downgrade drops FK/index only (column remains deferred) | Done |

| `import_jobs.uploaded_by` remains deferred UUID **without** FK (out of 009 FK scope) | Confirmed |

| No PG ENUM for roles/module/action | Confirmed |

| No seed users/roles/permissions | Confirmed |

| 001–008 migration file content unchanged | Confirmed |

| Q1/Q2/Q6/Q11/Q13/Q17/Hosting remain unresolved | Preserved |

| Validated: upgrade → inspect → downgrade 008 (security tables gone; KPI remain; `owner_role_id` no FK) → re-upgrade head | Passed |

| Alembic `current` = `009 (head)` | Confirmed |

| Alembic target fingerprint: Compose via `127.0.0.1:5433` / `pril_analytics` | Confirmed |

| Health pytest | 3 passed |

| Auth / JWT / hashing / RLS / permission seeds | **Not done** (out of 009 scope) |



**Deviation / note:** Stage A Step 14 lists conceptual roles (Super Admin … Viewer) — documented as intended VARCHAR codes in migration/model comments; **not seeded**. `users.plant_id` / `department_id` left nullable because Q11 multi-plant is TBC and Stage A does not require NOT NULL for admin/multi-plant flexibility. `user_roles.created_by` skipped (self-ref awkward; Stage A does not require). `import_jobs.uploaded_by` FK intentionally not attached in 009.



**STOP gate (historical at 009 completion):** Migration 010 now implemented — see Migration 010 section above.



## Stage B — Migration 008 (2026-08-11)



KPI registry schema only — no KPI calculation engine, dashboard APIs, alerts, automation, frontend, or KPI definition seeds. Migrations 006/007 unchanged; OEE not duplicated into KPI tables:



| Item | Status |

|---|---|

| SQLAlchemy models `KpiDefinition`, `KpiResult` | Done |

| Alembic `008_kpi_registry` (`down_revision = 007`) | Done |

| `kpi_definitions`: `code`/`name`; FK `department_id` → `departments`; `description`; `unit`; `formula_key` + `formula_version` (backend registry; **no** executable expression); `aggregation_method` VARCHAR+CHECK (SUM\|RATIO_OF_SUMS\|COUNT\|LATEST\|WAVG); target/warning/critical; `weight` nullable unconstrained (**Q17 TBC**); `frequency`; `owner_role_id` nullable UUID **no FK** (roles → 009); `version`/`effective_from`/`effective_to`/`is_active`; timestamps; UNIQUE(code, version) | Done |

| `kpi_results`: FK → `kpi_definitions` CASCADE; `scope_type`+`scope_id` (plant\|department\|line\|machine); `period_type`/`period_start`; `result_value`; `target_value`/`achievement`; formula_key/version snapshot; timestamps; UNIQUE(definition, scope, period, formula_version) | Done |

| No PG ENUM for aggregation/scope/period | Confirmed |

| No `formula_expression` / executable SQL column | Confirmed |

| No weight equal-weight CHECK (Q17 unresolved) | Confirmed |

| 006 metrics/snapshots + 007 ingestion tables untouched | Confirmed |

| Q1/Q2/Q6/Q11/Q13/Q17/Hosting remain unresolved | Preserved |

| Validated: upgrade → inspect → downgrade 007 (KPI tables gone; 007/006 remain) → re-upgrade head | Passed |

| Alembic `current` = `008 (head)` | Confirmed |

| Alembic target fingerprint: Compose via `127.0.0.1:5433` / `pril_analytics` | Confirmed |

| Health pytest | 3 passed |

| KPI engine / dashboard APIs / alerts / seeds | **Not done** (out of 008 scope) |



**Deviation / note:** Stage A Step 10 sketches `kpi_results` at summary level (no full column list). Result shape follows `oee_snapshots` scope/period pattern plus Stage A Overall KPI achievement/target intent; `department` added to `scope_type` (known org dimension for dept KPIs). `owner_role_id` deferred without FK until Migration 009 (FK attached in 009). UNIQUE on results includes `formula_version` for historical calculator integrity.



## Stage B — Migration 007 (2026-08-11)



Ingestion & lineage schema only — no import APIs, Excel/CSV processors, frontend, dashboard, or import/production seeds. Migration 006 OEE schema unchanged:



| Item | Status |

|---|---|

| SQLAlchemy models `ImportJob`, `ImportJobRow`, `ColumnMappingTemplate`, `DataSource`, `CustomFieldDefinition` | Done |

| Alembic `007_ingestion_lineage` (`down_revision = 006`) | Done |

| `import_jobs`: `source_type` VARCHAR+CHECK (excel\|csv\|form\|sheets\|manual\|api); `file_uri`; `uploaded_by` nullable UUID **no FK** (users → 009); `status`; row/success/error counts; `mapping_config` JSONB; `error_summary`; timestamps; indexes `(created_at DESC)`, `(status)` | Done |

| `import_job_rows`: FK → `import_jobs` CASCADE; nullable FK → `production_records`; `row_number`; `external_row_key`; `raw_row_payload` JSONB; `validation_errors` JSONB; UNIQUE(job, row_number) | Done |

| `column_mapping_templates`: `source_type`+CHECK; `name`; optional `department_id`; `mapping` JSONB; `version`/`is_active`; UNIQUE(name, source_type, version) | Done |

| `data_sources`: `code` UK; `name`; `source_type`+CHECK; `config` JSONB (**no secrets**); `freshness_sla_minutes`; `is_active` | Done |

| `custom_field_definitions`: `entity_type`/`field_name`/`field_type`; `options` JSONB; optional `department_id`; Heat No./Stage via definitions + `production_records.custom_fields` JSONB (not mandatory columns) | Done |

| Lineage FK: `production_records.source_import_id` → `import_jobs.id` (nullable; deferred from 005) | Done |

| Partial UNIQUE on `production_records.external_row_key` WHERE NOT NULL (idempotency) | Done |

| No PG ENUM for source types | Confirmed |

| 006 metrics/snapshots untouched | Confirmed |

| Q1/Q2/Q6/Q11/Q13/Q17/Hosting remain unresolved | Preserved |

| Validated: upgrade → inspect → downgrade 006 (007 tables + lineage FK gone; 006 metrics/snapshots remain) → re-upgrade head | Passed |

| Alembic `current` = `007 (head)` | Confirmed |

| Alembic target fingerprint: Compose via `127.0.0.1:5433` / `pril_analytics` | Confirmed |

| Health pytest | 3 passed |

| Import APIs / Excel-CSV processing / frontend / seeds | **Not done** (out of 007 scope) |



**Deviation / note:** Stage A Step 12 sketches ingestion entities at summary level (no full column list). Field shapes follow Step 12 + master-spec sketches + lineage notes; `uploaded_by` deferred without FK until Migration 009. Partial unique on `external_row_key` implements Stage A idempotent-upsert intent (not listed as a named UNIQUE in Step 19).



**STOP gate (historical at 007 completion):** Migration 008 now implemented — see Migration 008 section above.



## Stage B — Migration 006 (2026-08-11)



CALCULATED / OEE schema only — no calculation engine, no metrics/snapshot/production seeds, no API/frontend, no Migration 007+:



| Item | Status |

|---|---|

| SQLAlchemy models `ProductionRecordMetrics`, `OeeSnapshot` | Done |

| Alembic `006_production_calculated` (`down_revision = 005`) | Done |

| `production_record_metrics`: `production_record_id` PK/FK CASCADE (1:1); Excel G/M/P/AB–AG/AR–AU fields; `computed_at`; `formula_version`; non-negative CHECKs | Done |

| AF = `performance` (OEE P); AG = `machine_utilisation` (separate column) | Confirmed |

| `oee_snapshots`: `scope_type` + `scope_id` only (no parallel plant/line/machine FKs); `period_type`/`period_start`; component sums + stored A/P/Q/OEE; `aggregation_rule_version`; UNIQUE(scope, period, rule) | Done |

| Component sums for **proposed** RATIO-OF-SUMS rollup (**Q6 TBC — not confirmed**) | Documented |

| Scope codes `machine`/`line`/`plant`; period codes `day`/`week`/`month` (VARCHAR + CHECK; not PG ENUM) | Done |

| No `period_end` (not in Stage A sketch) | Preserved |

| No calculated columns on `production_records` | Confirmed |

| No PG generated columns for OEE math | Confirmed |

| Q1/Q2/Q6/Q11/Q13/Q17/Hosting remain unresolved | Preserved |

| Validated: upgrade → inspect → downgrade 005 (006 tables gone; 005 raw + rejection seed 10 remain) → re-upgrade head | Passed |

| Alembic `current` = `006 (head)` | Confirmed |

| Alembic target fingerprint: Compose via `127.0.0.1:5433` / `pril_analytics` | Confirmed |

| Health pytest | 3 passed |

| OEE engine / metrics seed / API / frontend | **Not done** (out of 006 scope) |



**Q6 note:** Snapshot component sums (`sum_run_time_min`, `sum_available_time_min`, `sum_produced_qty`, `sum_good_qty`, `sum_rejection_qty`, `sum_run_based_capacity`) and stored ratios assume the Stage A **proposed default** ratio-of-sums (run-time weighted Performance). This is **not business-confirmed**.



## Stage B — Migration 005 (2026-08-11)



RAW operational tables only — no calculated OEE columns, no sample production seed, no API/frontend, no Migration 006+:



| Item | Status |

|---|---|

| SQLAlchemy models `ProductionRecord`, `DowntimeEvent`, `RejectionEvent` | Done |

| Alembic `005_production_raw` (`down_revision = 004`) | Done |

| `production_records`: UUID PK; FKs to plants/machines/shifts/operators/parts; `production_date` DATE; `start_at`/`stop_at` TIMESTAMPTZ; cavity/cycle/produced/planned_downtime; remarks; `custom_fields` JSONB; status; timestamps | Done |

| `downtime_events`: normalized Excel Q–AA; FK production_record + downtime_reason; `minutes`; UNIQUE(record, reason); CHECK minutes > 0 | Done |

| `rejection_events`: normalized Excel AH–AQ; FK production_record + rejection_reason; `qty`; UNIQUE(record, reason); CHECK qty > 0 | Done |

| Indexes per Stage A (plant/date/shift, machine/date/shift, part/date, start_at, stop_at) + duplicate-guard UNIQUE | Done |

| No calculated OEE columns on `production_records` (availability/performance/quality/oee/run_time/…) | Confirmed |

| No `production_record_metrics` / `oee_snapshots` (Migration 006) | Preserved |

| Deferred FKs: `created_by`/`approved_by` → users (009) — nullable UUID columns without FK; `source_import_id` → import_jobs **resolved in Migration 007** | Documented |

| Q1: `production_date` separate from timestamps; no midnight attribution rule | Preserved |

| Q2: downtime category remains on `downtime_reasons` VARCHAR; not hard-coded in events | Preserved |

| Validated: upgrade → inspect → downgrade 004 (005 tables gone; rejection A–J seed still 10) → re-upgrade head | Passed |

| Alembic was `005 (head)` at 005 completion; superseded by 006 | Historical |

| Alembic target fingerprint: Compose via `127.0.0.1:5433` / `pril_analytics` | Confirmed |

| Health pytest | 3 passed |

| Business seed / calculated metrics / API / frontend | **Not done** (out of 005 scope) |



**Deferred FK notes (intentional):**

- `production_records.source_import_id` — nullable UUID; FK to `import_jobs` deferred to Migration 007

- `production_records.created_by` / `approved_by` — nullable UUID; FK to `users` deferred to Migration 009



## Stage B — Seed: rejection_reasons (2026-08-11)



**Separate from schema migrations.** Originally landed while Alembic head was **`004`**. Seed data persists across 005 upgrade/downgrade (004 tables unchanged).



| Item | Status |

|---|---|

| Mechanism | `python -m app.db.seeds.rejection_reasons` (from `backend/`) |

| Files | `backend/app/db/seeds/__init__.py`, `backend/app/db/seeds/rejection_reasons.py` |

| Rows | Exactly 10 Excel codes A–J (no invented reasons) |

| Idempotency | `ON CONFLICT (code) DO NOTHING` — second run inserts 0, total stays 10 |

| Optional fields | `sort_order` 1–10; `excel_column` AH–AQ |

| Not seeded | downtime reasons, parts, machines, operators, shifts, production |

| Validated against Compose `127.0.0.1:5433` / `pril_analytics` | Passed |

| Survives 005 downgrade → 004 | Confirmed (count remains 10) |



**How to run** (venv active, from `backend/`):

```text
python -m app.db.seeds.rejection_reasons
```



**Seeded mapping:**  
A Short Moulding, B Shrinkage Mark, C Silver Streak, D Flow Mark, E Weld Line, F Dent Mark, G Power Cut, H Black Marks, I Crack Marks, J Others.



## Stage B — Migration 004 (2026-08-11)



Part / reason masters only — no seed data, no API/frontend, no Migration 005+:



| Item | Status |

|---|---|

| SQLAlchemy models `Part`, `DowntimeReason`, `RejectionReason`, `MachinePartStandard` | Done |

| Alembic `004_part_reason_masters` (`down_revision = 003`) | Done |

| `parts`: id PK UUID, code UK, name, default_cavity, default_cycle_time_sec, timestamps | Done |

| `downtime_reasons`: code UK, label, **category VARCHAR** (Q2 TBC — not PG ENUM), is_active, sort_order, excel_column NULL, timestamps | Done |

| `rejection_reasons`: code UK, label, is_active, sort_order, excel_column NULL, timestamps | Done |

| Excel rejection codes A–J supported via `code` VARCHAR(64) UNIQUE + `label` (capability verified in 004; **catalog seeded later via separate script**) | Done |

| Excel downtime codes 1–11 supported via `code`+`label` (capability verified; **not seeded**) | Done |

| `machine_part_standards`: machine_id FK, part_id FK, cycle_time_sec, cavity_count, UNIQUE(machine, part), FK indexes, timestamps | Done |

| Q2: category remains configurable VARCHAR; no planned/unplanned ENUM | Preserved |

| No PG ENUMs; no business seed rows | Preserved |

| Validated: upgrade → inspect → capability check (rollback) → downgrade 003 → re-upgrade head | Passed |

| Alembic target fingerprint: Compose via `127.0.0.1:5433` / `pril_analytics` | Confirmed |

| Health pytest | 3 passed |

| Business seed / ENUMs / API / frontend | **Not done in 004** (rejection A–J seeded via separate step — see above) |



**Expected Excel rejection mapping** (schema in 004; **seeded** via `python -m app.db.seeds.rejection_reasons`):  
A Short Moulding, B Shrinkage Mark, C Silver Streak, D Flow Mark, E Weld Line, F Dent Mark, G Power Cut, H Black Marks, I Crack Marks, J Others.



**Expected Excel downtime mapping** (schema-ready; seed later):  
1 Manpower Shortage, 2 Mould Trial, 3 Bin Shortage, 4 Material Shortage, 5 M/c Under BD, 6 Nozzle Block, 7 Mould Problem, 8 Crystal/ Insert Shortage, 9 Power Failure, 10 Process Setting, 11 Others.



## Stage B — Migration 003 (2026-08-11)



Asset / people masters only — no seed data, no API/frontend, no Migration 004+:



| Item | Status |

|---|---|

| SQLAlchemy models `MachineType`, `MachineStatus`, `Machine`, `Operator`, `Shift`, `ShiftCalendar` | Done |

| Alembic `003_asset_people_masters` (`down_revision = 002`) | Done |

| `machine_types`: id PK UUID, code UK, name, is_active, created_at/updated_at | Done |

| `machine_statuses`: id PK UUID, code UK, name, is_active, created_at/updated_at | Done |

| `machines`: plant_id FK, line_id FK **NULL** (Q13), code UK(plant), name, machine_type_id FK, status_id FK, ideal_cycle_time_sec NULL, timestamps + FK indexes | Done |

| `operators`: employee_code UK, name, department_id FK nullable, timestamps | Done |

| `shifts`: plant_id FK, code UK(plant), name, start_time, end_time, crosses_midnight bool (Q1 flag only), timestamps | Done |

| `shift_calendars`: plant_id FK, calendar_date, shift_id FK, is_holiday, UNIQUE(plant, date, shift), timestamps | Done |

| Q13: `machines.line_id` nullable; no hard-coded machine→line mappings | Preserved |

| Q1: no midnight shift-date attribution rule; `crosses_midnight` configurable flag only | Preserved |

| No PG ENUMs for classifiers | Preserved |

| Validated: upgrade → inspect → downgrade 002 → re-upgrade head | Passed |

| Alembic target fingerprint: Compose via `127.0.0.1:5433` / `pril_analytics` | Confirmed |

| Health pytest | 3 passed |

| Business seed / ENUMs / API / frontend | **Not done** (out of 003 scope) |



## Stage B — Migration 002 (2026-08-10)



Org masters only — no seed data, no API/frontend, no Migration 003+:



| Item | Status |

|---|---|

| SQLAlchemy models `Plant`, `Department`, `Line` | Done |

| Alembic `002_org_masters` (`down_revision = 001`) | Done |

| `plants`: id PK UUID, code UK, name, timezone, is_active, created_at/updated_at | Done |

| `departments`: id PK UUID, code UK, name, created_at/updated_at (global catalog; no plant_id) | Done |

| `lines`: id PK UUID, plant_id FK→plants, code, name, UNIQUE(plant_id, code), ix_lines_plant_id, timestamps | Done |

| Q13: lines table present; machines.line_id deferred to 003 (nullable later) | Preserved |

| Validated: upgrade → inspect → downgrade 001 → re-upgrade head | Passed |

| Alembic target fingerprint: Compose via `127.0.0.1:5433` / `pril_analytics` | Confirmed |

| Health pytest | 3 passed |

| Business seed / ENUMs / API / frontend | **Not done** (out of 002 scope) |



## Stage B — B0 / Migration 001 (2026-08-10)



Implemented and validated (extensions/helpers only — no business tables, no seeds):



| Item | Status |

|---|---|

| Alembic 1.15.2 added (SQLAlchemy 2.0.40 compatible) | Done |

| `alembic.ini` + `alembic/env.py` (uses `settings.database_url`) | Done |

| SQLAlchemy `DeclarativeBase` (`app/db/base.py`) | Done |

| Session helpers extended (`get_db` / sessionmaker) without breaking health | Done |

| Migration **001** — `CREATE EXTENSION pgcrypto` (upgrade + downgrade) | Done |

| Validated: upgrade → verify extension → downgrade → re-upgrade | Passed (after infra fix) |

| Health pytest suite | 3 passed |

| Business tables / ENUMs / seeds / API / frontend changes | **Not done** (out of 001 scope) |



### B0 validation failure (found and fixed 2026-08-10)



Initial “validated” claim was inconsistent: Compose `pril_analytics` (via `docker exec`) was empty (`\dt` empty, no `pgcrypto`, no `alembic_version`) while `alembic current` reported `001 (head)`.



**Root causes:**

1. **Wrong database target** — host `localhost:5432` hit Windows service `postgresql-x64-16` (already stamped at 001), not Docker Compose Postgres. Compose publish now defaults to host port **5433**; backend uses `127.0.0.1:5433`.

2. **Migration transaction not committed** — `connect()` + `context.begin_transaction()` logged “Running upgrade → 001” then rolled back on connection close. Fixed with SQLAlchemy 2 `engine.begin()`.



**Re-validation** (same Alembic URL + `docker exec` on `pril_analytics`/`public`): empty → `upgrade head` → `pgcrypto` + `alembic_version=001` → `downgrade base` → `pgcrypto` gone → `upgrade head` again → `pgcrypto` + `001`.



## TBC / Business Confirmation Required



These remain **TBC / Business Confirmation Required** — not permanently decided (unchanged):



| ID | Topic | Status |

|---|---|---|

| Q1 | Midnight-crossing shift date attribution | TBC / Business Confirmation Required |

| Q2 | Planned downtime categories | TBC / Business Confirmation Required |

| Q6 | OEE aggregation and Run-Time Performance rollup | **Approved / service + read-only dashboard APIs + frontend dashboard UI complete** — ratio-of-sums runtime (`AGGREGATION_RULE_VERSION=1`) |

| Q11 | Multi-plant requirement | TBC / Business Confirmation Required |

| Q13 | Line-to-machine mapping | TBC / Business Confirmation Required |

| Q17 | Overall KPI weights | TBC / Business Confirmation Required |

| Hosting | On-prem / private cloud / AWS / Azure preference | TBC / Business Confirmation Required |



Details: [business-confirmations-tbc.md](business-confirmations-tbc.md).



Design treats these as configurable placeholders only — see [database-design.md](database-design.md).



## Phase 1 — Project Foundation



- [x] React + TypeScript + Vite frontend scaffold + application shell

- [x] FastAPI backend scaffold + `/api/v1/health`

- [x] PostgreSQL configuration + `docker-compose.yml`

- [x] `.env.example` files (no secrets committed)

- [x] README with local setup instructions

- [x] Basic linting / type checking / tests + CI skeleton



## Phase 2 — Stage A (Design Only)



- [x] Independent Excel DPR_OEE column mapping (Steps 1–23)

- [x] Master / production / downtime / quality / maintenance / PPC design

- [x] Raw vs calculated KPI separation + OEE model

- [x] Ingestion, audit, security conceptual model, alerts/actions

- [x] ER diagram, normalization, indexing, volume, risks

- [x] Staged migration **plan** only (no migration files in Stage A)

- [x] Deliverable: [database-design.md](database-design.md) — **FINAL-APPROVED**

- [x] Stage B prep inspection — complete

- [x] Stage B B0 + Migration 001 — complete

- [x] Stage B Migration 002 (org masters) — complete

- [x] Stage B Migration 003 (asset/people masters) — complete

- [x] Stage B Migration 004 (part/reason masters) — complete

- [x] Stage B rejection_reasons seed (Excel A–J; separate from Alembic) — complete

- [x] Stage B Migration 005 (production raw) — complete

- [ ] Stage B Migration 006+ — **awaiting approval**



## Explicitly NOT started (Migration 006+ / later)



- [ ] Production calculated tables (`production_record_metrics`, `oee_snapshots`) — Migration 006

- [ ] Remaining seed / business data (downtime 1–11, plants/shifts/machines/parts, etc.) — rejection A–J **done** via separate seed

- [ ] Auth / RBAC implementation

- [x] Excel DPR_OEE ingestion service (service layer)
- [x] Excel DPR_OEE ingestion APIs (FastAPI boundary; no UI yet)
- [ ] Excel/CSV ingestion UI
- [ ] Google Forms / Sheets webhook ingestion

- [x] OEE row-level calculation service (dpr_oee_v1) — validated 2026-08-11
- [x] OEE row-level metrics persistence (`production_record_metrics` upsert) — validated 2026-08-11
- [x] OEE period rollup service (Q6 ratio-of-sums → `oee_snapshots`)
- [x] Dashboard read-only OEE APIs (`/api/v1/dashboard/oee*`) — validated 2026-08-11
- [ ] KPI engine
- [x] Frontend OEE dashboard UI (read-only snapshots)

- [x] Production / OEE dashboard UI (read-only; Phase 2 Stage B)
- [ ] Quality / Maintenance / PPC dashboards (UI)

- [ ] Management scorecard, alerts, actions, SSE

- [ ] Google Forms/Sheets, AI, IoT



## Completed earlier



- [x] Project folder / reference DOCX / Excel / docs

- [x] Architecture baseline approved

- [x] TBC decisions recorded as TBC

- [x] Phase 1 foundation

- [x] Stage A design + revision + final approval

- [x] Stage B preparation inspection

- [x] Stage B B0 + Migration 001 (extensions/types) — infra fix re-validated

- [x] Stage B Migration 002 (plants, departments, lines) — validated

- [x] Stage B Migration 003 (asset/people masters) — validated

- [x] Stage B Migration 004 (part/reason masters) — validated

- [x] Stage B rejection_reasons seed (Excel A–J) — validated

- [x] Stage B Migration 005 (production raw) — validated; awaiting 006 approval
