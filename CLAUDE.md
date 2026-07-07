# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install deps (Node >= 18)
npm start            # boot Express server on :5173 and auto-open the browser (PORT env overrides)
npm test             # run all tests via node's built-in runner (node --test)
node --test test/sca.test.js                          # run a single test file
node --test --test-name-pattern="paged history"       # run tests matching a name
```

There is no build step and no lint config — plain CommonJS Node, no transpilation.

## Architecture

A local web tool that generates two SonarQube PDF reports. The browser talks only to the local Express backend; the backend talks to Sonar. This is deliberate: **the Sonar token never leaves the machine** (avoids CORS, keeps the token out of browser storage). `public/index.html` is a single static page served by the same server.

Request flow: `public/index.html` → `POST /api/generate` (`server/index.js`) → `validate.js` normalizes input → one or both report generators run independently, each writing a PDF to `outputDir` and returning its path. If one report fails the other still runs; each outcome is reported separately in the JSON response.

Module responsibilities (each has one purpose and a small interface):
- `server/index.js` — Express wiring, `/api/generate`, static serving, cross-platform browser open.
- `server/validate.js` — validates + normalizes the request body; forces Cloud base URL to `https://api.sonarcloud.io`; maps period strings to month counts (`PERIOD_MONTHS`).
- `server/sonar-urls.js` — **all** Cloud-vs-Server endpoint routing lives here (path differences, `organization` param for Cloud only). Change endpoints here, nowhere else.
- `server/sonar-client.js` — raw Sonar Web API calls (Bearer auth, paging accumulation for measures history, zip download).
- `server/report-regulatory.js` — Report 1: download Sonar's regulatory zip, extract `regulatory_report_summary.pdf`, append one SCA ratings page with `pdf-lib`.
- `server/report-maintenance.js` — Report 2: fetch issue-metric history, render charts, build a fresh single-page trends PDF.
- `server/sca.js` — turns SCA risk entries into A–E ratings (dependency/license/malware).
- `server/charts.js` — Chart.js rendered on a `@napi-rs/canvas` canvas → PNG buffer.
- `server/pdf-style.js` — shared Sonar color palette / page geometry constants.
- `server/dates.js` — `from`-date computation for the history window.

## Conventions that matter

**Dependency injection for testability.** Functions that hit the network or clock take `fetchImpl = fetch` and `now = new Date()` as trailing parameters. Tests pass a fake `fetch` (returning `{ ok, status, json/arrayBuffer/text }`) and a fixed `now`. Preserve these seams when adding functions — do not call global `fetch`/`Date` directly in generators or clients.

**`@napi-rs/canvas` (not `node-canvas`)** is used specifically because it ships prebuilt binaries and installs cleanly on Windows and macOS with no native compile. Note the `if (!canvas.style) canvas.style = {}` stub in `charts.js` — Chart.js v4 occasionally reads `canvas.style` and the node canvas lacks it.

## Unverified Sonar API assumptions

Two things were built against **assumed** API shapes and are flagged in the README and code comments — verify against a live token and adjust if wrong:
- **SCA severity field** (`server/sca.js`): assumed field `severity` with values INFO/LOW/MEDIUM/HIGH/BLOCKER. If the real risk-reports response differs, change only `severityOf` / `SEVERITY_RANK`.
- **Cloud regulatory report path** (`server/sonar-urls.js`): assumed `/regulatory-reports/download`. Adjust `regulatoryReportUrl` if different.

`fetchScaRiskReport` already defensively unwraps several possible response shapes (bare array, or `{ risks | dependencyRisks | items }`).

## Design docs

`docs/superpowers/specs/` and `docs/superpowers/plans/` hold the original design and implementation plan — useful for intent and the A–E rating rules, but code is the source of truth.
