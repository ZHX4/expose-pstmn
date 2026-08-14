import { runDoctor } from "./doctor.js";
import { runGateway } from "./gateway.js";
import { runProvider } from "./provider.js";

export interface CliContext {
  readonly version: string;
  readonly help: string;
}

export function getHelpText(): string {
  return [
    "expose-pstmn — Postman AI integration gateway",
    "",
    "Usage:",
    "  expose-pstmn [command] [options]",
    "",
    "Commands:",
    "  help       Show this help message",
    "  version    Print the installed version",
    "  doctor     Discover local Postman capabilities",
    "  provider   Inspect and use the configured Postman provider",
    "  gateway    Start the local HTTP gateway",
    "",
    "Doctor options:",
    "  --json     Emit machine-readable JSON instead of human-readable output",
    "",
    "Provider commands:",
    "  status     Initialize the configured provider and report readiness",
    "  tools      List tools exposed by the configured provider",
    "",
    "Gateway commands:",
    "  start      Start the localhost-only HTTP gateway",
    "",
    "Phase 4 status:",
    "  Local gateway is implemented; model completion remains disabled until a provider exposes a verified model interface.",
  ].join("\n");
}

export async function runCli(
  args: readonly string[],
  context: CliContext,
  output: (text: string) => void = console.log,
  error: (text: string) => void = console.error,
): Promise<number> {
  const [command, ...commandArgs] = args;

  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      output(context.help);
      return 0;

    case "version":
    case "--version":
    case "-v":
      output(context.version);
      return 0;

    case "doctor":
      return runDoctor(commandArgs, output);

    case "provider":
      return runProvider(commandArgs, output, error);

    case "gateway":
      return runGateway(commandArgs, output, error);

    default:
      error(`Unknown command: ${command}`);
      error("");
      error(context.help);
      return 1;
  }
}
