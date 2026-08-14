import type { DiscoveryReport, ToolCheck } from "./types.js";

function formatCheck(check: ToolCheck): string {
  const suffix = check.endpoint ? ` — ${check.endpoint}` : "";
  const version = check.version ? ` v${check.version}` : "";
  const region = check.region ? ` [${check.region.toUpperCase()}]` : "";
  return `  ${check.name}${version}${region}: ${check.status}${suffix}\n    ${check.detail}`;
}

export function formatDiscoveryReport(report: DiscoveryReport): string {
  const lines = [
    "expose-pstmn — Postman capability discovery",
    "",
    `Phase: ${report.phase}`,
    `Generated: ${report.generatedAt}`,
    `Runtime: ${report.nodeVersion} on ${report.platform}`,
    "",
    "Postman CLI:",
    formatCheck(report.postmanCli),
    "",
    "Postman API:",
    formatCheck(report.postmanApi),
    "",
    "Postman MCP endpoints:",
    ...report.mcp.map((check) => {
      const details = [
        formatCheck(check),
        `    transport=${check.transport}`,
        `    configuration=${check.configuration}`,
        `    HTTP status=${check.httpStatus ?? "none"}`,
        `    initialize=${check.initializeSucceeded ? "ok" : "failed"}`,
        `    tools/list=${check.toolsListSucceeded ? "ok" : "failed"}`,
        `    session=${check.sessionEstablished ? "established" : "not established"}`,
        `    authentication=${check.authenticationMode}`,
      ];
      if (check.toolCount !== undefined) details.push(`    tool count=${check.toolCount}`);
      return details.join("\n");
    }),
    "",
    "Learn configuration:",
    formatCheck(report.learnConfiguration),
    "",
    "Environment:",
    `  POSTMAN_API_KEY: ${report.environment.postmanApiKeyConfigured ? "configured" : "not configured"}`,
    `  POSTMAN_API_BASE_URL: ${report.environment.postmanApiBaseUrl ?? "not configured"}`,
    `  region: ${report.environment.postmanRegion}`,
    "",
    "Known Agent Mode model evidence:",
    ...report.models.map((model) =>
      `  ${model.id}: source=${model.source}, externallyCallable=${model.externallyCallable}\n    ${model.evidence}`,
    ),
    "",
    "Conclusions:",
    ...report.conclusions.map((conclusion) => `  - ${conclusion}`),
  ];

  return lines.join("\n");
}

export function formatDiscoveryJson(report: DiscoveryReport): string {
  return JSON.stringify(report, null, 2);
}
