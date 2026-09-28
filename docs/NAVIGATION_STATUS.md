# Patil Operations Command Center — Navigation Audit & Status
**Document Version:** 1.0.0  
**Audit Date:** 2026-09-14  
**Audit Scope:** Complete sidebar navigation taxonomy, application routes, and data model bindings.

---

## 1. Executive Summary

This document audits all navigation entry points across the Patil Manufacturing Operations Command Center. Each route is classified according to its operational completeness:

- **`WORKING`**: Complete end-to-end functionality backed by real data or authenticated services.
- **`PARTIAL`**: Active route with functional interface components, but with partial data or limited sub-view focusing.
- **`STUB`**: Navigable shell with UI placeholders, pending enterprise data feed integration. **No artificial mock backends have been fabricated.**
- **`MISSING`**: Declared in specifications but absent from routing.

---

## 2. Sidebar Navigation Items Audit

| # | Sidebar Label | Route Hash | Icon | Classification | Active Data Source & Implementation Details |
| :-: | :--- | :--- | :-: | :---: | :--- |
| 1 | **Overview** | `#/dashboard` | `◉` | **`WORKING`** | Live Google Sheets connection & 14-slide executive carousel (`ExecutiveOverview`, `Production`, `ProdLoss`, `Downtime`, `Quality`, etc.). Fully interactive. |
| 2 | **Production** | `#/production` | `▣` | **`PARTIAL`** | Navigates to Production slide view within analytics context. Backed by real DPR production and target metrics. Direct deep-link focus enabled in Phase 6. |
| 3 | **Quality** | `#/quality` | `◌` | **`PARTIAL`** | Navigates to Quality slide view. Tracks total rejection and rejection rate % across lines and work centers. |
| 4 | **PPC** | `#/ppc` | `▤` | **`STUB`** | Production Planning & Control. The Medchal factory Google Sheet lacks PPC dispatch schedules and work orders. Gracefully renders informative status banner. |
| 5 | **SCM** | `#/scm` | `↔` | **`STUB`** | Supply Chain Management. Raw material vendor shipments and procurement lead times are not in the DPR log. |
| 6 | **Store** | `#/store` | `▦` | **`STUB`** | Raw materials & finished goods warehouse inventory. Awaiting ERP/WMS feed integration. |
| 7 | **Maintenance** | `#/maintenance` | `⚙` | **`PARTIAL`** | Directly connected to equipment downtime, idle reason breakdown, and MTBF/loss telemetry in Downtime Command Center. |
| 8 | **NPD / Design** | `#/npd` | `✦` | **`STUB`** | New Product Development / Die tooling changeovers. Tool change records are currently captured as downtime reasons only. |
| 9 | **HR** | `#/hr` | `◍` | **`STUB`** | Human Resources / Operator attendance logs. Operator names are captured in DPR records, but biometric attendance systems are not integrated. |
| 10 | **Safety** | `#/safety` | `▲` | **`STUB`** | Plant EHS safety incident logging. No safety incidents logged in DPR source. |
| 11 | **Logistics / Dispatch** | `#/logistics` | `⇄` | **`STUB`** | Finished goods dispatch notes and transporter manifests. Not present in DPR source. |
| 12 | **5S** | `#/5s` | `▭` | **`STUB`** | Plant 5S audit checklist and workplace organization scoring. |
| 13 | **KPI & Reports** | `#/kpi` | `▁` | **`PARTIAL`** | Deep-links to Executive Overview summary metrics and historical period comparisons. |
| 14 | **Data Import** | `#/data-import` | `⇪` | **`WORKING`** | Complete data import pipeline: CSV/XLSX file drag-and-drop, schema preview, missing cell auditing, duplicate detection, and dedicated analysis sandbox. |
| 15 | **Google Forms** | `#/google-forms` | `▣` | **`STUB`** | Digital shift handover form launcher. External link placeholder. |
| 16 | **Pending Actions** | `#/actions` | `⚑` | **`PARTIAL`** | Displays priority action tracker for plant leadership (Downtime review, CAPA, SCM review). |
| 17 | **Settings** | `#/settings` | `⚙` | **`STUB`** | System preferences, theme toggles, and notification thresholds. |

---

## 3. Dedicated Application Routes & Auth Pages

| # | Route Hash | Component | Classification | Operational Notes |
| :-: | :--- | :--- | :---: | :--- |
| 18 | `#/masters` | [`MasterDataPage.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/pages/MasterDataPage.tsx) | **`WORKING`** | Comprehensive Master Data CRUD for Lines, Shifts, Machines, and Parts. Communicates with FastAPI master data endpoints. |
| 19 | `#/users` | [`UserManagementPage.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/pages/UserManagementPage.tsx) | **`WORKING`** | User administration: role assignment (Plant Lead, Supervisor, Admin), status toggles, and permission auditing. |
| 20 | `#/oee` | [`OeeDashboard.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/pages/OeeDashboard.tsx) | **`PARTIAL`** | Dedicated OEE analytical deep-dive. Transparently flags when data sources lack Availability and Performance factors. |
| 21 | `#/login` | [`LoginPage.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/pages/LoginPage.tsx) | **`WORKING`** | JWT authentication, session handling, credential validation. |
| 22 | `#/forgot-password` | [`ForgotPasswordPage.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/pages/ForgotPasswordPage.tsx) | **`WORKING`** | Password reset request workflow. |
| 23 | `#/reset-password` | [`ResetPasswordPage.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/pages/ResetPasswordPage.tsx) | **`WORKING`** | Password update with reset token. |
| 24 | `#/create-account` | [`CreateAccountPage.tsx`](file:///c:/Users/Preet%20Jaiswal/Downloads/Patil-Manufacturing-Analytics/frontend/src/pages/CreateAccountPage.tsx) | **`WORKING`** | Self-service registration gateway with plant lead approval. |

---

## 4. Policy on Unrelated Stubs

> [!IMPORTANT]
> **Strict Anti-Fabrication Boundary**:
> In accordance with core system directives, modules marked as `STUB` (such as HR, SCM, Store, 5S, Safety) **are not populated with fake, mock, or hardcoded operational data**.
>
> When a user selects a `STUB` route, the application renders a clean, professional status panel explaining that the module awaits real enterprise connector integration, rather than misrepresenting fabricated numbers to plant executives.

