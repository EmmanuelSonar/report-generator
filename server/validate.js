const PERIOD_MONTHS = { 'Last 3 months': 3, 'Last 9 months': 9 };
const CLOUD_URL = 'https://api.sonarcloud.io';

function validateRequest(body = {}) {
  const errors = [];
  const reports = body.reports || {};
  const wantReg = !!reports.regulatory;
  const wantMaint = !!reports.maintenance;

  if (!body.token) errors.push('Sonar token is required.');
  if (!body.projectKey) errors.push('Project key is required.');
  if (body.deployment !== 'cloud' && body.deployment !== 'server') errors.push('Deployment must be cloud or server.');

  const baseUrl = body.deployment === 'cloud' ? CLOUD_URL : (body.baseUrl || '').trim();
  if (body.deployment === 'server' && !/^https?:\/\//.test(baseUrl)) errors.push('A valid Server URL (http/https) is required.');

  if (!wantReg && !wantMaint) errors.push('Select at least one report.');

  let months = null;
  if (wantMaint) {
    months = PERIOD_MONTHS[body.period];
    if (!months) errors.push('Choose a valid period for the maintenance report.');
  }

  if (!body.outputDir) errors.push('Output folder is required.');

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    normalized: {
      token: body.token,
      deployment: body.deployment,
      baseUrl,
      projectKey: body.projectKey,
      organization: body.organization || '',
      branch: (body.branch || '').trim(),
      wantReg, wantMaint, months,
      outputDir: body.outputDir,
    },
  };
}

module.exports = { validateRequest, PERIOD_MONTHS, CLOUD_URL };
