export interface AsyncMutex {
  run<T>(work: () => Promise<T>): Promise<T>;
}

/** One application instance coordinates file publication and its compensation. */
export function createAsyncMutex(): AsyncMutex {
  let tail = Promise.resolve();
  return {
    async run<T>(work: () => Promise<T>): Promise<T> {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try { return await work(); }
      finally { release(); }
    },
  };
}
