export type RetryNotice<T> = {
  item: T;
  error: unknown;
  attempt: number;
  delayMs: number;
};

export class SerialRetryQueue<T> {
  private accepting = true;
  private tail = Promise.resolve();
  private pending = 0;

  constructor(
    private readonly handler: (item: T) => Promise<void>,
    private readonly onRetry: (notice: RetryNotice<T>) => void,
    private readonly wait: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  enqueue(item: T): boolean {
    if (!this.accepting) return false;
    this.pending++;
    this.tail = this.tail
      .then(async () => {
        let attempt = 0;
        for (;;) {
          try {
            await this.handler(item);
            return;
          } catch (error) {
            attempt++;
            const delayMs = Math.min(
              30_000,
              1_000 * 2 ** Math.min(attempt - 1, 5),
            );
            this.onRetry({ item, error, attempt, delayMs });
            await this.wait(delayMs);
          }
        }
      })
      .finally(() => {
        this.pending--;
      });
    return true;
  }

  get size(): number {
    return this.pending;
  }

  async close(): Promise<void> {
    this.accepting = false;
    await this.tail;
  }
}
