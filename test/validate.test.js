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
