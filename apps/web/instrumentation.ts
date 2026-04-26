// Polyfill Promise.try for environments below Node 22.
// unpdf@1.6 ships pdfjs that calls Promise.try; without this the ingest
// job throws `TypeError: Promise.try is not a function` on Node ≤ 21.
export function register() {
  if (typeof Promise.try !== 'function') {
    // @ts-expect-error - assigning the polyfill
    Promise.try = function tryPolyfill<T>(fn: () => T | PromiseLike<T>, ...args: unknown[]) {
      return new Promise<T>((resolve) => {
        // @ts-expect-error - relay extra args verbatim
        resolve(fn(...args));
      });
    };
  }
}
