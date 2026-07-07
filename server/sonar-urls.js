const ISSUE_METRICS =
  'software_quality_security_issues,software_quality_maintainability_issues,software_quality_reliability_issues';

function base(config) {
  return config.baseUrl.replace(/\/+$/, '');
}

function regulatoryReportUrl(config, branch) {
  const b = base(config);
  const path = config.deployment === 'server'
    ? '/api/regulatory_reports/download'
    : '/regulatory-reports/download';
  const params = new URLSearchParams({ project: config.projectKey });
  if (branch) params.set('branch', branch);
  return `${b}${path}?${params.toString()}`;
}

function scaRiskReportsUrl(config) {
  const b = base(config);
  const path = config.deployment === 'server' ? '/api/v2/sca/risk-reports' : '/sca/risk-reports';
  const params = new URLSearchParams({ component: config.projectKey });
  return `${b}${path}?${params.toString()}`;
}

function measuresHistoryUrl(config, fromDate, page) {
  const b = base(config);
  const params = new URLSearchParams({
    component: config.projectKey,
    metrics: ISSUE_METRICS,
    from: fromDate,
    p: String(page),
    ps: '500',
  });
  return `${b}/api/measures/search_history?${params.toString()}`;
}

module.exports = { ISSUE_METRICS, regulatoryReportUrl, scaRiskReportsUrl, measuresHistoryUrl };
