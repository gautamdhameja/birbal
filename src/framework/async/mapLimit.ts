import pLimit from "p-limit";

export async function mapLimit<TItem, TResult>(
  items: readonly TItem[],
  concurrency: number,
  mapper: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("concurrency must be a positive integer.");
  }

  const limit = pLimit(concurrency);
  return Promise.all(items.map((item, index) => limit(() => mapper(item, index))));
}
