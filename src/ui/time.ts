const FALLBACK_LABEL = `Updated \u2014`;

export function formatUpdated(isoUtc?: string | null, tz?: string | null) {
  if (!isoUtc) return FALLBACK_LABEL;
  try {
    const d = new Date(isoUtc);
    if (Number.isNaN(d.getTime())) return FALLBACK_LABEL;
    const formatter = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz ?? "UTC",
    });
    return `Updated ${formatter.format(d)}${tz ? ` (${tz})` : " (UTC)"}`;
  } catch {
    return FALLBACK_LABEL;
  }
}

