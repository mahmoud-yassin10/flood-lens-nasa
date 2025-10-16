// 3-hour “rotation” helpers and safe time formatting.

export function current3hBucket(tsMs?: number): number {
  const ms = tsMs ?? Date.now();
  return Math.floor(ms / (3 * 3600 * 1000));
}

export function bucketStartIso(bucket: number): string {
  const startMs = bucket * 3 * 3600 * 1000;
  return new Date(startMs).toISOString();
}

export function fmtLocal(dtIso: string, tz?: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz, // leave undefined to use viewer locale if you don’t store tz per city
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    }).format(new Date(dtIso));
  } catch {
    return new Date(dtIso).toLocaleString();
  }
}
