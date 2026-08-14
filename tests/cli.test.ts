import { afterEach, describe, expect, it, vi } from "vitest";

import { getHelpText, runCli } from "../src/core/cli.js";

const context = {
  version: "0.1.0",
  help: getHelpText(),
};

const originalPostmanApiKey = process.env.POSTMAN_API_KEY;
const originalPostmanRegion = process.env.POSTMAN_REGION;
const originalPostmanMcpEndpoint = process.env.POSTMAN_MCP_ENDPOINT;

afterEach(() => {
  if (originalPostmanApiKey === undefined) delete process.env.POSTMAN_API_KEY;
  else process.env.POSTMAN_API_KEY = originalPostmanApiKey;
  if (originalPostmanRegion === undefined) delete process.env.POSTMAN_REGION;
  else process.env.POSTMAN_REGION = originalPostmanRegion;
  if (originalPostmanMcpEndpoint === undefined) delete process.env.POSTMAN_MCP_ENDPOINT;
  else process.env.POSTMAN_MCP_ENDPOINT = originalPostmanMcpEndpoint;
  vi.restoreAllMocks();
});

describe("CLI", () => {
  it("prints help for no command", async () => {
    const output: string[] = [];
    const code = await runCli([], context, (text) => output.push(text));

    expect(code).toBe(0);
    expect(output).toHaveLength(1);
    expect(output[0]).toContain("expose-pstmn");
  });

  it("prints the version", async () => {
    const output: string[] = [];
    const code = await runCli(["version"], context, (text) => output.push(text));

    expect(code).toBe(0);
    expect(output).toEqual(["0.1.0"]);
  });

  it("advertises the phase 3 provider command and subcommands", async () => {
    const output: string[] = [];
    const code = await runCli(["--help"], context, (text) => output.push(text));

    expect(code).toBe(0);
    expect(output[0]).toContain("provider");
    expect(output[0]).toContain("status");
    expect(output[0]).toContain("tools");
  });

  it("routes provider commands through the provider layer", async () => {
    delete process.env.POSTMAN_API_KEY;
    delete process.env.POSTMAN_REGION;
    delete process.env.POSTMAN_MCP_ENDPOINT;

    const errors: string[] = [];
    const code = await runCli(["provider", "status"], () => undefined, (text) => errors.push(text));

    expect(code).toBe(2);
    expect(errors).toEqual([
      "US Postman MCP requires authentication. Set POSTMAN_API_KEY for non-interactive provider access.",
    ]);
  });

  it("rejects unknown commands", async () => {
    const errors: string[] = [];
    const code = await runCli(["unknown"], context, undefined, (text) => errors.push(text));

    expect(code).toBe(1);
    expect(errors[0]).toBe("Unknown command: unknown");
    expect(errors[2]).toContain("Usage:");
  });
});
