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
