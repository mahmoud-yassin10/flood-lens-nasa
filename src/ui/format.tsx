import React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function fmtNA(
  value: number | null | undefined,
  unit = "",
  digits = 1,
  className?: string,
): React.ReactNode {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className={cn("na", className)}>—</span>;
  }

  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return <span className={cn("na", className)}>—</span>;
  }

  const formatted = numeric.toLocaleString(undefined, {
    minimumFractionDigits: numeric % 1 === 0 ? 0 : digits,
    maximumFractionDigits: digits,
  });

  return <span className={className}>{formatted}{unit}</span>;
}

export function confidenceBadge(confidence: string | null | undefined): React.ReactNode {
  const value = (confidence ?? "low").toLowerCase();
  const label = value.charAt(0).toUpperCase() + value.slice(1);
  const styles: Record<string, string> = {
    high: "border-emerald-400/30 bg-emerald-400/15 text-emerald-300",
    medium: "border-amber-400/30 bg-amber-400/15 text-amber-200",
    low: "border-rose-400/30 bg-rose-400/15 text-rose-300",
  };
  return (
    <Badge
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        styles[value] ?? styles.low,
      )}
      variant="outline"
    >
      {label}
    </Badge>
  );
}
