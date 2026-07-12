# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

No build step. Open `login.html` directly in a browser, or serve locally:

```bash
# Python
python -m http.server 8080

# Node
npx serve .
```

The app defaults to `http://localhost:3001` as the backend API when served (not via `file://`). If the backend is unavailable, all features fall back to `localStorage` automatically — no backend is required to run or develop.

## Architecture

Pure frontend SPA — no framework, no bundler, no npm.

**Entry points:**
- `login.html` + `login.css` — authentication page
- `index.html` + `styles.css` — main application shell (all views embedded as `<section>` elements)

**Scripts (load order matters — see the bottom of `index.html` for the authoritative order):**
- `auth.js` — loads first. Runs an IIFE that immediately redirects unauthenticated users. Manages `vulcan_session` in `localStorage` (8-hour TTL), role-based tab visibility, and wraps `window.switchTab` to enforce permissions.
- `demo-data.js` — fixture data for the commercial demo.
- `core.js` — shared foundation: the global `state` object, `switchTab`, `API_BASE`/`AUTH_API`, and the `apiGet`/`apiPut` helpers. Must load before every domain module below.
- Domain modules, one per area: `clients.js`, `alerts.js`, `inventory.js`, `data-entry.js`, `wms.js`, `dashboard.js`, `inventory-ui.js`, `invoicing.js`, `picking.js`, `reports.js`, `purchasing.js`, `permissions.js`, `melyor.js` (the AI assistant).

**Global state** is a single `state` object in `core.js` (products, invoices, pickingLists, materials, etc.). It is persisted to `localStorage` and optionally synced to the backend via `apiGet`/`apiPut` helpers.

**Tab/view routing** is handled by `switchTab(tabId)` which toggles `.active` on `<section id="{tab}-view">` elements. The active tab is gated by the user's role via `ROLE_TABS` in `auth.js`.

## Roles & Demo Credentials

| Username | Password | Role | Access |
|---|---|---|---|
| `admin` | `admin123` | admin | All modules |
| `warehouse` | `warehouse123` | warehouse | dashboard, inventory, logistics, picking |
| `cashier` | `cashier123` | cashier | dashboard, invoicing |

## Modules

- **Dashboard** — KPI stats, weekly billing chart (SVG), recent transactions
- **Inventory** — product CRUD via modal, searchable/filterable table
- **Invoicing (POS)** — invoice builder with live receipt preview, discount/tax controls
- **Logistics/WMS** — ABC rotation analysis, Pareto chart, warehouse heatmap, relocation recommendations
- **Picking** — order preparation workflow with sub-tabs (nueva → proceso → completado)
- **Data Entry** — configurable sub-tabs for materials, suppliers, locations, movements, transit, labels
- **Clients (CRM)** — purchase history, notes, inactive-client detection
- **Alerts** — proactive low-stock, inactive-client and pending-invoice warnings
- **Reports** — sales, rotation, profitability and per-client reports, exportable
- **Purchasing** — purchase orders grouped by supplier, auto-numbered
- **Permissions** — configurable per-role access
- **Melyor** — the AI assistant surfaced across the app (`melyor.js`)
- **Settings** — company info, currency, tax ID; "Format Database" resets all localStorage data

## Backend Integration

`auth.js` and `core.js` both detect `window.location.protocol === 'file:'` to set `API_BASE`/`AUTH_API` to `http://localhost:3001`. All API calls (JWT Bearer token) silently fall back to local data on failure.

## External Dependencies

Only one CDN dependency: SheetJS (`xlsx.full.min.js`) loaded in `index.html` for Excel import/export in the data entry module.
