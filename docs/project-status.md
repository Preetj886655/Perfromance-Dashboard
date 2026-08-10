# Patil Manufacturing Analytics Platform

## Project Status

Current Phase: **Phase 1 — Project Foundation (COMPLETE)**

Phase 2+ has **not** been started.

## Approval Record (2026-08-10)

- [x] Implementation plan approved as working architecture baseline
- [x] Technical stack approved (React+TS+Vite, FastAPI, PostgreSQL, ECharts, AG Grid, SSE, Docker Compose)
- [x] Excel DPR_OEE formulas confirmed as OEE calculation source of truth
- [x] Phase 1 foundation explicitly authorized and completed
- [x] TBC business questions documented as still TBC (not resolved)

## TBC / Business Confirmation Required

These remain **TBC / Business Confirmation Required** — not permanently decided:

| ID | Topic | Status |
|---|---|---|
| Q1 | Midnight-crossing shift date attribution | TBC / Business Confirmation Required |
| Q2 | Planned downtime categories | TBC / Business Confirmation Required |
| Q6 | OEE aggregation and Run-Time Performance rollup | TBC / Business Confirmation Required |
| Q11 | Multi-plant requirement | TBC / Business Confirmation Required |
| Q13 | Line-to-machine mapping | TBC / Business Confirmation Required |
| Q17 | Overall KPI weights | TBC / Business Confirmation Required |
| Hosting | On-prem / private cloud / AWS / Azure preference | TBC / Business Confirmation Required |

Details: [business-confirmations-tbc.md](business-confirmations-tbc.md)

## Phase 1 — Project Foundation

- [x] React + TypeScript + Vite frontend scaffold + application shell
- [x] FastAPI backend scaffold + `/api/v1/health`
- [x] PostgreSQL configuration + `docker-compose.yml`
- [x] `.env.example` files (no secrets committed)
- [x] README with local setup instructions
- [x] Basic linting / type checking / tests + CI skeleton

## Explicitly NOT started (Phase 2+)

- [ ] Database schema / migrations / master data
- [ ] Auth / RBAC
- [ ] Excel/CSV ingestion
- [ ] KPI/OEE engine
- [ ] Production / OEE / Quality / Maintenance / PPC dashboards
- [ ] Management scorecard, alerts, actions, SSE
- [ ] Google Forms/Sheets, AI, IoT

## Completed earlier

- [x] Project folder / reference DOCX / Excel / docs
- [x] Architecture baseline approved
- [x] TBC decisions recorded as TBC
