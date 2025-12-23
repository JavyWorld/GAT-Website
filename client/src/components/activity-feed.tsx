import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, Trophy, ExternalLink } from "lucide-react";
import { WOW_CLASS_COLORS, type EnrichedGuildRun } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

// Build Raider.IO URL from runKey (format: {runId}-{level}-{dungeon-slug})
function getRaiderIOUrl(runKey: string): string {
  return `https://raider.io/mythic-plus-runs/season-tww-3/${runKey}`;
}

interface ActivityFeedProps {
  guildRuns: EnrichedGuildRun[];
}

// Key level color based on WoW rarity colors
function getKeyLevelColor(level: number): string {
  if (level >= 15) return "#A335EE"; // Epic purple
  if (level >= 10) return "#FF8000"; // Rare orange
  if (level >= 7) return "#0070FF";  // Blue
  return "#666666";                   // Gray
}

// Format time from ms to "Xm Ys" format
function formatClearTime(ms: number | null): string {
  if (!ms) return "N/A";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

// Check if run was in time (timer >= 100%)
function isInTime(clearTimeMs: number | null, parTimeMs: number | null): boolean {
  if (!clearTimeMs || !parTimeMs) return false;
  const timerPercent = (parTimeMs / clearTimeMs) * 100;
  return timerPercent >= 100;
}

export function ActivityFeed({ guildRuns }: ActivityFeedProps) {
  return (
    <Card className="border-card-border bg-card/80 backdrop-blur-sm h-full" data-testid="activity-feed">
      <CardHeader className="pb-4">
        <CardTitle className="font-display text-lg tracking-wide flex items-center gap-2">
          <Users className="w-5 h-5 text-accent" />
          <span 
            className="text-foreground"
            style={{ textShadow: "0 0 20px hsl(43, 85%, 55%, 0.3)" }}
          >
            Guild Activity
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {guildRuns.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Trophy className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No recent guild runs</p>
            <p className="text-xs mt-1">Guild runs appear when 2+ members complete M+ together</p>
          </div>
        ) : (
          guildRuns.map((run) => {
            const inTime = isInTime(run.clearTimeMs, run.parTimeMs);
            const keyColor = getKeyLevelColor(run.mythicLevel);
            
            return (
              <a 
                key={run.id}
                href={run.runKey ? getRaiderIOUrl(run.runKey) : undefined}
                target="_blank"
                rel="noreferrer"
                className="block p-3 rounded-md bg-muted/30 hover-elevate cursor-pointer group no-underline"
                data-testid={`guild-run-${run.id}`}
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                      {run.guildPlayerNames.map((name, idx) => {
                        const playerClass = run.playerClasses[idx] || "Unknown";
                        const classColor = WOW_CLASS_COLORS[playerClass] || "#FFFFFF";
                        return (
                          <span key={idx} className="flex items-center gap-0.5">
                            <span 
                              className="font-medium text-sm"
                              style={{ color: classColor }}
                            >
                              {name}
                            </span>
                            {idx < run.guildPlayerNames.length - 1 && (
                              <span className="text-muted-foreground">,</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                    
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-foreground">
                        completed <span className="font-medium">{run.dungeon}</span>
                      </span>
                      <Badge 
                        variant="outline" 
                        className="text-xs font-bold border-0"
                        style={{ 
                          color: keyColor,
                          backgroundColor: `${keyColor}15`
                        }}
                      >
                        +{run.mythicLevel}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-3 mt-2 text-xs">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {formatClearTime(run.clearTimeMs)}
                      </span>
                      <Badge 
                        variant="outline"
                        className={`text-xs border-0 ${
                          inTime 
                            ? "bg-green-500/15 text-green-400" 
                            : "bg-red-500/15 text-red-400"
                        }`}
                      >
                        {inTime ? "In Time" : "Depleted"}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(run.completedAt), { addSuffix: true })}
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </a>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
