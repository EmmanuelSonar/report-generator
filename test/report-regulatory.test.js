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
