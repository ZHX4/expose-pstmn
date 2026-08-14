import { discover } from "../discovery/discover.js";
import { formatDiscoveryJson, formatDiscoveryReport } from "../discovery/format.js";

export async function runDoctor(
  args: readonly string[],
  output: (text: string) => void = console.log,
): Promise<number> {
  const json = args.includes("--json");
  const report = await discover();
  output(json ? formatDiscoveryJson(report) : formatDiscoveryReport(report));
  return 0;
}
