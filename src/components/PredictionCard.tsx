import * as React from "react";
import { cn } from "@/lib/utils";

type Prediction = {
  status?: "fallback_static" | "persistence" | "forecast";
  index_pct?: number;        // optional percent from feed
  risk_index?: number;       // legacy name
  confidence?: "low" | "medium" | "high";
  valid_until?: string;
  notes?: string;
};

type Props = {
  prediction?: Prediction | null;
  /** NEW: pass live.risk.score (0–1). If present, this ALWAYS drives the % label + bar. */
  riskScore?: number | null;
  className?: string;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clampPct = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

export function PredictionCard({ prediction, riskScore, className }: Props) {
  // --- percent logic (THE FIX) ------------------------------------------------
  const percent: number = React.useMemo(() => {
    if (typeof riskScore === "number" && isFinite(riskScore)) {
      return clampPct(clamp01(riskScore) * 100); // <— always risk.score × 100 when available
    }
    if (typeof prediction?.index_pct === "number" && isFinite(prediction.index_pct)) {
      return clampPct(prediction.index_pct);
    }
    if (typeof prediction?.risk_index === "number" && isFinite(prediction.risk_index)) {
      return clampPct(prediction.risk_index);
    }
    return 28; // neutral fallback, never 100
  }, [riskScore, prediction?.index_pct, prediction?.risk_index]);
  // ---------------------------------------------------------------------------

  const confidence = (prediction?.confidence ?? "medium") as "low" | "medium" | "high";
  const validLabel = prediction?.valid_until
    ? new Date(prediction.valid_until).toLocaleString()
    : undefined;

  const pill =
    confidence === "high"
      ? "bg-emerald-100 text-emerald-800"
      : confidence === "medium"
      ? "bg-yellow-100 text-yellow-800"
      : "bg-slate-200 text-slate-700";

  const note =
    prediction?.notes ??
    "Derived from blended hydro-terrain indicators and recent satellite observations.";

  return (
    <div className={cn("rounded-md border bg-panel/80 p-3 text-sm", className)}>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-semibold text-muted-foreground">Predicted flood risk</h4>
        <span className={cn("rounded-full px-2 py-0.5 text-xs", pill)}>
          {confidence[0].toUpperCase() + confidence.slice(1)}
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded bg-muted">
        <div
          className="h-2 bg-gradient-to-r from-cyan-400 to-indigo-500 transition-all"
          style={{ width: `${percent}%` }}
          aria-label={`Risk index ${percent}%`}
        />
      </div>

      <div className="mt-1 flex items-center justify-between text-xs">
        <span>{percent}% risk index</span>
        {validLabel ? <span className="text-muted-foreground">Valid until {validLabel}</span> : null}
      </div>

      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{note}</p>
    </div>
  );
}

export default PredictionCard;
