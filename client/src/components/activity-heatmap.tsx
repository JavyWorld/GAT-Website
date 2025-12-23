import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useIsMobileResolved } from "@/hooks/use-mobile";
import { useState, useLayoutEffect } from "react";
import type { HeatmapData } from "@shared/schema";

interface ActivityHeatmapProps {
  data: HeatmapData;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getHeatmapColor(value: number, maxValue: number): string {
  if (value === 0) return "bg-muted/30";
  
  const intensity = value / maxValue;
  
  if (intensity < 0.2) return "bg-primary/20";
  if (intensity < 0.4) return "bg-primary/40";
  if (intensity < 0.6) return "bg-primary/60";
  if (intensity < 0.8) return "bg-primary/80";
  return "bg-primary";
}

function formatHour(hour: number): string {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const { isMobile, isResolved } = useIsMobileResolved();
  const [isOpen, setIsOpen] = useState(true);

  // On mobile, default heatmap to collapsed; on desktop, expanded
  useLayoutEffect(() => {
    if (isResolved) {
      setIsOpen(!isMobile);
    }
  }, [isMobile, isResolved]);

  const getValueForCell = (day: number, hour: number): number => {
    const cell = data.find((d) => d.day === day && d.hour === hour);
    return cell?.value ?? 0;
  };

  const heatmapContent = (
    <div className="overflow-x-auto">
      <div className="min-w-[500px]">
        <div className="flex gap-1 mb-2 ml-12">
          {HOURS.filter((h) => h % 3 === 0).map((hour) => (
            <div
              key={hour}
              className="text-[10px] text-muted-foreground"
              style={{ width: "calc((100% - 48px) / 8)", textAlign: "center" }}
            >
              {formatHour(hour)}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          {DAYS.map((day, dayIndex) => (
            <div key={day} className="flex items-center gap-1">
              <div className="w-10 text-xs text-muted-foreground text-right pr-2">
                {day}
              </div>
              <div className="flex-1 flex gap-[2px]">
                {HOURS.map((hour) => {
                  const value = getValueForCell(dayIndex, hour);
                  return (
                    <Tooltip key={`${dayIndex}-${hour}`}>
                      <TooltipTrigger asChild>
                        <div
                          className={`flex-1 h-6 rounded-sm transition-all hover:scale-110 hover:z-10 cursor-pointer ${getHeatmapColor(value, maxValue)}`}
                          data-testid={`heatmap-cell-${dayIndex}-${hour}`}
                        />
                      </TooltipTrigger>
                      <TooltipContent 
                        side="top"
                        className="bg-popover border-popover-border"
                      >
                        <p className="text-sm font-medium">
                          {day} at {formatHour(hour)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {value} players online
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 mt-4">
          <span className="text-xs text-muted-foreground">Less</span>
          <div className="flex gap-1">
            <div className="w-4 h-4 rounded-sm bg-muted/30" />
            <div className="w-4 h-4 rounded-sm bg-primary/20" />
            <div className="w-4 h-4 rounded-sm bg-primary/40" />
            <div className="w-4 h-4 rounded-sm bg-primary/60" />
            <div className="w-4 h-4 rounded-sm bg-primary/80" />
            <div className="w-4 h-4 rounded-sm bg-primary" />
          </div>
          <span className="text-xs text-muted-foreground">More</span>
        </div>
      </div>
    </div>
  );

  // Show a simple loading state until isMobile is resolved to prevent flash
  if (!isResolved) {
    return (
      <Card className="border-card-border bg-card/80 backdrop-blur-sm" data-testid="activity-heatmap">
        <CardHeader className="pb-4">
          <CardTitle className="font-display text-lg tracking-wide flex items-center gap-2 flex-wrap">
            <span className="text-foreground" style={{ textShadow: "0 0 20px hsl(210, 90%, 55%, 0.3)" }}>
              Activity Heatmap
            </span>
            <span className="text-xs font-sans font-normal text-muted-foreground">
              (Miami Time)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isMobile) {
    return (
      <Card className="border-card-border bg-card/80 backdrop-blur-sm" data-testid="activity-heatmap">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-4 cursor-pointer hover-elevate">
              <CardTitle className="font-display text-lg tracking-wide flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span 
                    className="text-foreground"
                    style={{ textShadow: "0 0 20px hsl(210, 90%, 55%, 0.3)" }}
                  >
                    Activity Heatmap
                  </span>
                  <span className="text-xs font-sans font-normal text-muted-foreground">
                    (Miami Time)
                  </span>
                </div>
                <ChevronDown className={`w-5 h-5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>{heatmapContent}</CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    );
  }

  return (
    <Card className="border-card-border bg-card/80 backdrop-blur-sm" data-testid="activity-heatmap">
      <CardHeader className="pb-4">
        <CardTitle className="font-display text-lg tracking-wide flex items-center gap-2 flex-wrap">
          <span 
            className="text-foreground"
            style={{ textShadow: "0 0 20px hsl(210, 90%, 55%, 0.3)" }}
          >
            Activity Heatmap
          </span>
          <span className="text-xs font-sans font-normal text-muted-foreground ml-2">
            (Players online by day/hour - Miami Time)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>{heatmapContent}</CardContent>
    </Card>
  );
}
