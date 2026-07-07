# Sonar Report Generator — Design

**Date:** 2026-07-07
**Status:** Approved (design), pending spec review

## Purpose

A small, cross-platform (Windows + macOS) local web tool that generates two
distinct PDF reports from a SonarQube Cloud or Server project, using the Sonar
Web API. A single-page UI lets the user opt in to either or both reports.

1. **Regulatory + SCA report** — reuse Sonar's own regulatory report PDF and
   append a page with A–E risk ratings for dependency risk, license risk, and
   malicious packages.
2. **Maintenance report** — a single page showing the evolution of security,
   reliability, and maintainability issue counts over the last 3 or 9 months,
   one line chart per issue type.

## Run model

- **Local Node app.** `npm start` boots a local Express server and auto-opens
  the browser to the UI. One command, no build step for the user, identical on
  Windows and macOS (requires Node installed).
- The **token never leaves the local machine.** The browser talks only to the
  local backend; the backend talks to Sonar. This avoids CORS and keeps the
  token out of browser storage.

## Technology choices

- **Backend:** Node + Express.
- **PDF:** `pdf-lib` (pure JS) — load and extend Sonar's existing PDF (Report 1),
  and build a fresh PDF (Report 2).
- **Charts:** Chart.js rendered onto a `@napi-rs/canvas` canvas → PNG buffer,
  embedded into the PDF. `@napi-rs/canvas` ships prebuilt binaries (no native
  compile), so it installs cleanly on Windows and macOS — unlike `node-canvas`.
- **Frontend:** single static HTML page styled per the `design-taste-frontend`
  skill (installed at implementation time via
  `npx skills add https://github.com/Leonxlnx/taste-skill "design-taste-frontend"`).

## Project structure

```
sonar-report/
├── package.json          # "start": launch server + open browser
├── server/
│   ├── index.js          # Express server: serves UI + API, opens browser
│   ├── sonar-client.js   # Sonar Web API calls (Cloud/Server routing, Bearer)
│   ├── report-regulatory.js  # Report 1: extend Sonar's PDF with SCA page
│   ├── report-maintenance.js # Report 2: build trends PDF with charts
│   ├── sca.js            # fetch + compute A–E ratings for SCA
│   ├── charts.js         # Chart.js + @napi-rs/canvas → PNG buffers
│   └── pdf-style.js      # shared Sonar colors/fonts/layout constants
└── public/
    └── index.html        # single-view UI (design-taste-frontend styling)
```

Each module has one clear purpose and a small interface: `sonar-client` returns
raw API data, `sca` turns SCA data into ratings, `charts` turns series into PNGs,
the two `report-*` modules turn inputs into a PDF file on disk, and `index.js`
wires HTTP requests to those functions.

## UI — single view

Fields top to bottom, styled per `design-taste-frontend`:

- **Sonar token** — password input.
- **Deployment** — dropdown: `SonarQube Cloud` / `SonarQube Server`.
- **Base URL** —
  - Cloud: prefilled `https://api.sonarcloud.io`, **locked / read-only**.
  - Server: editable textbox for the instance URL.
- **Project key** — text.
- **Organization key** — text (used for Cloud; optional/ignored for Server).
- **Reports** — two opt-in checkboxes, both checked by default:
  - ☑ Regulatory + SCA report
  - ☑ Maintenance report
  - At least one must be selected (validated).
- **Period** — shown only when Maintenance is checked: dropdown
  `Last 3 months` / `Last 9 months`.
- **Output folder** — text input prefilled with a default (`~/Downloads`),
  editable. Backend creates it if missing and validates write access.
- **Generate** button → shows per-report progress and final file paths / errors.

## Sonar API integration

All requests send header `Authorization: Bearer <token>`. Routing by deployment:

| Purpose | Cloud | Server |
|---|---|---|
| Regulatory report zip | documented Cloud org/enterprise endpoint | `GET api/regulatory_reports/download` |
| SCA risk report | `GET /sca/risk-reports?component=<key>` | `GET /api/v2/sca/risk-reports?component=<key>` |
| Measures history | `GET /api/measures/search_history` | same (identical for both) |

- **Measures:**
  `GET /api/measures/search_history?component=<projectKey>&metrics=software_quality_security_issues,software_quality_maintainability_issues,software_quality_reliability_issues&from=<computed date>`
  — follow paging to completion.
- **Verification items (resolve during planning):**
  - Exact Cloud regulatory report endpoint path and required params
    (branch, organization, project).
  - Server `api/regulatory_reports/download` required params (project, branch).
  - The exact JSON shape of `sca/risk-reports` entries, especially the severity
    field name/values for the dependency (VULNERABILITY) rating.

## Report 1 — Regulatory + SCA page

1. Download the regulatory report zip and extract `regulatory_report_summary.pdf`
   in memory.
2. Fetch the SCA risk report. Count only entries with `riskStatus == "OPEN"`,
   bucketed by `riskType`:
   - `VULNERABILITY` → dependency risk
   - `PROHIBITED_LICENSE` → license risk
   - `MALWARE` → malicious package
3. Compute three A–E ratings:
   - **Dependency risk** — by worst severity present among OPEN VULNERABILITY
     entries:
     - A: ≥ 0 info issues (i.e. none, or only info)
     - B: ≥ 1 low issue
     - C: ≥ 1 medium issue
     - D: ≥ 1 high issue
     - E: ≥ 1 blocker issue

     (The rating is the highest band reached: e.g. any blocker → E.)
     *Assumption to verify: each entry carries a severity field with levels
     info/low/medium/high/blocker. Confirm the response shape in planning; flag
     and adjust the mapping if it differs.*
   - **License risk** — by count of OPEN PROHIBITED_LICENSE entries:
     - A: 0, B: 1, C: 2, D: 3, E: > 3
   - **Malicious package** — by count of OPEN MALWARE entries:
     - A: 0, E: otherwise
4. Load Sonar's PDF with `pdf-lib` and **append a new page** replicating Sonar's
   style (fonts, colors, header/footer), showing the three ratings as Sonar-style
   letter badges (A–E).
5. Save as `regulatory_report_<projectKey>_<YYYY-MM-DD>.pdf` in the output folder.

## Report 2 — Maintenance report

1. Compute the `from` date: today minus 3 or 9 months per the selected period.
2. Call `search_history` for the three issue metrics; collect `{date, value}`
   series per metric.
3. Render **three line charts** (security, reliability, maintainability) with
   Chart.js on a `@napi-rs/canvas` canvas → PNG buffers. X axis = time, Y axis =
   issue count.
4. Build a fresh single-page PDF in Sonar style (title, project key, period,
   generated date) and embed the three charts stacked on one page.
5. Save as `maintenance_report_<projectKey>_<YYYY-MM-DD>.pdf` in the output
   folder.

## Error handling

- Per-field validation: missing token / project key, malformed base URL,
  no report selected, missing period when maintenance is selected.
- Network / auth failures surfaced with the Sonar HTTP status code and a
  readable message.
- Reports are independent: if one fails, the other still generates; the UI
  reports each report's outcome separately.
- Output-folder creation / permission errors reported clearly.
- No errors silently swallowed.

## Testing

- **Unit tests** (pure logic, fixture API responses):
  - A–E rating functions — table of inputs → expected letters, including
    boundaries (0/1/2/3/>3 for license; each severity band for dependency;
    0/nonzero for malware).
  - Cloud vs Server URL routing for each endpoint.
  - `from`-date computation for 3 and 9 months.
  - Paging accumulation for `search_history`.
- **Smoke test:** a run that asserts each generator produces a valid, non-empty
  PDF (correct page count; Report 1 = original pages + 1).

## Out of scope (YAGNI)

- Packaged desktop installer (Electron/Tauri) — the local Node app is sufficient.
- Native OS folder-picker dialog — a path textbox with a default is used instead.
- Combined multi-series chart — spec calls for one chart per issue type.
- Historization / storage of past reports beyond writing files to the chosen
  folder.
