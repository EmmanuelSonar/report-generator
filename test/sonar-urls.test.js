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
