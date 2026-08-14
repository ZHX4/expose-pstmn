import { loadGatewayConfig } from "../api/config.js";
import { startGatewayServer } from "../api/server.js";
import { createProviderFromEnvironment } from "../providers/factory.js";

export async function runGateway(
  args: readonly string[],
  output: (text: string) => void = console.log,
  error: (text: string) => void = console.error,
): Promise<number> {
  if (args.length > 0 && args[0] !== "start") {
    error(`Unknown gateway command: ${args[0]}`);
    error("Usage: expose-pstmn gateway start");
    return 1;
  }

  try {
    const config = loadGatewayConfig();
    const provider = createProviderFromEnvironment();
    const server = await startGatewayServer(config, provider);

    output(`Gateway listening on http://${server.host}:${server.port}`);
    output(`Provider: ${provider.id}`);
    output("Press Ctrl+C to stop.");

    await new Promise<void>((resolve) => {
      let stopped = false;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        void server.close().finally(resolve);
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });

    return 0;
  } catch (cause) {
    error(cause instanceof Error ? cause.message : "Unable to start gateway.");
    return 2;
  }
}
