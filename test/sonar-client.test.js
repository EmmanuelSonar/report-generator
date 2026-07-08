const { test } = require('node:test');
const assert = require('node:assert');
const { fetchMeasuresHistory, fetchScaRiskReport, fetchRegulatoryZip, authHeaders } = require('../server/sonar-client');

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
  assert.deepStrictEqual(out, [{ riskType: 'MALWARE', riskStatus: 'OPEN' }]);
});

test('fetchScaRiskReport with { risks: [...] } wrapper returns inner array', async () => {
  const arr = [{ riskType: 'VULNERABILITY', riskStatus: 'OPEN' }];
  const out = await fetchScaRiskReport(server, async () => ({ ok: true, status: 200, json: async () => ({ risks: arr }) }));
  assert.deepStrictEqual(out, arr);
});

test('fetchScaRiskReport with { dependencyRisks: [...] } wrapper returns inner array', async () => {
  const arr = [{ riskType: 'LICENSE', riskStatus: 'OPEN' }];
  const out = await fetchScaRiskReport(server, async () => ({ ok: true, status: 200, json: async () => ({ dependencyRisks: arr }) }));
  assert.deepStrictEqual(out, arr);
});

test('fetchScaRiskReport throws readable error on non-ok', async () => {
  await assert.rejects(
    () => fetchScaRiskReport(server, async () => ({ ok: false, status: 403, text: async () => 'Forbidden' })),
    /403/
  );
});

test('fetchRegulatoryZip (server) downloads the zip directly with Bearer + Accept: application/zip', async () => {
  const calls = [];
  const fakeBytes = new Uint8Array([1, 2, 3]).buffer;
  const fakeFetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 200, arrayBuffer: async () => fakeBytes };
  };
  const result = await fetchRegulatoryZip(server, 'main', fakeFetchImpl);
  assert.ok(result instanceof Buffer);
  assert.deepStrictEqual([...result], [1, 2, 3]);
  assert.strictEqual(calls.length, 1);
  assert.match(calls[0].url, /\/api\/regulatory_reports\/download\?project=p&branchKey=main$/);
  assert.strictEqual(calls[0].opts.headers.Authorization, 'Bearer TKN');
  assert.strictEqual(calls[0].opts.headers.Accept, 'application/zip');
});

test('fetchRegulatoryZip (cloud) follows downloadLink with an unauthenticated second request', async () => {
  const cloud = { deployment: 'cloud', baseUrl: 'https://api.sonarcloud.io', projectKey: 'p', token: 'TKN' };
  const calls = [];
  const fakeBytes = new Uint8Array([9, 8, 7]).buffer;
  const fakeFetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    if (url.includes('/enterprises/regulatory-reports')) {
      return { ok: true, status: 200, json: async () => ({ downloadLink: 'https://s3.example/report.zip?sig=abc' }) };
    }
    return { ok: true, status: 200, arrayBuffer: async () => fakeBytes };
  };
  const result = await fetchRegulatoryZip(cloud, 'main', fakeFetchImpl);
  assert.ok(result instanceof Buffer);
  assert.deepStrictEqual([...result], [9, 8, 7]);
  assert.strictEqual(calls.length, 2);
  // step 1: metadata call, authenticated
  assert.match(calls[0].url, /\/enterprises\/regulatory-reports\?projectKey=p&branchKey=main$/);
  assert.strictEqual(calls[0].opts.headers.Authorization, 'Bearer TKN');
  // step 2: presigned S3 download, must NOT carry the Sonar token
  assert.strictEqual(calls[1].url, 'https://s3.example/report.zip?sig=abc');
  assert.ok(!calls[1].opts || !calls[1].opts.headers || !calls[1].opts.headers.Authorization);
});

test('fetchRegulatoryZip (cloud) throws a readable error when no downloadLink is returned', async () => {
  const cloud = { deployment: 'cloud', baseUrl: 'https://api.sonarcloud.io', projectKey: 'p', token: 'TKN' };
  await assert.rejects(
    () => fetchRegulatoryZip(cloud, 'main', async () => ({ ok: true, status: 200, json: async () => ({}) })),
    /download link/i
  );
});

test('fetchMeasuresHistory terminates cleanly when paging is missing', async () => {
  let callCount = 0;
  const fakeFetchImpl = async (url, opts) => {
    callCount += 1;
    return { ok: true, status: 200, json: async () => ({ measures: [] }) };
  };
  const out = await fetchMeasuresHistory(server, '2026-01-01', fakeFetchImpl);
  assert.deepStrictEqual(out, {});
  assert.strictEqual(callCount, 1);
});
