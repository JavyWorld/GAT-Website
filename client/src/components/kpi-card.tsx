import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: number;
  icon: LucideIcon;
  iconColor?: string;
  glowColor?: string;
}

export function KPICard({ 
  title, 
  value, 
  subtitle, 
  trend, 
  icon: Icon,
  iconColor = "text-primary",
  glowColor = "hsl(210, 90%, 55%)"
}: KPICardProps) {
  const getTrendIcon = () => {
    if (trend === undefined) return null;
    if (trend > 0) return <TrendingUp className="w-3 h-3" />;
    if (trend < 0) return <TrendingDown className="w-3 h-3" />;
    return <Minus className="w-3 h-3" />;
  };

  const getTrendColor = () => {
    if (trend === undefined) return "";
    if (trend > 0) return "text-green-400";
    if (trend < 0) return "text-red-400";
    return "text-muted-foreground";
  };

  return (
    <Card 
      className="relative overflow-visible border-card-border bg-card/80 backdrop-blur-sm"
      data-testid={`kpi-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div 
        className="absolute -inset-[1px] rounded-md opacity-20 blur-sm -z-10"
        style={{ background: `linear-gradient(135deg, ${glowColor}, transparent)` }}
      />
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
            <p 
              className="text-3xl font-display font-semibold tracking-tight"
              style={{ textShadow: `0 0 30px ${glowColor}40` }}
            >
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
            {trend !== undefined && (
              <div className={`flex items-center gap-1 mt-2 text-xs ${getTrendColor()}`}>
                {getTrendIcon()}
                <span>{Math.abs(trend)}% from last week</span>
              </div>
            )}
          </div>
          <div 
            className={`p-3 rounded-md ${iconColor} bg-current/10`}
            style={{ boxShadow: `0 0 20px ${glowColor}30` }}
          >
            <Icon className="w-5 h-5" style={{ color: glowColor }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
