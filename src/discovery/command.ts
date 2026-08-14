import { spawn } from "node:child_process";

export interface CommandResult {
  readonly found: boolean;
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export function runCommand(
  command: string,
  args: readonly string[],
  options: { readonly timeoutMs?: number } = {},
): Promise<CommandResult> {
  const timeoutMs = options.timeoutMs ?? 5_000;

  return new Promise((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";

    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const finish = (result: CommandResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill();
      finish({ found: true, code: null, stdout, stderr: `${stderr}Command timed out after ${timeoutMs}ms.` });
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      finish({
        found: error.code !== "ENOENT",
        code: null,
        stdout,
        stderr: error.message,
      });
    });

    child.on("close", (code) => {
      finish({ found: true, code, stdout, stderr });
    });
  });
}
