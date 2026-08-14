export interface CliContext {
  readonly version: string;
  readonly help: string;
}

export function getHelpText(): string {
  return [
    "expose-pstmn — Postman AI integration gateway",
    "",
    "Usage:",
    "  expose-pstmn [command]",
    "",
    "Commands:",
    "  help       Show this help message",
    "  version    Print the installed version",
    "",
    "Phase 1 status:",
    "  Repository foundation initialized. Provider and gateway integrations are not active yet.",
  ].join("\n");
}

export async function runCli(
  args: readonly string[],
  context: CliContext,
  output: (text: string) => void = console.log,
  error: (text: string) => void = console.error,
): Promise<number> {
  const [command] = args;

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

    default:
      error(`Unknown command: ${command}`);
      error("");
      error(context.help);
      return 1;
  }
}
