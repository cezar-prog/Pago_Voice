export interface LatestThrottle<T> {
  /** Queues a value. `fn` runs at most once per `ms`, always with the newest value. */
  push: (value: T) => void;
  /** Drops any queued value and pending timer. */
  cancel: () => void;
}

/**
 * Throttles `fn` on the trailing edge: the first value goes through at once, later values
 * within `ms` are merged, and the newest one is delivered when the window ends.
 */
export function throttleLatest<T>(fn: (value: T) => void, ms: number): LatestThrottle<T> {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { value: T } | null = null;

  const flush = () => {
    timer = undefined;
    if (!pending) return;
    const { value } = pending;
    pending = null;
    last = Date.now();
    fn(value);
  };

  return {
    push(value) {
      pending = { value };
      const wait = ms - (Date.now() - last);
      if (wait <= 0) {
        clearTimeout(timer);
        flush();
      } else if (timer === undefined) {
        timer = setTimeout(flush, wait);
      }
    },
    cancel() {
      clearTimeout(timer);
      timer = undefined;
      pending = null;
    },
  };
}
