import { Badge } from "@/components/ui/badge";
import { AlertCircle, AlertTriangle, CheckCircle } from "lucide-react";

interface RiskBadgeProps {
  risk: "Low" | "Medium" | "High";
  size?: "sm" | "default" | "lg";
}

export function RiskBadge({ risk, size = "default" }: RiskBadgeProps) {
  const config = {
    Low: {
      icon: CheckCircle,
      className: "bg-risk-low/10 text-risk-low border-risk-low/20",
    },
    Medium: {
      icon: AlertTriangle,
      className: "bg-risk-medium/10 text-risk-medium border-risk-medium/20",
    },
    High: {
      icon: AlertCircle,
      className: "bg-risk-high/10 text-risk-high border-risk-high/20",
    },
  };

  const { icon: Icon, className } = config[risk];
  const iconSize = size === "sm" ? 12 : size === "lg" ? 18 : 14;

  return (
    <Badge variant="outline" className={`${className} gap-1 font-semibold`}>
      <Icon style={{ width: iconSize, height: iconSize }} />
      {risk} Risk
    </Badge>
  );
}
