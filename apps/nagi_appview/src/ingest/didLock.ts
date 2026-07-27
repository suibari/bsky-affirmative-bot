const tails = new Map<string, Promise<void>>();

/** 同一 DID の Jetstream・照合・即時修復だけを直列化する。 */
export async function withDidLock<T>(
  did: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = tails.get(did) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => current);
  tails.set(did, tail);
  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (tails.get(did) === tail) tails.delete(did);
  }
}
