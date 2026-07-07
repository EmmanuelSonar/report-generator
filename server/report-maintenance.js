const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { renderLineChart } = require('./charts');
const { SONAR, PAGE, RATING_HEX } = require('./pdf-style');
const { fetchMeasuresHistory } = require('./sonar-client');
const { computeFromDate } = require('./dates');

const CHART_DEFS = [
  { metric: 'software_quality_security_issues', title: 'Security issues', color: RATING_HEX.E },
  { metric: 'software_quality_reliability_issues', title: 'Reliability issues', color: RATING_HEX.D },
  { metric: 'software_quality_maintainability_issues', title: 'Maintainability issues', color: '#4B9FD5' },
];

async function buildMaintenancePdf({ projectKey, period, history, now }) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE.width, PAGE.height]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE.height - PAGE.margin;
  page.drawText('Maintenance Report', { x: PAGE.margin, y: y - 4, size: 20, font: bold, color: SONAR.ink });
  y -= 30;
  const meta = `Project: ${projectKey}    Period: ${period}    Generated: ${now.toISOString().slice(0, 10)}`;
  page.drawText(meta, { x: PAGE.margin, y, size: 10, font, color: SONAR.subtle });
  y -= 24;

  const chartW = PAGE.width - PAGE.margin * 2;
  const chartH = 200;
  for (const def of CHART_DEFS) {
    const series = history[def.metric] || [];
    const png = renderLineChart({ title: def.title, series, color: def.color, width: 900, height: 260 });
    const img = await doc.embedPng(png);
    y -= chartH;
    page.drawImage(img, { x: PAGE.margin, y, width: chartW, height: chartH });
    y -= 12;
  }
  return doc.save();
}

async function generateMaintenanceReport({ config, months, outputDir, fetchImpl = fetch, now = new Date() }) {
  const fromDate = computeFromDate(months, now);
  const history = await fetchMeasuresHistory(config, fromDate, fetchImpl);
  const period = `Last ${months} months`;
  const bytes = await buildMaintenancePdf({ projectKey: config.projectKey, period, history, now });
  const file = path.join(outputDir, `maintenance_report_${config.projectKey}_${now.toISOString().slice(0, 10)}.pdf`);
  fs.writeFileSync(file, bytes);
  return file;
}

module.exports = { buildMaintenancePdf, generateMaintenanceReport };
