import pLimit from "p-limit";

export type IndexedResult<TValue> = {
  index: number;
  value: TValue;
};

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

export function chunkItems<TItem>(items: readonly TItem[], batchSize: number): TItem[][] {
  assertPositiveInteger(batchSize, "batchSize");

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
): Promise<TResult[]> {
  assertPositiveInteger(concurrency, "concurrency");

  if (items.length === 0) {
    return [];
  }

  const limit = pLimit(concurrency);
  return Promise.all(items.map((item, index) => limit(() => mapper(item, index))));
}

export async function mapBatches<TItem, TResult>(
  items: readonly TItem[],
  batchSize: number,
  concurrency: number,
  mapper: (batch: TItem[], batchIndex: number) => Promise<TResult[]>,
): Promise<TResult[]> {
  const batches = chunkItems(items, batchSize);
  const batchResults = await mapLimit(batches, concurrency, mapper);

  return batchResults.flat();
}
