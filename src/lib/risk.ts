export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Always compute percent from risk.score (fallback 0.28). Never default to 100. */
export function riskPercentFromScore(score: unknown): number {
  const s = typeof score === "number" && isFinite(score) ? score : 0.28;
  return Math.round(clamp01(s) * 100);
}
