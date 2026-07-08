const { scaRiskReportsUrl, measuresHistoryUrl, regulatoryReportUrl } = require('./sonar-urls');

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

async function getJson(url, token, fetchImpl) {
  const res = await fetchImpl(url, { headers: { ...authHeaders(token), Accept: 'application/json' } });
  if (!res.ok) {
    const detail = res.text ? await res.text().catch(() => '') : '';
    throw new Error(`Sonar API ${res.status} for ${url} ${detail}`.trim());
  }
  return res.json();
}

async function fetchScaRiskReport(config, fetchImpl = fetch) {
  const data = await getJson(scaRiskReportsUrl(config), config.token, fetchImpl);
  if (Array.isArray(data)) return data;
  return data.risks || data.dependencyRisks || data.items || [];
}

async function fetchMeasuresHistory(config, fromDate, fetchImpl = fetch) {
  const result = {};
  let page = 1;
  while (true) {
    const data = await getJson(measuresHistoryUrl(config, fromDate, page), config.token, fetchImpl);
    const measures = data.measures || [];
    for (const m of measures) {
      result[m.metric] = result[m.metric] || [];
      for (const h of m.history || []) {
        result[m.metric].push({ date: h.date, value: Number(h.value) });
      }
    }
    const paging = data.paging;
    if (!paging || !paging.pageSize || measures.length === 0 || paging.pageIndex == null || paging.pageIndex * paging.pageSize >= paging.total) {
      break;
    }
    page += 1;
  }
  return result;
}

async function fetchZipBuffer(url, headers, fetchImpl) {
  const res = await fetchImpl(url, headers ? { headers } : {});
  if (!res.ok) {
    const detail = res.text ? await res.text().catch(() => '') : '';
    throw new Error(`Regulatory report download failed: ${res.status} ${detail}`.trim());
  }
  return Buffer.from(await res.arrayBuffer());
}

async function fetchRegulatoryZip(config, branch, fetchImpl = fetch) {
  const url = regulatoryReportUrl(config, branch);

  if (config.deployment === 'server') {
    // Server streams the zip directly from the authenticated endpoint.
    return fetchZipBuffer(url, { ...authHeaders(config.token), Accept: 'application/zip' }, fetchImpl);
  }

  // Cloud returns JSON with a short-lived, presigned download link.
  const meta = await getJson(url, config.token, fetchImpl);
  const link = meta && meta.downloadLink;
  if (!link) throw new Error('Regulatory report response did not include a download link.');
  // The link is a presigned S3 URL: its signature only covers `host`, so it
  // must be fetched WITHOUT the Sonar Authorization header.
  return fetchZipBuffer(link, null, fetchImpl);
}

module.exports = { authHeaders, fetchScaRiskReport, fetchMeasuresHistory, fetchRegulatoryZip };
