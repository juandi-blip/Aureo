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

**Scripts (load order matters):**
- `auth.js` — must load before `app.js`. Runs an IIFE on load that immediately redirects unauthenticated users. Manages `vulcan_session` in `localStorage` (8-hour TTL), role-based tab visibility, and wraps `window.switchTab` to enforce permissions.
- `app.js` — all application logic: state, rendering, CRUD for products/invoices/picking/data-entry, ABC analysis, WMS heatmap, chart rendering.

**Global state** is a single `state` object in `app.js` (products, invoices, pickingLists, materials, etc.). It is persisted to `localStorage` and optionally synced to the backend via `apiGet`/`apiPut` helpers.

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
- **Settings** — company info, currency, tax ID; "Format Database" resets all localStorage data

## Backend Integration

`auth.js` and `app.js` both detect `window.location.protocol === 'file:'` to set `API_BASE`/`AUTH_API` to `http://localhost:3001`. All API calls (JWT Bearer token) silently fall back to local data on failure.

## External Dependencies

Only one CDN dependency: SheetJS (`xlsx.full.min.js`) loaded in `index.html` for Excel import/export in the data entry module.
