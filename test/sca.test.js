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
