import React from "react";

import { confidenceBadge } from "@/ui/format";

type Pred = {
  status: "fallback_static" | "persistence" | "forecast";
  risk_index: number; // 0..1
  confidence: "low" | "medium" | "high";
  valid_until: string | null;
  notes?: string;
};

const STATUS_EXPLANATION: Record<Pred["status"], string> = {
  forecast: "Blended HAND baseline and short-term precipitation signal.",
  persistence: "Based on recent SAR \"new water\" extent with exponential decay.",
  fallback_static: "HAND-only baseline (no fresh SAR/IMERG inputs).",
};

const VALID_UNTIL_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
};


export function PredictionCard({ prediction }: { prediction?: Pred | null }) {
  if (!prediction) return null;

  const pct = Math.round(Math.max(0, Math.min(1, prediction.risk_index ?? 0)) * 100);
  const status = prediction.status ?? "fallback_static";
  const explanation = STATUS_EXPLANATION[status] ?? STATUS_EXPLANATION.fallback_static;
  const notes = prediction.notes ? ` ${prediction.notes}` : "";

  return (
    <div className="rounded-xl border border-border bg-panel/80 p-4 shadow-sm transition-colors">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">Predicted flood risk</h3>
        {confidenceBadge(prediction.confidence)}
      </div>

      <div className="mt-3 space-y-2">
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-foreground/10">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{pct}% risk index</span>
          {prediction.valid_until ? (
            <span>
              Valid until {new Date(prediction.valid_until).toLocaleString(undefined, VALID_UNTIL_FORMAT)}
            </span>
          ) : null}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
        {explanation}
        {notes}
      </p>
    </div>
  );
}


