// Side-effect module — installs runtime polyfills before any consumer
// touches PDF.js. Must be the first import in entry points that load
// unpdf, since unpdf@1.6 ships a bundled pdfjs that calls Promise.try
// (only available in Node ≥ 22).

if (typeof (Promise as unknown as { try?: unknown }).try !== 'function') {
  Object.defineProperty(Promise, 'try', {
    value: function tryPolyfill<T>(fn: (...args: unknown[]) => T | PromiseLike<T>, ...args: unknown[]) {
      return new Promise<T>((resolve) => {
        resolve(fn(...args));
      });
    },
    writable: true,
    configurable: true,
  });
}

export {};
