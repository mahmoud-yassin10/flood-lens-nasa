import React from "react";

type Pred = {
  status: "fallback_static" | "persistence" | "forecast";
  risk_index: number; // 0..1
  confidence: "low" | "medium" | "high";
  valid_until: string | null;
  notes?: string;
};

function badgeClass(c: Pred["confidence"]) {
  if (c === "high") return "bg-green-100 text-green-800";
  if (c === "medium") return "bg-amber-100 text-amber-900";
  return "bg-gray-200 text-gray-800";
}

export function PredictionCard({ prediction }: { prediction?: Pred | null }) {
  if (!prediction) return null;
  const pct = Math.round((prediction.risk_index ?? 0) * 100);
  const label =
    prediction.status === "forecast"
      ? "Forecast blend"
      : prediction.status === "persistence"
      ? "Persistence"
      : "HAND baseline";

  return (
    <div className="rounded-2xl border border-gray-200 p-4 shadow-sm bg-white">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          Predicted flood risk
        </h3>
        <span className={`px-2 py-0.5 text-xs rounded-full ${badgeClass(prediction.confidence)}`}>
          {prediction.confidence}
        </span>
      </div>
      <div className="mt-3">
        <div className="flex items-baseline gap-2">
          <div className="text-3xl font-bold">{pct}<span className="text-xl">%</span></div>
          <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
        </div>
        {prediction.notes ? (
          <p className="mt-2 text-sm text-gray-600">{prediction.notes}</p>
        ) : null}
        {prediction.valid_until ? (
          <p className="mt-1 text-xs text-gray-400">Valid until {new Date(prediction.valid_until).toLocaleString()}</p>
        ) : null}
      </div>
    </div>
  );
}
