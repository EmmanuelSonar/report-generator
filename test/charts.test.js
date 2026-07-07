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
