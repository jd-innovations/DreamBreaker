/**
 * Rejects if the wrapped promise/thenable doesn't settle within `ms`.
 *
 * Supabase client calls have no built-in timeout: a stale auth session or a
 * blocked network request can hang forever, leaving pages stuck on a loading
 * spinner. Wrapping data loads with this guarantees the UI resolves to an
 * error state instead of spinning indefinitely.
 */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(promise: PromiseLike<T>, ms = 12000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
