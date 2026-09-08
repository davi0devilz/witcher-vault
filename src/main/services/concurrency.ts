/**
 * Runs `fn` over `items` with at most `limit` calls in flight at once —
 * used wherever a batch of per-item network requests (Steam appdetails
 * lookups, etc.) needs bounded parallelism instead of one huge Promise.all.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex++
      results[current] = await fn(items[current])
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
