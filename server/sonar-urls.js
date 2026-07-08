const ISSUE_METRICS =
  'software_quality_security_issues,software_quality_maintainability_issues,software_quality_reliability_issues';

function base(config) {
  return config.baseUrl.replace(/\/+$/, '');
}

function regulatoryReportUrl(config, branch) {
  const b = base(config);
  // Cloud and Server expose different endpoints with different param names.
  // Neither accepts `organization` here. Cloud returns JSON with a download
  // link; Server streams the zip directly (see fetchRegulatoryZip).
  const [path, projectParam] = config.deployment === 'server'
    ? ['/api/regulatory_reports/download', 'project']
    : ['/enterprises/regulatory-reports', 'projectKey'];
  const params = new URLSearchParams({ [projectParam]: config.projectKey });
  if (branch) params.set('branchKey', branch);
  return `${b}${path}?${params.toString()}`;
}

function scaRiskReportsUrl(config) {
  const b = base(config);
  const path = config.deployment === 'server' ? '/api/v2/sca/risk-reports' : '/sca/risk-reports';
  const params = new URLSearchParams({ component: config.projectKey });
  if (config.deployment === 'cloud' && config.organization) params.set('organization', config.organization);
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
  if (config.deployment === 'cloud' && config.organization) params.set('organization', config.organization);
  return `${b}/api/measures/search_history?${params.toString()}`;
}

module.exports = { ISSUE_METRICS, regulatoryReportUrl, scaRiskReportsUrl, measuresHistoryUrl };
