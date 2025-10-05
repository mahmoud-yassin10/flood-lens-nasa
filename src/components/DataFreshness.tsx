interface DataFreshnessProps {
  freshness: "fresh" | "stale" | "old";
  size?: number;
}

export function DataFreshness({ freshness, size = 8 }: DataFreshnessProps) {
  const colorMap = {
    fresh: "bg-data-fresh",
    stale: "bg-data-stale",
    old: "bg-data-old",
  };

  const titleMap = {
    fresh: "Data updated within 3 hours",
    stale: "Data 3-24 hours old",
    old: "Data over 24 hours old",
  };

  return (
    <div
      className={`rounded-full ${colorMap[freshness]} animate-pulse`}
      style={{ width: size, height: size }}
      title={titleMap[freshness]}
    />
  );
}
