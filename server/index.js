const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const express = require('express');
const { validateRequest } = require('./validate');
const { generateRegulatoryReport } = require('./report-regulatory');
const { generateMaintenanceReport } = require('./report-maintenance');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function ensureWritableDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.accessSync(dir, fs.constants.W_OK);
}

app.post('/api/generate', async (req, res) => {
  const v = validateRequest(req.body);
  if (!v.ok) return res.status(400).json({ errors: v.errors });
  const cfg = v.normalized;

  try {
    ensureWritableDir(cfg.outputDir);
  } catch (e) {
    return res.status(400).json({ errors: [`Output folder not writable: ${e.message}`] });
  }

  const config = {
    deployment: cfg.deployment, baseUrl: cfg.baseUrl, token: cfg.token,
    projectKey: cfg.projectKey, organization: cfg.organization,
  };
  const results = [];

  if (cfg.wantReg) {
    try {
      const p = await generateRegulatoryReport({ config, outputDir: cfg.outputDir, branch: cfg.branch });
      results.push({ report: 'regulatory', ok: true, path: p });
    } catch (e) {
      results.push({ report: 'regulatory', ok: false, error: e.message });
    }
  }
  if (cfg.wantMaint) {
    try {
      const p = await generateMaintenanceReport({ config, months: cfg.months, outputDir: cfg.outputDir });
      results.push({ report: 'maintenance', ok: true, path: p });
    } catch (e) {
      results.push({ report: 'maintenance', ok: false, error: e.message });
    }
  }
  res.json({ results });
});

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch (_) {}
}

if (require.main === module) {
  const port = process.env.PORT || 5173;
  app.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`Sonar Report Generator running at ${url}`);
    openBrowser(url);
  });
}

module.exports = { app };
