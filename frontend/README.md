# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.


## OEE dashboard (Phase 2 Stage B)

The app root renders a read-only **OEE & Production Performance** dashboard that
consumes existing backend routes under `/api/v1/dashboard/*`.

- Central client: `src/api/client.ts`, `src/api/dashboard.ts`
- Presentation formatters only: `src/utils/format.ts` (decimal → % display; null → N/A)
- Charts: ECharts via `echarts` + `echarts-for-react`
- No Vitest suite yet — use manual validation below

### Manual validation

1. Start Postgres + FastAPI (`uvicorn` on `:8000`) with Alembic head `015`.
2. Ensure at least one `oee_snapshots` row exists (via approved rollup path).
3. `npm run dev` in `frontend/` (Vite proxy `/api` → `http://127.0.0.1:8000`).
4. Enter a real `scope_id` UUID (plant/line/machine), period type, period start → Apply.
5. Confirm KPI cards show API decimals as percents (e.g. `0.844815` → `84.48%`).
6. Confirm Machine Utilisation shows **N/A** when `machine_utilisation` is null (never `0%`).
7. Confirm breakdown bar chart and trend line use API fields only; A/P/Q toggles do not recalculate OEE.
8. With `scope_type=plant`, confirm Machines / Lines / Plants tables load; Filter drill sets scope from row.
9. With empty DB / unknown UUID: loading → empty or 404 empty state (no fake live status).
10. `npm run typecheck` and `npm run build` succeed.

### API gaps (no backend changes in this layer)

- No master-list endpoints for plants/lines/machines — `scope_id` is manual UUID entry.
- `/oee/machines` and `/oee/lines` require `plant_id`; machine/line scope cannot reverse-lookup plant without inventing mappings.
- Trend `period_start_from`/`to` are a UI presentation window derived from `period_start` (not a business calendar rule).
