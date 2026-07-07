// Severity ranking for dependency (VULNERABILITY) risks.
// Runtime-verification note: field is assumed to be `severity` with these
// values. If a live risk-reports response uses a different field name or
// scale, update `severityOf` / SEVERITY_RANK here only.
const SEVERITY_RANK = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, BLOCKER: 4 };
const RANK_LETTER = ['A', 'B', 'C', 'D', 'E'];

function severityOf(entry) {
  const raw = String(entry.severity || 'INFO').toUpperCase();
  return raw in SEVERITY_RANK ? raw : 'INFO';
}

function bucketOpenRisks(entries) {
  const open = (Array.isArray(entries) ? entries : []).filter(e => e.riskStatus === 'OPEN');
  return {
    vulnerabilities: open.filter(e => e.riskType === 'VULNERABILITY'),
    licenses: open.filter(e => e.riskType === 'PROHIBITED_LICENSE'),
    malware: open.filter(e => e.riskType === 'MALWARE'),
  };
}

function dependencyRating(vulnEntries) {
  let worst = 0;
  for (const e of vulnEntries) worst = Math.max(worst, SEVERITY_RANK[severityOf(e)]);
  return RANK_LETTER[worst];
}

function licenseRating(count) {
  if (count <= 0) return 'A';
  if (count === 1) return 'B';
  if (count === 2) return 'C';
  if (count === 3) return 'D';
  return 'E';
}

function malwareRating(count) {
  return count > 0 ? 'E' : 'A';
}

function computeScaRatings(entries) {
  const b = bucketOpenRisks(entries);
  let worst = 0;
  for (const e of b.vulnerabilities) worst = Math.max(worst, SEVERITY_RANK[severityOf(e)]);
  return {
    dependency: { letter: RANK_LETTER[worst], worstSeverity: RANK_LETTER[worst] === 'A' ? 'NONE' : Object.keys(SEVERITY_RANK)[worst] },
    license: { letter: licenseRating(b.licenses.length), count: b.licenses.length },
    malware: { letter: malwareRating(b.malware.length), count: b.malware.length },
  };
}

module.exports = { bucketOpenRisks, dependencyRating, licenseRating, malwareRating, computeScaRatings, severityOf };
