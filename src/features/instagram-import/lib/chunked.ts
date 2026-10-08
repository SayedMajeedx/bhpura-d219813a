/**
 * Runs a slow job over many items in small batches, a few at a time, so one failed batch does not
 * lose the rest, progress is real, and the person can cancel between batches.
 *
 * Each batch is retried (with a growing wait) before it is given up; a batch that still fails is
 * reported to the caller, which decides what to do with those items, and everything else is kept.
 */

export class ImportCancelled extends Error {
  constructor() {
    super("Import cancelled");
    this.name = "ImportCancelled";
  }
}

export type ChunkFailure<T> = { index: number; items: T[]; error: unknown };

export type ChunkedOptions<T, R> = {
  /** Items per batch. */
  size: number;
  /** Batches running at once. */
  concurrency: number;
  /** Extra attempts after the first for a failing batch. */
  retries?: number;
  /** Wait before each retry, in ms (the last value is reused). */
  backoffMs?: number[];
  signal?: AbortSignal;
  worker: (batch: T[], index: number) => Promise<R>;
  /** Items finished so far (successfully or not) out of the total. */
  onProgress?: (done: number, total: number) => void;
  /** For tests: how to wait. */
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runChunked<T, R>(
  items: readonly T[],
  options: ChunkedOptions<T, R>,
): Promise<{ results: Array<R | undefined>; failures: Array<ChunkFailure<T>> }> {
  const { size, concurrency, signal, worker, onProgress } = options;
  const retries = options.retries ?? 2;
  const backoff = options.backoffMs ?? [1500, 4000];
  const sleep = options.sleep ?? defaultSleep;

  const batchSize = Math.max(1, size);
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += batchSize) {
    batches.push(items.slice(start, start + batchSize));
  }
  const results: Array<R | undefined> = new Array(batches.length).fill(undefined);
  const failures: Array<ChunkFailure<T>> = [];
  let done = 0;
  let next = 0;

  const checkCancelled = () => {
    if (signal?.aborted) throw new ImportCancelled();
  };

  async function runBatch(index: number) {
    const batch = batches[index];
    let lastError: unknown;
    let succeeded = false;
    for (let attempt = 0; attempt <= retries; attempt++) {
      checkCancelled();
      try {
        results[index] = await worker(batch, index);
        succeeded = true;
        break;
      } catch (error) {
        if (error instanceof ImportCancelled) throw error;
        lastError = error;
        if (attempt < retries) await sleep(backoff[Math.min(attempt, backoff.length - 1)] ?? 0);
      }
    }
    if (!succeeded) failures.push({ index, items: batch, error: lastError });
    done += batch.length;
    onProgress?.(done, items.length);
  }

  async function lane() {
    while (next < batches.length) {
      checkCancelled();
      const index = next++;
      await runBatch(index);
    }
  }

  onProgress?.(0, items.length);
  const lanes = Math.max(1, Math.min(concurrency, batches.length));
  await Promise.all(Array.from({ length: lanes }, lane));
  failures.sort((a, b) => a.index - b.index);
  return { results, failures };
}
