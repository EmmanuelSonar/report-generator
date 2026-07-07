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
