export interface RateLimiter {
  readonly allow: () => boolean;
  readonly remaining: () => number;
}

export class ConcurrencyLimitError extends Error {
  public constructor() {
    super("Gateway concurrency queue is full.");
    this.name = "ConcurrencyLimitError";
  }
}

export function createRateLimiter(limitPerMinute: number, now: () => number = () => Date.now()): RateLimiter {
  let windowStart = now();
  let count = 0;

  function resetIfNeeded(): void {
    const current = now();
    if (current - windowStart >= 60_000) {
      windowStart = current;
      count = 0;
    }
  }

  return {
    allow(): boolean {
      resetIfNeeded();
      if (count >= limitPerMinute) return false;
      count += 1;
      return true;
    },
    remaining(): number {
      resetIfNeeded();
      return Math.max(0, limitPerMinute - count);
    },
  };
}

export function createConcurrencyGate(maxConcurrent: number, maxQueued = maxConcurrent * 4): { run<T>(task: () => Promise<T>): Promise<T> } {
  let active = 0;
  const queue: Array<{
    readonly task: () => Promise<unknown>;
    readonly resolve: (value: unknown) => void;
    readonly reject: (reason: unknown) => void;
  }> = [];

  const pump = (): void => {
    while (active < maxConcurrent && queue.length > 0) {
      const item = queue.shift() as (typeof queue)[number];
      active += 1;
      void item.task().then(item.resolve, item.reject).finally(() => {
        active -= 1;
        pump();
      });
    }
  };

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      if (queue.length >= maxQueued) return Promise.reject(new ConcurrencyLimitError());
      return new Promise<T>((resolve, reject) => {
        queue.push({
          task: task as () => Promise<unknown>,
          resolve: resolve as (value: unknown) => void,
          reject,
        });
        pump();
      });
    },
  };
}
