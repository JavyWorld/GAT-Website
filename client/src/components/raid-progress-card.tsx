import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skull, CheckCircle2 } from "lucide-react";

interface Boss {
  name: string;
  killed: boolean;
  difficulty: "LFR" | "Normal" | "Heroic" | "Mythic";
  killCount?: number;
}

interface RaidProgressCardProps {
  raidName: string;
  bosses: Boss[];
  totalBosses: number;
  difficulty?: "LFR" | "Normal" | "Heroic" | "Mythic";
}

function getDifficultyColor(difficulty: string): string {
  switch (difficulty) {
    case "Mythic":
      return "#FF8000";
    case "Heroic":
      return "#A335EE";
    case "Normal":
      return "#1EFF00";
    case "LFR":
      return "#0070FF";
    default:
      return "#666666";
  }
}

export function RaidProgressCard({ raidName, bosses, totalBosses, difficulty }: RaidProgressCardProps) {
  const killedBosses = bosses.filter((b) => b.killed).length;
  const progressPercent = (killedBosses / totalBosses) * 100;
  const highestDifficulty = difficulty || bosses.find((b) => b.killed)?.difficulty || "Normal";
  const difficultyColor = getDifficultyColor(highestDifficulty);

  return (
    <Card className="border-card-border bg-card/80 backdrop-blur-sm" data-testid="raid-progress-card">
      <CardHeader className="pb-4">
        <CardTitle className="font-display text-lg tracking-wide flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Skull className="w-5 h-5" style={{ color: difficultyColor }} />
            <span 
              className="text-foreground"
              style={{ textShadow: `0 0 20px ${difficultyColor}30` }}
            >
              {raidName}
            </span>
          </div>
          <Badge 
            variant="outline" 
            style={{ 
              borderColor: `${difficultyColor}40`,
              color: difficultyColor 
            }}
          >
            {killedBosses}/{totalBosses} {highestDifficulty}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Raid Progress</span>
            <span className="text-sm font-mono" style={{ color: difficultyColor }}>
              {progressPercent.toFixed(0)}%
            </span>
          </div>
          <Progress 
            value={progressPercent} 
            className="h-2"
            style={{ background: `${difficultyColor}20` }}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {bosses.map((boss) => (
            <div
              key={boss.name}
              className={`p-3 rounded-md text-center transition-all ${
                boss.killed 
                  ? "bg-muted/50 border border-border" 
                  : "bg-muted/20 border border-transparent opacity-60"
              }`}
              data-testid={`boss-${boss.name.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <div className="flex justify-center mb-2">
                {boss.killed ? (
                  <CheckCircle2 
                    className="w-6 h-6" 
                    style={{ color: getDifficultyColor(boss.difficulty) }} 
                  />
                ) : (
                  <Skull className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
              <p className="text-xs font-medium truncate">{boss.name}</p>
              {boss.killCount !== undefined && boss.killCount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {boss.killCount} kills
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
