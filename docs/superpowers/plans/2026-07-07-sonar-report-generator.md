# Sonar Report Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local, cross-platform (Windows + macOS) Node web tool that generates two PDF reports from a SonarQube Cloud/Server project via the Sonar Web API — a regulatory report extended with an SCA risk-rating page, and a maintenance report of issue-count trends.

**Architecture:** A local Express server serves a single-page UI and exposes one `/api/generate` endpoint. The browser sends form inputs to the local backend; the backend calls Sonar (Bearer auth, so no CORS and the token never enters the browser), builds PDFs with `pdf-lib`, renders charts with Chart.js on a `@napi-rs/canvas` canvas, and writes files to a user-chosen folder. Modules are split by responsibility: API client, SCA rating logic, chart rendering, two report builders, shared PDF style, and the server.

**Tech Stack:** Node ≥ 18 (built-in `fetch`, built-in `node:test`), Express, pdf-lib, chart.js, @napi-rs/canvas, adm-zip.

## Global Constraints

- **Node ≥ 18** required (uses global `fetch` and the `node:test` runner). Set `"engines": { "node": ">=18" }`.
- **Cross-platform:** no native-compile dependencies. `@napi-rs/canvas` (prebuilt binaries) and `adm-zip` (pure JS) only — never `node-canvas`.
- **Auth:** every Sonar request sends header `Authorization: Bearer <token>`. The token is never persisted, logged, or sent to the browser.
- **Deployment routing:** `cloud` vs `server` changes only endpoint URLs (see Task 3 table). Base URL for Cloud is locked to `https://api.sonarcloud.io`.
- **Issue metrics** (verbatim): `software_quality_security_issues,software_quality_maintainability_issues,software_quality_reliability_issues`.
- **Output filenames** (verbatim patterns): `regulatory_report_<projectKey>_<YYYY-MM-DD>.pdf` and `maintenance_report_<projectKey>_<YYYY-MM-DD>.pdf`.
- **Rating letters** are always one of `A B C D E`.
- **Test runner:** `node --test`. No Jest/Mocha.
- **Modules use CommonJS** (`require`/`module.exports`) for zero build tooling.

---

## File Structure

```
partner-report/
├── package.json                 # deps, scripts, engines
├── README.md                    # how to run
├── server/
│   ├── index.js                 # Express server + /api/generate + browser open
│   ├── validate.js              # request validation (pure)
│   ├── dates.js                 # computeFromDate (pure)
│   ├── sonar-urls.js            # endpoint URL builders (pure, Cloud/Server routing)
│   ├── sonar-client.js          # network fetch functions (uses sonar-urls)
│   ├── sca.js                   # bucket risks + A–E ratings (pure)
│   ├── charts.js                # Chart.js + @napi-rs/canvas → PNG buffers
│   ├── pdf-style.js             # shared Sonar colors/layout constants (pure)
│   ├── report-regulatory.js     # Report 1 builder
│   └── report-maintenance.js    # Report 2 builder
├── public/
│   └── index.html               # single-view UI
└── test/
    ├── dates.test.js
    ├── sonar-urls.test.js
    ├── sca.test.js
    ├── sonar-client.test.js
    ├── validate.test.js
    ├── charts.test.js
    ├── report-maintenance.test.js
    └── report-regulatory.test.js
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `test/smoke.test.js`
- Create: `server/.gitkeep`, `public/.gitkeep`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test` (runs `node --test`), dependency set for all later tasks.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "sonar-report-generator",
  "version": "1.0.0",
  "description": "Generate SonarQube regulatory+SCA and maintenance PDF reports",
  "private": true,
  "engines": { "node": ">=18" },
  "scripts": {
    "start": "node server/index.js",
    "test": "node --test"
  },
  "dependencies": {
    "@napi-rs/canvas": "^0.1.60",
    "adm-zip": "^0.5.16",
    "chart.js": "^4.4.0",
    "express": "^4.19.0",
    "pdf-lib": "^1.17.1"
  }
}
```

- [ ] **Step 2: Write a smoke test** `test/smoke.test.js`

```js
const { test } = require('node:test');
const assert = require('node:assert');

test('test runner works', () => {
  assert.strictEqual(1 + 1, 2);
});
```

- [ ] **Step 3: Install deps and run the smoke test**

Run: `npm install && npm test`
Expected: install succeeds (no native compile errors), test output shows `pass 1`.

- [ ] **Step 4: Commit**

```bash
git add package.json test/smoke.test.js server public .gitignore
git commit -m "chore: scaffold project and test runner"
```

---

### Task 2: Date computation

**Files:**
- Create: `server/dates.js`
- Test: `test/dates.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `computeFromDate(months: number, now: Date) -> string` (YYYY-MM-DD, UTC).

- [ ] **Step 1: Write the failing test** `test/dates.test.js`

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { computeFromDate } = require('../server/dates');

test('computeFromDate subtracts 3 months', () => {
  assert.strictEqual(computeFromDate(3, new Date('2026-07-07T00:00:00Z')), '2026-04-07');
});

test('computeFromDate subtracts 9 months across year boundary', () => {
  assert.strictEqual(computeFromDate(9, new Date('2026-07-07T00:00:00Z')), '2025-10-07');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/dates.test.js`
Expected: FAIL — cannot find module `../server/dates`.

- [ ] **Step 3: Write minimal implementation** `server/dates.js`

```js
function computeFromDate(months, now) {
  const d = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() - months,
    now.getUTCDate()
  ));
  return d.toISOString().slice(0, 10);
}

module.exports = { computeFromDate };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/dates.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/dates.js test/dates.test.js
git commit -m "feat: add from-date computation for maintenance period"
```

---

### Task 3: Endpoint URL routing (Cloud vs Server)

**Files:**
- Create: `server/sonar-urls.js`
- Test: `test/sonar-urls.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (all take a `config` object `{ deployment, baseUrl, projectKey }`):
  - `ISSUE_METRICS` (string constant)
  - `regulatoryReportUrl(config, branch?) -> string`
  - `scaRiskReportsUrl(config) -> string`
  - `measuresHistoryUrl(config, fromDate, page) -> string`

Routing rules:

| Purpose | Cloud (`baseUrl=https://api.sonarcloud.io`) | Server (`baseUrl=<instance>`) |
|---|---|---|
| Regulatory zip | `{baseUrl}/regulatory-reports/download?project=<key>` | `{baseUrl}/api/regulatory_reports/download?project=<key>` |
| SCA risk report | `{baseUrl}/sca/risk-reports?component=<key>` | `{baseUrl}/api/v2/sca/risk-reports?component=<key>` |
| Measures history | `{baseUrl}/api/measures/search_history?...` | `{baseUrl}/api/measures/search_history?...` |

> Runtime-verification note (resolved in Task 5/8 spikes): the Cloud regulatory path and the exact query params (branch/organization) are confirmed against a live token then; keeping construction here means any correction is a one-line edit. Trailing slashes in `baseUrl` are trimmed by the builders.

- [ ] **Step 1: Write the failing test** `test/sonar-urls.test.js`

```js
const { test } = require('node:test');
const assert = require('node:assert');
const {
  ISSUE_METRICS,
  regulatoryReportUrl,
  scaRiskReportsUrl,
  measuresHistoryUrl,
} = require('../server/sonar-urls');

const cloud = { deployment: 'cloud', baseUrl: 'https://api.sonarcloud.io', projectKey: 'my_proj' };
const server = { deployment: 'server', baseUrl: 'https://sonar.acme.com/', projectKey: 'my_proj' };

test('sca url routes by deployment', () => {
  assert.strictEqual(scaRiskReportsUrl(cloud), 'https://api.sonarcloud.io/sca/risk-reports?component=my_proj');
  assert.strictEqual(scaRiskReportsUrl(server), 'https://sonar.acme.com/api/v2/sca/risk-reports?component=my_proj');
});

test('regulatory url routes by deployment and trims trailing slash', () => {
  assert.strictEqual(regulatoryReportUrl(server), 'https://sonar.acme.com/api/regulatory_reports/download?project=my_proj');
  assert.match(regulatoryReportUrl(cloud), /^https:\/\/api\.sonarcloud\.io\/.*project=my_proj/);
});

test('measures history url is same shape for both and includes metrics, from, page', () => {
  const u = measuresHistoryUrl(server, '2026-04-07', 2);
  assert.match(u, /\/api\/measures\/search_history\?/);
  assert.match(u, /component=my_proj/);
  assert.match(u, new RegExp('metrics=' + encodeURIComponent(ISSUE_METRICS)));
  assert.match(u, /from=2026-04-07/);
  assert.match(u, /p=2/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/sonar-urls.test.js`
Expected: FAIL — cannot find module `../server/sonar-urls`.

- [ ] **Step 3: Write minimal implementation** `server/sonar-urls.js`

```js
const ISSUE_METRICS =
  'software_quality_security_issues,software_quality_maintainability_issues,software_quality_reliability_issues';

function base(config) {
  return config.baseUrl.replace(/\/+$/, '');
}

function regulatoryReportUrl(config, branch) {
  const b = base(config);
  const path = config.deployment === 'server'
    ? '/api/regulatory_reports/download'
    : '/regulatory-reports/download';
  const params = new URLSearchParams({ project: config.projectKey });
  if (branch) params.set('branch', branch);
  return `${b}${path}?${params.toString()}`;
}

function scaRiskReportsUrl(config) {
  const b = base(config);
  const path = config.deployment === 'server' ? '/api/v2/sca/risk-reports' : '/sca/risk-reports';
  const params = new URLSearchParams({ component: config.projectKey });
  return `${b}${path}?${params.toString()}`;
}

function measuresHistoryUrl(config, fromDate, page) {
  const b = base(config);
  const params = new URLSearchParams({
    component: config.projectKey,
    metrics: ISSUE_METRICS,
    from: fromDate,
    p: String(page),
    ps: '500',
  });
  return `${b}/api/measures/search_history?${params.toString()}`;
}

module.exports = { ISSUE_METRICS, regulatoryReportUrl, scaRiskReportsUrl, measuresHistoryUrl };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/sonar-urls.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/sonar-urls.js test/sonar-urls.test.js
git commit -m "feat: add Sonar endpoint URL routing for cloud/server"
```

---

### Task 4: SCA bucketing and A–E ratings

**Files:**
- Create: `server/sca.js`
- Test: `test/sca.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `bucketOpenRisks(entries) -> { vulnerabilities: [], licenses: [], malware: [] }` (only `riskStatus === 'OPEN'`)
  - `dependencyRating(vulnEntries) -> 'A'|'B'|'C'|'D'|'E'`
  - `licenseRating(count) -> letter`
  - `malwareRating(count) -> letter`
  - `computeScaRatings(entries) -> { dependency: {letter, worstSeverity}, license: {letter, count}, malware: {letter, count} }`

Rules (from spec):
- Dependency: highest severity band reached — none/only info → A, ≥1 low → B, ≥1 medium → C, ≥1 high → D, ≥1 blocker → E.
- License: 0→A, 1→B, 2→C, 3→D, >3→E.
- Malware: 0→A, else E.

- [ ] **Step 1: Write the failing test** `test/sca.test.js`

```js
const { test } = require('node:test');
const assert = require('node:assert');
const {
  bucketOpenRisks, dependencyRating, licenseRating, malwareRating, computeScaRatings,
} = require('../server/sca');

test('bucketOpenRisks keeps only OPEN and splits by riskType', () => {
  const entries = [
    { riskType: 'VULNERABILITY', riskStatus: 'OPEN', severity: 'HIGH' },
    { riskType: 'VULNERABILITY', riskStatus: 'ACCEPTED', severity: 'BLOCKER' },
    { riskType: 'PROHIBITED_LICENSE', riskStatus: 'OPEN' },
    { riskType: 'MALWARE', riskStatus: 'OPEN' },
    { riskType: 'MALWARE', riskStatus: 'CONFIRMED' },
  ];
  const b = bucketOpenRisks(entries);
  assert.strictEqual(b.vulnerabilities.length, 1);
  assert.strictEqual(b.licenses.length, 1);
  assert.strictEqual(b.malware.length, 1);
});

test('dependencyRating picks the worst severity band', () => {
  assert.strictEqual(dependencyRating([]), 'A');
  assert.strictEqual(dependencyRating([{ severity: 'INFO' }]), 'A');
  assert.strictEqual(dependencyRating([{ severity: 'low' }]), 'B');
  assert.strictEqual(dependencyRating([{ severity: 'MEDIUM' }, { severity: 'LOW' }]), 'C');
  assert.strictEqual(dependencyRating([{ severity: 'HIGH' }]), 'D');
  assert.strictEqual(dependencyRating([{ severity: 'LOW' }, { severity: 'BLOCKER' }]), 'E');
});

test('licenseRating maps counts', () => {
  assert.deepStrictEqual([0,1,2,3,4].map(licenseRating), ['A','B','C','D','E']);
});

test('malwareRating is A only when zero', () => {
  assert.strictEqual(malwareRating(0), 'A');
  assert.strictEqual(malwareRating(1), 'E');
});

test('computeScaRatings aggregates', () => {
  const r = computeScaRatings([
    { riskType: 'VULNERABILITY', riskStatus: 'OPEN', severity: 'MEDIUM' },
    { riskType: 'PROHIBITED_LICENSE', riskStatus: 'OPEN' },
    { riskType: 'PROHIBITED_LICENSE', riskStatus: 'OPEN' },
    { riskType: 'MALWARE', riskStatus: 'OPEN' },
  ]);
  assert.strictEqual(r.dependency.letter, 'C');
  assert.strictEqual(r.license.letter, 'C');
  assert.strictEqual(r.malware.letter, 'E');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/sca.test.js`
Expected: FAIL — cannot find module `../server/sca`.

- [ ] **Step 3: Write minimal implementation** `server/sca.js`

```js
// Severity ranking for dependency (VULNERABILITY) risks.
// Runtime-verification note: field is assumed to be `severity` with these
// values. If a live risk-reports response uses a different field name or
// scale, update `severityOf` / SEVERITY_RANK here only.
const SEVERITY_RANK = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, BLOCKER: 4 };
const RANK_LETTER = ['A', 'B', 'C', 'D', 'E'];

function severityOf(entry) {
  const raw = String(entry.severity || 'INFO').toUpperCase();
  return raw in SEVERITY_RANK ? raw : 'INFO';
}

function bucketOpenRisks(entries) {
  const open = (Array.isArray(entries) ? entries : []).filter(e => e.riskStatus === 'OPEN');
  return {
    vulnerabilities: open.filter(e => e.riskType === 'VULNERABILITY'),
    licenses: open.filter(e => e.riskType === 'PROHIBITED_LICENSE'),
    malware: open.filter(e => e.riskType === 'MALWARE'),
  };
}

function dependencyRating(vulnEntries) {
  let worst = 0;
  for (const e of vulnEntries) worst = Math.max(worst, SEVERITY_RANK[severityOf(e)]);
  return RANK_LETTER[worst];
}

function licenseRating(count) {
  if (count <= 0) return 'A';
  if (count === 1) return 'B';
  if (count === 2) return 'C';
  if (count === 3) return 'D';
  return 'E';
}

function malwareRating(count) {
  return count > 0 ? 'E' : 'A';
}

function computeScaRatings(entries) {
  const b = bucketOpenRisks(entries);
  let worst = 0;
  for (const e of b.vulnerabilities) worst = Math.max(worst, SEVERITY_RANK[severityOf(e)]);
  return {
    dependency: { letter: RANK_LETTER[worst], worstSeverity: RANK_LETTER[worst] === 'A' ? 'NONE' : Object.keys(SEVERITY_RANK)[worst] },
    license: { letter: licenseRating(b.licenses.length), count: b.licenses.length },
    malware: { letter: malwareRating(b.malware.length), count: b.malware.length },
  };
}

module.exports = { bucketOpenRisks, dependencyRating, licenseRating, malwareRating, computeScaRatings, severityOf };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/sca.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/sca.js test/sca.test.js
git commit -m "feat: add SCA risk bucketing and A-E rating logic"
```

---

### Task 5: Sonar API client (network)

**Files:**
- Create: `server/sonar-client.js`
- Test: `test/sonar-client.test.js`

**Interfaces:**
- Consumes: `server/sonar-urls.js` (all builders), `server/dates.js`.
- Produces (each takes `config` and an injectable `fetchImpl = fetch`):
  - `fetchScaRiskReport(config, fetchImpl?) -> Promise<Array>` — parses the array (accepts either a bare array or `{ risks: [...] }` / `{ dependencyRisks: [...] }`).
  - `fetchMeasuresHistory(config, fromDate, fetchImpl?) -> Promise<{ [metric]: Array<{date, value:number}> }>` — follows paging via `paging.total`.
  - `fetchRegulatoryZip(config, branch?, fetchImpl?) -> Promise<Buffer>` — returns raw zip bytes.
  - `authHeaders(token) -> { Authorization }`

- [ ] **Step 1: Write the failing test** `test/sonar-client.test.js`

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { fetchMeasuresHistory, fetchScaRiskReport, authHeaders } = require('../server/sonar-client');

const server = { deployment: 'server', baseUrl: 'https://s.acme.com', projectKey: 'p', token: 'TKN' };

function fakeFetch(pages) {
  let i = 0;
  return async (url, opts) => {
    assert.strictEqual(opts.headers.Authorization, 'Bearer TKN');
    const body = pages[i++];
    return { ok: true, status: 200, json: async () => body };
  };
}

test('authHeaders builds Bearer header', () => {
  assert.deepStrictEqual(authHeaders('X'), { Authorization: 'Bearer X' });
});

test('fetchMeasuresHistory merges paged history per metric', async () => {
  const page1 = {
    paging: { pageIndex: 1, pageSize: 1, total: 2 },
    measures: [{ metric: 'software_quality_security_issues', history: [{ date: '2026-01-01', value: '5' }] }],
  };
  const page2 = {
    paging: { pageIndex: 2, pageSize: 1, total: 2 },
    measures: [{ metric: 'software_quality_security_issues', history: [{ date: '2026-01-02', value: '7' }] }],
  };
  const out = await fetchMeasuresHistory(server, '2026-01-01', fakeFetch([page1, page2]));
  assert.deepStrictEqual(out.software_quality_security_issues, [
    { date: '2026-01-01', value: 5 },
    { date: '2026-01-02', value: 7 },
  ]);
});

test('fetchScaRiskReport accepts bare array', async () => {
  const arr = [{ riskType: 'MALWARE', riskStatus: 'OPEN' }];
  const out = await fetchScaRiskReport(server, async () => ({ ok: true, status: 200, json: async () => arr }));
  assert.strictEqual(out.length, 1);
});

test('fetchScaRiskReport throws readable error on non-ok', async () => {
  await assert.rejects(
    () => fetchScaRiskReport(server, async () => ({ ok: false, status: 403, text: async () => 'Forbidden' })),
    /403/
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/sonar-client.test.js`
Expected: FAIL — cannot find module `../server/sonar-client`.

- [ ] **Step 3: Write minimal implementation** `server/sonar-client.js`

```js
const { scaRiskReportsUrl, measuresHistoryUrl, regulatoryReportUrl } = require('./sonar-urls');

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function getJson(url, token, fetchImpl) {
  const res = await fetchImpl(url, { headers: { ...authHeaders(token), Accept: 'application/json' } });
  if (!res.ok) {
    const detail = res.text ? await res.text().catch(() => '') : '';
    throw new Error(`Sonar API ${res.status} for ${url} ${detail}`.trim());
  }
  return res.json();
}

async function fetchScaRiskReport(config, fetchImpl = fetch) {
  const data = await getJson(scaRiskReportsUrl(config), config.token, fetchImpl);
  if (Array.isArray(data)) return data;
  return data.risks || data.dependencyRisks || data.items || [];
}

async function fetchMeasuresHistory(config, fromDate, fetchImpl = fetch) {
  const result = {};
  let page = 1;
  let total = Infinity;
  let seen = 0;
  while (seen < total) {
    const data = await getJson(measuresHistoryUrl(config, fromDate, page), config.token, fetchImpl);
    const pageSize = data.paging ? data.paging.pageSize : 0;
    total = data.paging ? data.paging.total : 0;
    for (const m of data.measures || []) {
      result[m.metric] = result[m.metric] || [];
      for (const h of m.history || []) {
        result[m.metric].push({ date: h.date, value: Number(h.value) });
      }
    }
    // search_history paging counts measures*history rows; advance by page until covered.
    seen += pageSize || (data.measures ? data.measures.length : 0);
    if (!pageSize || (data.measures || []).length === 0) break;
    page += 1;
  }
  return result;
}

async function fetchRegulatoryZip(config, branch, fetchImpl = fetch) {
  const url = regulatoryReportUrl(config, branch);
  const res = await fetchImpl(url, { headers: authHeaders(config.token) });
  if (!res.ok) {
    const detail = res.text ? await res.text().catch(() => '') : '';
    throw new Error(`Regulatory report download failed: ${res.status} ${detail}`.trim());
  }
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

module.exports = { authHeaders, fetchScaRiskReport, fetchMeasuresHistory, fetchRegulatoryZip };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/sonar-client.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Live spike (manual, documented)** — When a real token is available, run a one-off script to `console.log` the first SCA entry and the regulatory URL response status. Confirm: (a) SCA entries expose a `severity` field with INFO/LOW/MEDIUM/HIGH/BLOCKER (adjust `server/sca.js` `severityOf` if not); (b) the Cloud regulatory path in `server/sonar-urls.js` returns `200` + a zip (adjust the path/params if not). Record findings in `README.md` under "API notes".

- [ ] **Step 6: Commit**

```bash
git add server/sonar-client.js test/sonar-client.test.js
git commit -m "feat: add Sonar API client with paging and bearer auth"
```

---

### Task 6: Chart rendering

**Files:**
- Create: `server/charts.js`
- Test: `test/charts.test.js`

**Interfaces:**
- Consumes: `chart.js`, `@napi-rs/canvas`.
- Produces: `renderLineChart({ title, series, color, width?, height? }) -> Buffer` (PNG bytes). `series` is `Array<{date, value}>`.

- [ ] **Step 1: Write the failing test** `test/charts.test.js`

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { renderLineChart } = require('../server/charts');

test('renderLineChart returns a non-empty PNG buffer', () => {
  const buf = renderLineChart({
    title: 'Security issues',
    color: '#d02f3a',
    series: [ { date: '2026-01-01', value: 5 }, { date: '2026-02-01', value: 8 }, { date: '2026-03-01', value: 3 } ],
  });
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf.length > 1000);
  // PNG signature
  assert.deepStrictEqual([...buf.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/charts.test.js`
Expected: FAIL — cannot find module `../server/charts`.

- [ ] **Step 3: Write minimal implementation** `server/charts.js`

```js
const { createCanvas } = require('@napi-rs/canvas');
const { Chart, registerables } = require('chart.js');

Chart.register(...registerables);

function renderLineChart({ title, series, color, width = 900, height = 260 }) {
  const canvas = createCanvas(width, height);
  // Chart.js v4 occasionally reads canvas.style; stub it for the node canvas.
  if (!canvas.style) canvas.style = {};
  const ctx = canvas.getContext('2d');

  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: series.map(p => p.date.slice(0, 10)),
      datasets: [{
        label: title,
        data: series.map(p => p.value),
        borderColor: color,
        backgroundColor: color,
        pointRadius: 0,
        borderWidth: 2,
        tension: 0.25,
        fill: false,
      }],
    },
    options: {
      responsive: false,
      animation: false,
      devicePixelRatio: 1,
      plugins: {
        legend: { display: false },
        title: { display: true, text: title, font: { size: 16 }, color: '#262931' },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8, color: '#666' }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0, color: '#666' }, grid: { color: '#eee' } },
      },
    },
  });

  const buf = canvas.toBuffer('image/png');
  chart.destroy();
  return buf;
}

module.exports = { renderLineChart };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/charts.test.js`
Expected: PASS. If it errors on a missing DOM/`style` property, the stub in Step 3 covers the common case; if a different property is required, add the minimal stub reported by the error message and re-run.

- [ ] **Step 5: Commit**

```bash
git add server/charts.js test/charts.test.js
git commit -m "feat: render line charts to PNG via chart.js + napi canvas"
```

---

### Task 7: Shared PDF style constants

**Files:**
- Create: `server/pdf-style.js`
- Test: (covered by report smoke tests; no dedicated test)

**Interfaces:**
- Consumes: `pdf-lib` (for `rgb`).
- Produces:
  - `RATING_COLORS` — `{ A, B, C, D, E }` each a pdf-lib `rgb(...)`.
  - `RATING_HEX` — `{ A, B, C, D, E }` hex strings (for charts if needed).
  - `SONAR` — `{ blue, ink, subtle }` pdf-lib colors.
  - `PAGE` — `{ width: 595.28, height: 841.89, margin: 48 }` (A4 in points).

- [ ] **Step 1: Write implementation** `server/pdf-style.js`

```js
const { rgb } = require('pdf-lib');

const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

// Sonar rating palette (A green → E red).
const RATING_HEX = { A: '#00AA63', B: '#B0D513', C: '#EABE06', D: '#ED7D20', E: '#D02F3A' };
const RATING_COLORS = Object.fromEntries(Object.entries(RATING_HEX).map(([k, v]) => [k, hex(v)]));

const SONAR = { blue: hex('#4B9FD5'), ink: hex('#262931'), subtle: hex('#666666') };
const PAGE = { width: 595.28, height: 841.89, margin: 48 };

module.exports = { RATING_COLORS, RATING_HEX, SONAR, PAGE, hex };
```

- [ ] **Step 2: Sanity-check it loads**

Run: `node -e "console.log(Object.keys(require('./server/pdf-style').RATING_COLORS))"`
Expected: `[ 'A', 'B', 'C', 'D', 'E' ]`

- [ ] **Step 3: Commit**

```bash
git add server/pdf-style.js
git commit -m "feat: add shared Sonar PDF style constants"
```

---

### Task 8: Maintenance report builder (Report 2)

**Files:**
- Create: `server/report-maintenance.js`
- Test: `test/report-maintenance.test.js`

**Interfaces:**
- Consumes: `pdf-lib`, `server/charts.js` (`renderLineChart`), `server/pdf-style.js`, `server/sonar-client.js` (`fetchMeasuresHistory`), `server/dates.js`.
- Produces: `buildMaintenancePdf({ projectKey, period, history, now }) -> Promise<Uint8Array>` and `generateMaintenanceReport({ config, months, outputDir, fetchImpl?, now? }) -> Promise<string>` (returns written file path).

- [ ] **Step 1: Write the failing test** `test/report-maintenance.test.js`

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { PDFDocument } = require('pdf-lib');
const { buildMaintenancePdf } = require('../server/report-maintenance');

test('buildMaintenancePdf produces a single-page PDF', async () => {
  const history = {
    software_quality_security_issues: [ { date: '2026-01-01', value: 5 }, { date: '2026-03-01', value: 2 } ],
    software_quality_reliability_issues: [ { date: '2026-01-01', value: 9 }, { date: '2026-03-01', value: 4 } ],
    software_quality_maintainability_issues: [ { date: '2026-01-01', value: 20 }, { date: '2026-03-01', value: 15 } ],
  };
  const bytes = await buildMaintenancePdf({
    projectKey: 'my_proj', period: 'Last 3 months', history, now: new Date('2026-07-07T00:00:00Z'),
  });
  const doc = await PDFDocument.load(bytes);
  assert.strictEqual(doc.getPageCount(), 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/report-maintenance.test.js`
Expected: FAIL — cannot find module `../server/report-maintenance`.

- [ ] **Step 3: Write minimal implementation** `server/report-maintenance.js`

```js
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { renderLineChart } = require('./charts');
const { SONAR, PAGE, RATING_HEX } = require('./pdf-style');
const { fetchMeasuresHistory } = require('./sonar-client');
const { computeFromDate } = require('./dates');

const CHART_DEFS = [
  { metric: 'software_quality_security_issues', title: 'Security issues', color: RATING_HEX.E },
  { metric: 'software_quality_reliability_issues', title: 'Reliability issues', color: RATING_HEX.D },
  { metric: 'software_quality_maintainability_issues', title: 'Maintainability issues', color: '#4B9FD5' },
];

async function buildMaintenancePdf({ projectKey, period, history, now }) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE.width, PAGE.height]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE.height - PAGE.margin;
  page.drawText('Maintenance Report', { x: PAGE.margin, y: y - 4, size: 20, font: bold, color: SONAR.ink });
  y -= 30;
  const meta = `Project: ${projectKey}    Period: ${period}    Generated: ${now.toISOString().slice(0, 10)}`;
  page.drawText(meta, { x: PAGE.margin, y, size: 10, font, color: SONAR.subtle });
  y -= 24;

  const chartW = PAGE.width - PAGE.margin * 2;
  const chartH = 200;
  for (const def of CHART_DEFS) {
    const series = history[def.metric] || [];
    const png = renderLineChart({ title: def.title, series, color: def.color, width: 900, height: 260 });
    const img = await doc.embedPng(png);
    const drawH = chartH;
    const drawW = chartW;
    y -= drawH;
    page.drawImage(img, { x: PAGE.margin, y, width: drawW, height: drawH });
    y -= 12;
  }
  return doc.save();
}

async function generateMaintenanceReport({ config, months, outputDir, fetchImpl = fetch, now = new Date() }) {
  const fromDate = computeFromDate(months, now);
  const history = await fetchMeasuresHistory(config, fromDate, fetchImpl);
  const period = `Last ${months} months`;
  const bytes = await buildMaintenancePdf({ projectKey: config.projectKey, period, history, now });
  const file = path.join(outputDir, `maintenance_report_${config.projectKey}_${now.toISOString().slice(0, 10)}.pdf`);
  fs.writeFileSync(file, bytes);
  return file;
}

module.exports = { buildMaintenancePdf, generateMaintenanceReport };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/report-maintenance.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add server/report-maintenance.js test/report-maintenance.test.js
git commit -m "feat: build maintenance trend report PDF"
```

---

### Task 9: Regulatory + SCA report builder (Report 1)

**Files:**
- Create: `server/report-regulatory.js`
- Test: `test/report-regulatory.test.js`

**Interfaces:**
- Consumes: `pdf-lib`, `adm-zip`, `server/pdf-style.js`, `server/sca.js` (`computeScaRatings`), `server/sonar-client.js` (`fetchRegulatoryZip`, `fetchScaRiskReport`).
- Produces:
  - `extractSummaryPdf(zipBuffer) -> Buffer` (finds `regulatory_report_summary.pdf` in the zip).
  - `appendScaPage(basePdfBytes, ratings) -> Promise<Uint8Array>` (original pages + 1).
  - `generateRegulatoryReport({ config, outputDir, branch?, fetchImpl?, now? }) -> Promise<string>`.

- [ ] **Step 1: Write the failing test** `test/report-regulatory.test.js`

```js
const { test } = require('node:test');
const assert = require('node:assert');
const AdmZip = require('adm-zip');
const { PDFDocument } = require('pdf-lib');
const { extractSummaryPdf, appendScaPage } = require('../server/report-regulatory');

async function makeBasePdf(pages) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
}

test('extractSummaryPdf pulls the summary pdf from the zip', async () => {
  const base = await makeBasePdf(2);
  const zip = new AdmZip();
  zip.addFile('regulatory_report_summary.pdf', base);
  zip.addFile('extra.csv', Buffer.from('a,b'));
  const out = extractSummaryPdf(zip.toBuffer());
  assert.deepStrictEqual([...out.subarray(0, 4)], [0x25, 0x50, 0x44, 0x46]); // %PDF
});

test('appendScaPage adds exactly one page', async () => {
  const base = await makeBasePdf(3);
  const ratings = { dependency: { letter: 'C' }, license: { letter: 'B', count: 1 }, malware: { letter: 'A', count: 0 } };
  const bytes = await appendScaPage(base, ratings);
  const doc = await PDFDocument.load(bytes);
  assert.strictEqual(doc.getPageCount(), 4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/report-regulatory.test.js`
Expected: FAIL — cannot find module `../server/report-regulatory`.

- [ ] **Step 3: Write minimal implementation** `server/report-regulatory.js`

```js
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { RATING_COLORS, SONAR, PAGE } = require('./pdf-style');
const { computeScaRatings } = require('./sca');
const { fetchRegulatoryZip, fetchScaRiskReport } = require('./sonar-client');

function extractSummaryPdf(zipBuffer) {
  const zip = new AdmZip(zipBuffer);
  const entry = zip.getEntries().find(e => e.entryName.endsWith('regulatory_report_summary.pdf'));
  if (!entry) throw new Error('regulatory_report_summary.pdf not found in downloaded zip');
  return entry.getData();
}

function drawBadge(page, font, x, y, label, letter) {
  const size = 54;
  page.drawRectangle({ x, y: y - size, width: size, height: size, color: RATING_COLORS[letter] });
  page.drawText(letter, { x: x + 16, y: y - size + 12, size: 34, font, color: require('pdf-lib').rgb(1, 1, 1) });
  page.drawText(label, { x, y: y - size - 16, size: 11, font, color: SONAR.ink });
}

async function appendScaPage(basePdfBytes, ratings) {
  const doc = await PDFDocument.load(basePdfBytes);
  const page = doc.addPage([PAGE.width, PAGE.height]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE.height - PAGE.margin;
  page.drawText('Software Composition Analysis (SCA)', { x: PAGE.margin, y: y - 4, size: 18, font: bold, color: SONAR.ink });
  y -= 60;

  const gap = (PAGE.width - PAGE.margin * 2) / 3;
  drawBadge(page, bold, PAGE.margin, y, 'Dependency Risk', ratings.dependency.letter);
  drawBadge(page, bold, PAGE.margin + gap, y, 'License Risk', ratings.license.letter);
  drawBadge(page, bold, PAGE.margin + gap * 2, y, 'Malicious Package', ratings.malware.letter);

  y -= 150;
  const notes = [
    'Dependency Risk: A none/info, B >=1 low, C >=1 medium, D >=1 high, E >=1 blocker.',
    'License Risk: A 0, B 1, C 2, D 3, E >3 prohibited-license issues.',
    'Malicious Package: A 0 issues, E otherwise.',
    'Counts include only OPEN dependency risks from the latest analysis.',
  ];
  for (const n of notes) { page.drawText(n, { x: PAGE.margin, y, size: 10, font, color: SONAR.subtle }); y -= 16; }
  return doc.save();
}

async function generateRegulatoryReport({ config, outputDir, branch, fetchImpl = fetch, now = new Date() }) {
  const zip = await fetchRegulatoryZip(config, branch, fetchImpl);
  const basePdf = extractSummaryPdf(zip);
  const entries = await fetchScaRiskReport(config, fetchImpl);
  const ratings = computeScaRatings(entries);
  const bytes = await appendScaPage(basePdf, ratings);
  const file = path.join(outputDir, `regulatory_report_${config.projectKey}_${now.toISOString().slice(0, 10)}.pdf`);
  fs.writeFileSync(file, bytes);
  return file;
}

module.exports = { extractSummaryPdf, appendScaPage, generateRegulatoryReport };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/report-regulatory.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/report-regulatory.js test/report-regulatory.test.js
git commit -m "feat: build regulatory report with appended SCA rating page"
```

---

### Task 10: Request validation

**Files:**
- Create: `server/validate.js`
- Test: `test/validate.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `validateRequest(body) -> { ok: boolean, errors: string[], normalized? }`. Normalizes Cloud baseUrl to `https://api.sonarcloud.io`, maps period label → months.

- [ ] **Step 1: Write the failing test** `test/validate.test.js`

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { validateRequest } = require('../server/validate');

const good = {
  token: 'T', deployment: 'cloud', baseUrl: 'https://api.sonarcloud.io',
  projectKey: 'p', organization: 'org',
  reports: { regulatory: true, maintenance: true }, period: 'Last 9 months',
  outputDir: '/tmp/out',
};

test('valid request passes and maps period to months', () => {
  const r = validateRequest(good);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.normalized.months, 9);
});

test('cloud baseUrl is forced regardless of input', () => {
  const r = validateRequest({ ...good, baseUrl: 'https://evil.example' });
  assert.strictEqual(r.normalized.baseUrl, 'https://api.sonarcloud.io');
});

test('missing token fails', () => {
  const r = validateRequest({ ...good, token: '' });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some(e => /token/i.test(e)));
});

test('no report selected fails', () => {
  const r = validateRequest({ ...good, reports: { regulatory: false, maintenance: false } });
  assert.strictEqual(r.ok, false);
});

test('maintenance without valid period fails', () => {
  const r = validateRequest({ ...good, period: 'nonsense' });
  assert.strictEqual(r.ok, false);
});

test('server requires a baseUrl', () => {
  const r = validateRequest({ ...good, deployment: 'server', baseUrl: '' });
  assert.strictEqual(r.ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/validate.test.js`
Expected: FAIL — cannot find module `../server/validate`.

- [ ] **Step 3: Write minimal implementation** `server/validate.js`

```js
const PERIOD_MONTHS = { 'Last 3 months': 3, 'Last 9 months': 9 };
const CLOUD_URL = 'https://api.sonarcloud.io';

function validateRequest(body = {}) {
  const errors = [];
  const reports = body.reports || {};
  const wantReg = !!reports.regulatory;
  const wantMaint = !!reports.maintenance;

  if (!body.token) errors.push('Sonar token is required.');
  if (!body.projectKey) errors.push('Project key is required.');
  if (body.deployment !== 'cloud' && body.deployment !== 'server') errors.push('Deployment must be cloud or server.');

  const baseUrl = body.deployment === 'cloud' ? CLOUD_URL : (body.baseUrl || '').trim();
  if (body.deployment === 'server' && !/^https?:\/\//.test(baseUrl)) errors.push('A valid Server URL (http/https) is required.');

  if (!wantReg && !wantMaint) errors.push('Select at least one report.');

  let months = null;
  if (wantMaint) {
    months = PERIOD_MONTHS[body.period];
    if (!months) errors.push('Choose a valid period for the maintenance report.');
  }

  if (!body.outputDir) errors.push('Output folder is required.');

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    normalized: {
      token: body.token,
      deployment: body.deployment,
      baseUrl,
      projectKey: body.projectKey,
      organization: body.organization || '',
      wantReg, wantMaint, months,
      outputDir: body.outputDir,
    },
  };
}

module.exports = { validateRequest, PERIOD_MONTHS, CLOUD_URL };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/validate.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/validate.js test/validate.test.js
git commit -m "feat: add request validation and normalization"
```

---

### Task 11: Express server + browser open

**Files:**
- Create: `server/index.js`

**Interfaces:**
- Consumes: `express`, `server/validate.js`, `server/report-regulatory.js`, `server/report-maintenance.js`.
- Produces: HTTP server on `PORT` (default 5173). `GET /` serves the UI; `POST /api/generate` runs selected reports, each caught independently, returns `{ results: [{ report, ok, path?, error? }] }`.

- [ ] **Step 1: Write implementation** `server/index.js`

```js
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const express = require('express');
const { validateRequest } = require('./validate');
const { generateRegulatoryReport } = require('./report-regulatory');
const { generateMaintenanceReport } = require('./report-maintenance');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function ensureWritableDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.accessSync(dir, fs.constants.W_OK);
}

app.post('/api/generate', async (req, res) => {
  const v = validateRequest(req.body);
  if (!v.ok) return res.status(400).json({ errors: v.errors });
  const cfg = v.normalized;

  try {
    ensureWritableDir(cfg.outputDir);
  } catch (e) {
    return res.status(400).json({ errors: [`Output folder not writable: ${e.message}`] });
  }

  const config = {
    deployment: cfg.deployment, baseUrl: cfg.baseUrl, token: cfg.token,
    projectKey: cfg.projectKey, organization: cfg.organization,
  };
  const results = [];

  if (cfg.wantReg) {
    try {
      const p = await generateRegulatoryReport({ config, outputDir: cfg.outputDir });
      results.push({ report: 'regulatory', ok: true, path: p });
    } catch (e) {
      results.push({ report: 'regulatory', ok: false, error: e.message });
    }
  }
  if (cfg.wantMaint) {
    try {
      const p = await generateMaintenanceReport({ config, months: cfg.months, outputDir: cfg.outputDir });
      results.push({ report: 'maintenance', ok: true, path: p });
    } catch (e) {
      results.push({ report: 'maintenance', ok: false, error: e.message });
    }
  }
  res.json({ results });
});

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref(); } catch (_) {}
}

if (require.main === module) {
  const port = process.env.PORT || 5173;
  app.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`Sonar Report Generator running at ${url}`);
    openBrowser(url);
  });
}

module.exports = { app };
```

- [ ] **Step 2: Verify the server boots and serves**

Run: `PORT=5178 node -e "const {app}=require('./server/index');const s=app.listen(5178,()=>{require('http').get('http://localhost:5178/api/generate',r=>{console.log('GET status',r.statusCode);s.close();});});"`
Expected: prints a status code (404 for GET on a POST route is fine) and exits — confirms the module loads and listens.

- [ ] **Step 3: Verify validation rejection path**

Run:
```bash
PORT=5179 node server/index.js &
sleep 1
curl -s -X POST http://localhost:5179/api/generate -H 'Content-Type: application/json' -d '{}'
kill %1
```
Expected: JSON with an `errors` array listing missing token/project/etc.

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat: add express server, generate endpoint, browser open"
```

---

### Task 12: Single-view UI

**Files:**
- Create: `public/index.html`

**Interfaces:**
- Consumes: `POST /api/generate`.
- Produces: the browser UI. Styled using the `design-taste-frontend` skill.

- [ ] **Step 1: Install the design skill**

Run: `npx skills add https://github.com/Leonxlnx/taste-skill "design-taste-frontend"`
Expected: skill installed. Then invoke the `design-taste-frontend` skill and apply its styling guidance to the markup below (colors, spacing, typography). The structure/logic below is the contract; the skill governs the look.

- [ ] **Step 2: Write `public/index.html`** (functional baseline; restyle per skill)

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Sonar Report Generator</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 560px; margin: 40px auto; padding: 0 16px; color: #262931; }
  label { display:block; margin: 14px 0 4px; font-weight: 600; }
  input, select { width: 100%; padding: 8px; box-sizing: border-box; }
  .row { display:flex; gap:16px; align-items:center; }
  .row label { margin: 0; font-weight: 400; }
  fieldset { border:1px solid #ddd; margin-top:16px; }
  button { margin-top:20px; padding:10px 18px; background:#4B9FD5; color:#fff; border:0; border-radius:4px; cursor:pointer; font-size:15px; }
  #results { margin-top:20px; }
  .ok { color:#00AA63; } .err { color:#D02F3A; }
  .hidden { display:none; }
</style>
</head>
<body>
  <h1>Sonar Report Generator</h1>
  <form id="f">
    <label>Sonar token</label>
    <input type="password" name="token" autocomplete="off" required/>

    <label>Deployment</label>
    <select name="deployment" id="deployment">
      <option value="cloud">SonarQube Cloud</option>
      <option value="server">SonarQube Server</option>
    </select>

    <label>Base URL</label>
    <input type="text" name="baseUrl" id="baseUrl" value="https://api.sonarcloud.io" readonly/>

    <label>Project key</label>
    <input type="text" name="projectKey" required/>

    <label>Organization key</label>
    <input type="text" name="organization"/>

    <fieldset>
      <legend>Reports</legend>
      <div class="row"><input type="checkbox" id="regulatory" checked/><label for="regulatory">Regulatory + SCA report</label></div>
      <div class="row"><input type="checkbox" id="maintenance" checked/><label for="maintenance">Maintenance report</label></div>
    </fieldset>

    <div id="periodWrap">
      <label>Maintenance period</label>
      <select name="period" id="period">
        <option>Last 3 months</option>
        <option>Last 9 months</option>
      </select>
    </div>

    <label>Output folder</label>
    <input type="text" name="outputDir" id="outputDir"/>

    <button type="submit" id="go">Generate</button>
  </form>
  <div id="results"></div>

<script>
  const $ = (id) => document.getElementById(id);
  const deployment = $('deployment'), baseUrl = $('baseUrl');
  const maintenance = $('maintenance'), periodWrap = $('periodWrap');

  // default output dir hint
  $('outputDir').value = (navigator.platform.startsWith('Win') ? 'C:\\\\Users\\\\you\\\\Downloads' : '~/Downloads');

  function syncDeployment() {
    if (deployment.value === 'cloud') { baseUrl.value = 'https://api.sonarcloud.io'; baseUrl.readOnly = true; }
    else { if (baseUrl.readOnly) baseUrl.value = ''; baseUrl.readOnly = false; }
  }
  function syncPeriod() { periodWrap.classList.toggle('hidden', !maintenance.checked); }
  deployment.addEventListener('change', syncDeployment);
  maintenance.addEventListener('change', syncPeriod);
  syncDeployment(); syncPeriod();

  $('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('go').disabled = true;
    $('results').innerHTML = 'Generating…';
    const fd = new FormData(e.target);
    const payload = {
      token: fd.get('token'), deployment: deployment.value, baseUrl: baseUrl.value,
      projectKey: fd.get('projectKey'), organization: fd.get('organization'),
      reports: { regulatory: $('regulatory').checked, maintenance: maintenance.checked },
      period: $('period').value, outputDir: fd.get('outputDir'),
    };
    try {
      const res = await fetch('/api/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.errors) { $('results').innerHTML = data.errors.map(x=>`<div class="err">• ${x}</div>`).join(''); }
      else { $('results').innerHTML = data.results.map(r => r.ok
        ? `<div class="ok">✓ ${r.report}: ${r.path}</div>`
        : `<div class="err">✗ ${r.report}: ${r.error}</div>`).join(''); }
    } catch (err) { $('results').innerHTML = `<div class="err">Request failed: ${err.message}</div>`; }
    finally { $('go').disabled = false; }
  });
</script>
</body>
</html>
```

- [ ] **Step 3: Manual verification**

Run: `npm start`, then in the opened browser: switch Deployment to Server (URL unlocks + clears), back to Cloud (URL relocks to `https://api.sonarcloud.io`); untick Maintenance (period hides). Submit with empty token → see validation errors from the backend.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat: add single-view UI for report generation"
```

---

### Task 13: README and end-to-end smoke

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything.
- Produces: run instructions + the "API notes" section from the Task 5 spike.

- [ ] **Step 1: Write `README.md`**

````markdown
# Sonar Report Generator

Local tool to generate two PDF reports from a SonarQube Cloud/Server project:
1. Regulatory report (Sonar's own PDF) + an appended SCA risk-rating page (A–E).
2. Maintenance report — security/reliability/maintainability issue trends.

## Requirements
- Node.js ≥ 18

## Run
```bash
npm install
npm start
```
Your browser opens to http://localhost:5173. Fill the form and click Generate.
- **macOS:** double-click `start.command` (optional wrapper) or run `npm start`.
- **Windows:** run `npm start` in a terminal.

## API notes
- SCA severity field: <record what the live risk-reports response uses>.
- Cloud regulatory report path confirmed as: <record the verified path>.

## Tests
```bash
npm test
```
````

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests pass across every `test/*.test.js` file.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README and run instructions"
```

---

## Self-Review Notes (author)

- **Spec coverage:** run model (Task 11), UI fields incl. conditional URL lock and period visibility (Task 12), Cloud/Server routing (Task 3), Report 1 regulatory+SCA with A–E rules (Tasks 4, 9), Report 2 line charts (Tasks 6, 8), output folder create/validate (Tasks 10, 11), error handling per-report (Task 11), tests throughout. All covered.
- **Verification items** (SCA severity field name; Cloud regulatory path/params) are isolated to `sca.js` and `sonar-urls.js` with an explicit live-spike step (Task 5, Step 5) and one-line fix guidance — not placeholders.
- **Type consistency:** `config` shape `{ deployment, baseUrl, token, projectKey, organization }` is uniform across `sonar-urls`, `sonar-client`, and both report builders; `computeScaRatings` output shape matches what `appendScaPage` consumes; `renderLineChart` signature matches its use in `report-maintenance`.
- **Style caveat:** exact Sonar fonts in the appended page use Helvetica (pdf-lib standard font) since the source PDF's embedded fonts aren't reused; colors match the Sonar rating palette. Acceptable per the "replicate style" goal; refine hex values against a real report during Task 9 if needed.
