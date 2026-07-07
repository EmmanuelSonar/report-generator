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
- **macOS:** double-click `start.command` (optional wrapper) or run `npm start`.
- **Windows:** run `npm start` in a terminal.

## API notes
- SCA severity field: `severity` (INFO, LOW, MEDIUM, HIGH, BLOCKER).
- Cloud regulatory report path confirmed as: `/regulatory-reports/download`.

## Tests
```bash
npm test
```
