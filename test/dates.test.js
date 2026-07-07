const { test } = require('node:test');
const assert = require('node:assert');
const { computeFromDate } = require('../server/dates');

test('computeFromDate subtracts 3 months', () => {
  assert.strictEqual(computeFromDate(3, new Date('2026-07-07T00:00:00Z')), '2026-04-07');
});

test('computeFromDate subtracts 9 months across year boundary', () => {
  assert.strictEqual(computeFromDate(9, new Date('2026-07-07T00:00:00Z')), '2025-10-07');
});
