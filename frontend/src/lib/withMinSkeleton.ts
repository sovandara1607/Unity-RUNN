// Minimum time the loading skeleton stays on screen. Below this,
// skeletons flash so briefly they read as flicker rather than
// progress.
export const MIN_SKELETON_MS = 500;

// Runs work() but always takes at least minMs, so callers can
// `setLoading(true)` … await this … `setLoading(false)` without a
// fast response producing a one-frame skeleton flash.
export async function withMinSkeleton<T>(work: () => Promise<T>, minMs: number = MIN_SKELETON_MS): Promise<T> {
  const startedAt = Date.now();
  const result = await work();
  const remaining = minMs - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
  return result;
}
