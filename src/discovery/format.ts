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
    "Postman MCP endpoints:",
    ...report.mcp.map(formatCheck),
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
