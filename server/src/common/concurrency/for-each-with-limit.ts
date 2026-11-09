/**
 * Runs `task` for every item, with at most `limit` running at once.
 *
 * Use it when each item waits mostly on the network (a weather API, a remote database), so that
 * doing them one by one is slow, but starting all of them together would swamp the API or the
 * small connection pool. After the first failure no new item is started; the ones already running
 * finish, then that first error is thrown.
 */
export async function forEachWithLimit<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<unknown>,
): Promise<void> {
  let next = 0;
  const state: { failed: boolean; error?: unknown } = { failed: false };

  const worker = async (): Promise<void> => {
    while (!state.failed && next < items.length) {
      const item = items[next++] as T;
      try {
        await task(item);
      } catch (error) {
        if (!state.failed) {
          state.failed = true;
          state.error = error;
        }
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  if (state.failed) throw state.error;
}
