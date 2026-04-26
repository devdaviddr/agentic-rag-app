/**
 * Tiny FIFO semaphore — no external deps. Used to cap page-level concurrency
 * during vision ingest (Ollama serializes on the GPU; > 2 in flight starves
 * upstream pipeline work).
 */
export interface Semaphore {
  acquire(): Promise<() => void>;
}

export function createSemaphore(maxConcurrent: number): Semaphore {
  if (maxConcurrent < 1) throw new Error('maxConcurrent must be >= 1');
  let active = 0;
  const waiters: Array<() => void> = [];

  const release = (): void => {
    active--;
    const next = waiters.shift();
    if (next) next();
  };

  return {
    acquire(): Promise<() => void> {
      if (active < maxConcurrent) {
        active++;
        return Promise.resolve(release);
      }
      return new Promise<() => void>((resolve) => {
        waiters.push(() => {
          active++;
          resolve(release);
        });
      });
    },
  };
}
