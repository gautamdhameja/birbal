import pLimit from "p-limit";

export type MapLimitOptions = {
  stopOnError?: boolean;
};

export function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return value;
}

export function chunkItems<TItem>(items: readonly TItem[], batchSize: number): TItem[][] {
  positiveInteger(batchSize, "batchSize");

  const chunks: TItem[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    chunks.push(items.slice(index, index + batchSize));
  }

  return chunks;
}

export async function mapLimit<TItem, TResult>(
  items: readonly TItem[],
  concurrency: number,
  mapper: (item: TItem, index: number) => Promise<TResult>,
  options: MapLimitOptions = {},
): Promise<TResult[]> {
  positiveInteger(concurrency, "concurrency");

  if (items.length === 0) {
    return [];
  }

  if (options.stopOnError) {
    const results = new Array<TResult>(items.length);
    let nextIndex = 0;
    let stopped = false;
    let firstError: unknown;

    const worker = async (): Promise<void> => {
      while (!stopped) {
        const index = nextIndex;
        if (index >= items.length) {
          return;
        }
        nextIndex += 1;

        try {
          results[index] = await mapper(items[index] as TItem, index);
        } catch (error) {
          if (!stopped) {
            stopped = true;
            firstError = error;
          }
          return;
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
    if (stopped) {
      throw firstError;
    }

    return results;
  }

  const limit = pLimit(concurrency);
  return Promise.all(items.map((item, index) => limit(() => mapper(item, index))));
}

export async function mapBatches<TItem, TResult>(
  items: readonly TItem[],
  batchSize: number,
  concurrency: number,
  mapper: (batch: TItem[], batchIndex: number) => Promise<TResult[]>,
  options: MapLimitOptions = {},
): Promise<TResult[]> {
  const batches = chunkItems(items, batchSize);
  const batchResults = await mapLimit(batches, concurrency, mapper, options);

  return batchResults.flat();
}
