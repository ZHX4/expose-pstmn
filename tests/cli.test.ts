import { describe, expect, it } from "vitest";

import { getHelpText, runCli } from "../src/core/cli.js";

const context = {
  version: "0.1.0",
  help: getHelpText(),
};

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

  it("prints help for --help and includes phase 2 doctor", async () => {
    const output: string[] = [];
    const code = await runCli(["--help"], context, (text) => output.push(text));

    expect(code).toBe(0);
    expect(output[0]).toContain("doctor");
    expect(output[0]).toContain("--json");
  });

  it("rejects unknown commands", async () => {
    const errors: string[] = [];
    const code = await runCli(["unknown"], context, undefined, (text) => errors.push(text));

    expect(code).toBe(1);
    expect(errors[0]).toBe("Unknown command: unknown");
    expect(errors[2]).toContain("Usage:");
  });
});
