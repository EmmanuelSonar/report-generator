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

async function fetchRegulatoryZip(config, branch, fetchImpl = fetch) {
  const url = regulatoryReportUrl(config, branch);
  const res = await fetchImpl(url, { headers: authHeaders(config.token) });
  if (!res.ok) {
    const detail = res.text ? await res.text().catch(() => '') : '';
    throw new Error(`Regulatory report download failed: ${res.status} ${detail}`.trim());
  }
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

module.exports = { authHeaders, fetchScaRiskReport, fetchMeasuresHistory, fetchRegulatoryZip };
