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
const cloudWithOrg = { deployment: 'cloud', baseUrl: 'https://api.sonarcloud.io', projectKey: 'my_proj', organization: 'my_org' };
const serverWithOrg = { deployment: 'server', baseUrl: 'https://sonar.acme.com/', projectKey: 'my_proj', organization: 'my_org' };

test('sca url routes by deployment', () => {
  assert.strictEqual(scaRiskReportsUrl(cloud), 'https://api.sonarcloud.io/sca/risk-reports?component=my_proj');
  assert.strictEqual(scaRiskReportsUrl(server), 'https://sonar.acme.com/api/v2/sca/risk-reports?component=my_proj');
});

test('regulatory url routes by deployment and trims trailing slash', () => {
  assert.strictEqual(regulatoryReportUrl(server), 'https://sonar.acme.com/api/regulatory_reports/download?project=my_proj');
  assert.strictEqual(regulatoryReportUrl(cloud), 'https://api.sonarcloud.io/enterprises/regulatory-reports?projectKey=my_proj');
});

test('regulatory url appends branchKey (not branch) when a branch is given', () => {
  assert.strictEqual(regulatoryReportUrl(server, 'main'), 'https://sonar.acme.com/api/regulatory_reports/download?project=my_proj&branchKey=main');
  assert.strictEqual(regulatoryReportUrl(cloud, 'develop'), 'https://api.sonarcloud.io/enterprises/regulatory-reports?projectKey=my_proj&branchKey=develop');
});

test('measures history url is same shape for both and includes metrics, from, page', () => {
  const u = measuresHistoryUrl(server, '2026-04-07', 2);
  assert.match(u, /\/api\/measures\/search_history\?/);
  assert.match(u, /component=my_proj/);
  assert.match(u, new RegExp('metrics=' + encodeURIComponent(ISSUE_METRICS)));
  assert.match(u, /from=2026-04-07/);
  assert.match(u, /p=2/);
});

test('cloud with organization appends organization param to sca and measures builders', () => {
  assert.match(scaRiskReportsUrl(cloudWithOrg), /organization=my_org/);
  assert.match(measuresHistoryUrl(cloudWithOrg, '2026-01-01', 1), /organization=my_org/);
});

test('regulatory url never appends organization (endpoint does not accept it)', () => {
  assert.doesNotMatch(regulatoryReportUrl(cloudWithOrg), /organization=/);
  assert.doesNotMatch(regulatoryReportUrl(cloudWithOrg, 'main'), /organization=/);
});

test('server with organization does NOT append organization param to any builder', () => {
  assert.doesNotMatch(regulatoryReportUrl(serverWithOrg), /organization=/);
  assert.doesNotMatch(scaRiskReportsUrl(serverWithOrg), /organization=/);
  assert.doesNotMatch(measuresHistoryUrl(serverWithOrg, '2026-01-01', 1), /organization=/);
});

test('cloud without organization does NOT append organization param', () => {
  assert.doesNotMatch(regulatoryReportUrl(cloud), /organization=/);
  assert.doesNotMatch(scaRiskReportsUrl(cloud), /organization=/);
  assert.doesNotMatch(measuresHistoryUrl(cloud, '2026-01-01', 1), /organization=/);
});
