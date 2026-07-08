# Sonar Report Generator

Local tool to generate two PDF reports from a SonarQube Cloud/Server project:
1. Regulatory report (Sonar's own PDF) + an appended SCA risk-rating page (A–E).
2. Maintenance report — security/reliability/maintainability issue trends.

## Requirements
- Node.js ≥ 18

## Run
```bash
npm install
npm start
```
Your browser opens to http://localhost:5173. Fill the form and click Generate.
- **macOS:** run `npm start`.
- **Windows:** run `npm start` in a terminal.

## API notes (UNVERIFIED ASSUMPTIONS -- pending live token verification)
- SCA severity field is ASSUMED to be `severity` with values INFO/LOW/MEDIUM/HIGH/BLOCKER. Verify against a real risk-reports response; adjust `server/sca.js` (SEVERITY_RANK / severityOf) if different.
- Cloud regulatory report path is VERIFIED as `/enterprises/regulatory-reports` (params `projectKey`, optional `branchKey`; no `organization`). It returns JSON with a presigned `downloadLink`, fetched in a second unauthenticated request. Server uses `/api/regulatory_reports/download` (params `project`, optional `branchKey`; `Accept: application/zip`) and streams the zip directly. See `server/sonar-urls.js` and `server/sonar-client.js`.

## Tests
```bash
npm test
```
