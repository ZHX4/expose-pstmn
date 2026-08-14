export interface HttpProbeResult {
  readonly status: number | null;
  readonly ok: boolean;
  readonly detail: string;
}

export async function probeEndpoint(
  url: string,
  options: {
    readonly timeoutMs?: number;
    readonly headers?: Record<string, string>;
    readonly reachableStatuses?: readonly number[];
  } = {},
): Promise<HttpProbeResult> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const reachableStatuses = new Set(options.reachableStatuses ?? [200, 201, 202, 204, 301, 302, 307, 308, 400, 401, 403, 405]);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: {
        accept: "application/json, text/plain;q=0.9, */*;q=0.1",
        ...options.headers,
      },
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      return { status: response.status, ok: false, detail: "Endpoint is reachable but requires authentication." };
    }

    if (reachableStatuses.has(response.status)) {
      return {
        status: response.status,
        ok: true,
        detail: response.status === 405
          ? "Endpoint is reachable; this endpoint does not accept GET requests."
          : "Endpoint is reachable.",
      };
    }

    return { status: response.status, ok: false, detail: `Endpoint responded with HTTP ${response.status}.` };
  } catch (error) {
    const detail = error instanceof DOMException && error.name === "AbortError"
      ? `Probe timed out after ${timeoutMs}ms.`
      : error instanceof Error
        ? error.message
        : "Unknown network error.";
    return { status: null, ok: false, detail };
  } finally {
    clearTimeout(timer);
  }
}
