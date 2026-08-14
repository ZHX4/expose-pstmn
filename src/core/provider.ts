import { createProviderFromEnvironment } from "../providers/factory.js";

export async function runProvider(
  args: readonly string[],
  output: (text: string) => void = console.log,
  error: (text: string) => void = console.error,
): Promise<number> {
  const [subcommand] = args;

  try {
    const provider = createProviderFromEnvironment();

    switch (subcommand) {
      case undefined:
      case "status": {
        const health = await provider.health();
        output(`Provider: ${health.provider}`);
        output(`Ready: ${health.ready ? "yes" : "no"}`);
        output(health.detail);
        return health.ready ? 0 : 2;
      }

      case "tools": {
        const tools = await provider.listTools();
        output(JSON.stringify({ provider: provider.id, tools }, null, 2));
        return 0;
      }

      default:
        error(`Unknown provider command: ${subcommand}`);
        error("Usage: expose-pstmn provider [status|tools]");
        return 1;
    }
  } catch (cause) {
    error(cause instanceof Error ? cause.message : "Unknown provider error.");
    return 2;
  }
}
