const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { RATING_COLORS, SONAR, PAGE } = require('./pdf-style');
const { computeScaRatings } = require('./sca');
const { fetchRegulatoryZip, fetchScaRiskReport } = require('./sonar-client');

function extractSummaryPdf(zipBuffer) {
  const zip = new AdmZip(zipBuffer);
  const entry = zip.getEntries().find(e => e.entryName.endsWith('regulatory_report_summary.pdf'));
  if (!entry) throw new Error('regulatory_report_summary.pdf not found in downloaded zip');
  return entry.getData();
}

function drawBadge(page, font, x, y, label, letter) {
  const size = 54;
  page.drawRectangle({ x, y: y - size, width: size, height: size, color: RATING_COLORS[letter] });
  page.drawText(letter, { x: x + 16, y: y - size + 12, size: 34, font, color: rgb(1, 1, 1) });
  page.drawText(label, { x, y: y - size - 16, size: 11, font, color: SONAR.ink });
}

async function appendScaPage(basePdfBytes, ratings) {
  const doc = await PDFDocument.load(basePdfBytes);
  const page = doc.addPage([PAGE.width, PAGE.height]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE.height - PAGE.margin;
  page.drawText('Software Composition Analysis (SCA)', { x: PAGE.margin, y: y - 4, size: 18, font: bold, color: SONAR.ink });
  y -= 60;

  const gap = (PAGE.width - PAGE.margin * 2) / 3;
  drawBadge(page, bold, PAGE.margin, y, 'Dependency Risk', ratings.dependency.letter);
  drawBadge(page, bold, PAGE.margin + gap, y, 'License Risk', ratings.license.letter);
  drawBadge(page, bold, PAGE.margin + gap * 2, y, 'Malicious Package', ratings.malware.letter);

  y -= 150;
  const notes = [
    'Dependency Risk: A none/info, B >=1 low, C >=1 medium, D >=1 high, E >=1 blocker.',
    'License Risk: A 0, B 1, C 2, D 3, E >3 prohibited-license issues.',
    'Malicious Package: A 0 issues, E otherwise.',
    'Counts include only OPEN dependency risks from the latest analysis.',
  ];
  for (const n of notes) { page.drawText(n, { x: PAGE.margin, y, size: 10, font, color: SONAR.subtle }); y -= 16; }
  return doc.save();
}

async function generateRegulatoryReport({ config, outputDir, branch, fetchImpl = fetch, now = new Date() }) {
  const zip = await fetchRegulatoryZip(config, branch, fetchImpl);
  const basePdf = extractSummaryPdf(zip);
  const entries = await fetchScaRiskReport(config, fetchImpl);
  const ratings = computeScaRatings(entries);
  const bytes = await appendScaPage(basePdf, ratings);
  const file = path.join(outputDir, `regulatory_report_${config.projectKey}_${now.toISOString().slice(0, 10)}.pdf`);
  fs.writeFileSync(file, bytes);
  return file;
}

module.exports = { extractSummaryPdf, appendScaPage, generateRegulatoryReport };
