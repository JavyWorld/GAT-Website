import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  ArrowLeft, 
  Sword, 
  Shield, 
  Heart,
  Calendar,
  MessageSquare,
  ExternalLink,
  Trophy,
  Timer,
  Target,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Crown
} from "lucide-react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { WOW_CLASS_COLORS, PARSE_COLORS, GUILD_RANK_COLORS, type Player, type RaidParse, type MythicRun, type CoreMember } from "@shared/schema";
import { GuildRankings } from "@/components/guild-rankings";

interface PlayerProfileCardProps {
  player: Player;
  parses?: RaidParse[];
  mythicRuns?: MythicRun[];
}

function getScoreColor(score: number): string {
  if (score >= 3000) return "#E268A8";
  if (score >= 2500) return "#FF8000";
  if (score >= 2000) return "#A335EE";
  if (score >= 1500) return "#0070FF";
  if (score >= 1000) return "#1EFF00";
  return "#666666";
}

function getParseColor(percent: number): string {
  if (percent >= 99) return PARSE_COLORS.gold;
  if (percent >= 95) return PARSE_COLORS.pink;
  if (percent >= 75) return PARSE_COLORS.orange;
  if (percent >= 50) return PARSE_COLORS.purple;
  if (percent >= 25) return PARSE_COLORS.blue;
  if (percent > 0) return PARSE_COLORS.green;
  return PARSE_COLORS.gray;
}

function getKeyLevelColor(level: number): string {
  if (level >= 15) return "#A335EE";
  if (level >= 10) return "#FF8000";
  if (level >= 7) return "#0070FF";
  return "#666666";
}

const ROLE_ICONS = {
  tank: Shield,
  healer: Heart,
  dps: Sword,
};

const ROLE_COLORS = {
  tank: "#3B82F6",
  healer: "#22C55E", 
  dps: "#EF4444",
};

function formatRunTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  return `${minutes}m ${secs}s`;
}

function formatRunDate(timestamp: Date | string | null): string {
  if (!timestamp) return "Unknown";
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTimerMargin(
  clearTimeMs: number | null, 
  parTimeMs: number | null,
  completionTime?: number,
  timerPercent?: number
): { text: string; isPositive: boolean } {
  let actualClearMs = clearTimeMs;
  let actualParMs = parTimeMs;
  
  if ((!actualClearMs || !actualParMs) && completionTime && timerPercent) {
    actualClearMs = completionTime;
    actualParMs = Math.round(completionTime / (timerPercent / 100));
  }
  
  if (!actualClearMs || !actualParMs) {
    return { text: "--:--", isPositive: true };
  }
  
  const marginMs = actualParMs - actualClearMs;
  const isPositive = marginMs >= 0;
  const absMarginMs = Math.abs(marginMs);
  
  const totalSeconds = Math.floor(absMarginMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  const prefix = isPositive ? "+" : "-";
  const text = `${prefix}${minutes}:${seconds.toString().padStart(2, "0")}`;
  
  return { text, isPositive };
}

function getRoleIcon(spec?: string) {
  if (!spec) return <Sword className="w-4 h-4" />;
  const lowerSpec = spec.toLowerCase();
  if (lowerSpec.includes("heal") || lowerSpec.includes("restoration") || lowerSpec.includes("holy") || lowerSpec.includes("discipline") || lowerSpec.includes("mistweaver") || lowerSpec.includes("preservation")) {
    return <Heart className="w-4 h-4 text-green-400" />;
  }
  if (lowerSpec.includes("tank") || lowerSpec.includes("protection") || lowerSpec.includes("guardian") || lowerSpec.includes("blood") || lowerSpec.includes("vengeance") || lowerSpec.includes("brewmaster")) {
    return <Shield className="w-4 h-4 text-blue-400" />;
  }
  return <Sword className="w-4 h-4 text-red-400" />;
}

function formatRelativeTime(date: Date | string | null): string {
  if (!date) return "Never synced";
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function PlayerProfileCard({ player, parses = [], mythicRuns = [] }: PlayerProfileCardProps) {
  const [selectedRun, setSelectedRun] = useState<MythicRun | null>(null);
  const { toast } = useToast();
  const classColor = WOW_CLASS_COLORS[player.class] || "#FFFFFF";
  const scoreColor = getScoreColor(player.mythicScore || 0);
  const bestParses = parses.slice(0, 6);
  const recentRuns = mythicRuns.slice(0, 5);

  const { data: coreMembers } = useQuery<CoreMember[]>({
    queryKey: ["/api/core-members"],
  });

  const isCoreMember = coreMembers?.some(m => m.playerId === player.id && m.isVisible);

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/sync/player/${player.id}/deep`);
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/players", player.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/players", player.id, "mythic-runs"] });
      const runsFound = (data as { runsFound?: number })?.runsFound || 0;
      const newRuns = (data as { newRuns?: number })?.newRuns || 0;
      toast({
        title: "Sync complete",
        description: runsFound > 0 
          ? `Found ${runsFound} runs, ${newRuns} new`
          : "Player data updated from Raider.IO",
      });
    },
    onError: (error: Error) => {
      const message = error.message || "Could not sync player data from Raider.IO";
      const isNotFound = message.includes("not found on Raider.IO");
      toast({
        title: isNotFound ? "Player not found" : "Sync failed",
        description: isNotFound 
          ? "This character doesn't exist on Raider.IO yet"
          : message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6" data-testid="player-profile">
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="icon" 
          data-testid="button-back"
          onClick={() => window.history.back()}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 
          className="font-display text-2xl tracking-wide"
          style={{ textShadow: `0 0 30px ${classColor}50` }}
        >
          Player Profile
        </h1>
      </div>

      <Card 
        className="border-card-border bg-card/80 backdrop-blur-sm overflow-hidden"
        data-testid="player-header-card"
      >
        <div 
          className="h-32 relative"
          style={{ 
            background: `linear-gradient(135deg, ${classColor}30 0%, ${classColor}05 100%)`,
            borderBottom: `2px solid ${classColor}40`
          }}
        >
          <div 
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `radial-gradient(circle at 30% 50%, ${classColor}40 0%, transparent 50%)`
            }}
          />
          <div className="absolute top-3 right-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(player.lastRioSync)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              data-testid="button-sync-player"
              className="bg-background/50 backdrop-blur-sm"
            >
              <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
        
        <CardContent className="relative pt-0 -mt-12">
          <div className="flex flex-col md:flex-row items-start gap-6">
            <div className="relative">
              <Avatar 
                className="w-24 h-24 ring-4 ring-background"
                style={{ boxShadow: `0 0 30px ${classColor}40` }}
              >
                {player.avatarUrl && (
                  <AvatarImage src={player.avatarUrl} alt={player.name} />
                )}
                <AvatarFallback 
                  style={{ 
                    backgroundColor: `${classColor}30`,
                    color: classColor 
                  }}
                  className="text-2xl font-bold"
                >
                  {player.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>

            <div className="flex-1 min-w-0 pt-4 md:pt-8">
              <div className="flex flex-wrap items-center gap-3">
                <h2 
                  className="text-2xl font-display font-semibold"
                  style={{ color: classColor }}
                >
                  {player.name}
                </h2>
                {isCoreMember && (
                  <Badge 
                    className="bg-amber-500/20 text-amber-400 border-amber-500/40"
                    data-testid="badge-core-member"
                  >
                    <Crown className="w-3 h-3 mr-1" />
                    CORE
                  </Badge>
                )}
                <Badge 
                  variant="outline"
                  style={{ 
                    borderColor: `${classColor}40`,
                    color: classColor,
                    backgroundColor: `${classColor}10`
                  }}
                >
                  {getRoleIcon(player.spec || "")}
                  <span className="ml-1">{player.spec || player.class}</span>
                </Badge>
                <Badge 
                  variant="outline"
                  style={{ 
                    borderColor: `${GUILD_RANK_COLORS[player.guildRank || ""] || "#666666"}60`,
                    backgroundColor: `${GUILD_RANK_COLORS[player.guildRank || ""] || "#666666"}15`,
                    color: GUILD_RANK_COLORS[player.guildRank || ""] || "#666666"
                  }}
                >
                  {player.guildRank}
                </Badge>
              </div>
              
              <p className="text-muted-foreground mt-1">
                {player.realm} - {player.race || "Unknown Race"}
              </p>

              <GuildRankings playerId={player.id} className="mt-4" />

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
                <div className="text-center p-3 rounded-md bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-1">Item Level</p>
                  <p className="text-xl font-mono font-bold text-accent">{player.itemLevel}</p>
                </div>
                <div className="text-center p-3 rounded-md bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-1">M+ Score</p>
                  <p className="text-xl font-mono font-bold" style={{ color: scoreColor }}>
                    {player.mythicScore?.toLocaleString() || 0}
                  </p>
                </div>
                <div className="text-center p-3 rounded-md bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                    <MessageSquare className="w-3 h-3" /> Messages
                  </p>
                  <p className="text-xl font-mono font-bold text-foreground">{player.messagesCount || 0}</p>
                </div>
              </div>

              {(player.totalRunsTracked ?? 0) > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                  <div className="text-center p-2 rounded-md bg-muted/20">
                    <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                      <Trophy className="w-3 h-3" />
                    </p>
                    <p className="text-sm font-mono font-bold text-accent">{player.totalRunsTracked}</p>
                    <p className="text-xs text-muted-foreground">M+ Tracked</p>
                  </div>
                  <div className="text-center p-2 rounded-md bg-muted/20">
                    <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                      <Timer className="w-3 h-3" />
                    </p>
                    <p className="text-sm font-mono font-bold text-green-400">{player.runsInTime || 0}</p>
                    <p className="text-xs text-muted-foreground">In Time</p>
                  </div>
                  <div className="text-center p-2 rounded-md bg-muted/20">
                    <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                      <Target className="w-3 h-3" />
                    </p>
                    <p className="text-sm font-mono font-bold text-red-400">{player.runsOverTime || 0}</p>
                    <p className="text-xs text-muted-foreground">Over Time</p>
                  </div>
                  {player.mostPlayedDungeon && (
                    <div className="text-center p-2 rounded-md bg-muted/20">
                      <p className="text-xs text-muted-foreground mb-1">Favorite</p>
                      <p className="text-xs font-mono font-bold text-accent truncate">{player.mostPlayedDungeon}</p>
                      <p className="text-xs text-muted-foreground">Dungeon</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4 md:pt-8">
              <a 
                href={`https://raider.io/characters/us/${encodeURIComponent(player.realm.toLowerCase().replace(/['\s]/g, "-"))}/${encodeURIComponent(player.name)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm" data-testid="button-raider-io">
                  <ExternalLink className="w-4 h-4 mr-1" />
                  Raider.IO
                </Button>
              </a>
              <a 
                href={`https://www.warcraftlogs.com/character/us/${encodeURIComponent(player.realm.toLowerCase().replace(/['\s]/g, ""))}/${encodeURIComponent(player.name)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm" data-testid="button-warcraftlogs">
                  <ExternalLink className="w-4 h-4 mr-1" />
                  WLogs
                </Button>
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-card-border bg-card/80 backdrop-blur-sm" data-testid="parses-card">
          <CardContent className="pt-6">
            <h3 className="font-display text-lg mb-4 flex items-center gap-2">
              <Sword className="w-5 h-5 text-red-400" />
              Raid Parses
            </h3>
            
            {bestParses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">No raid parses available</p>
              </div>
            ) : (
              <div className="space-y-3">
                {bestParses.map((parse) => {
                  const parseColor = getParseColor(parse.parsePercent);
                  return (
                    <div key={parse.id} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium truncate">{parse.bossName}</span>
                          <Badge variant="outline" className="text-xs">{parse.difficulty}</Badge>
                        </div>
                        <Progress 
                          value={parse.parsePercent} 
                          className="h-2"
                          style={{ 
                            background: `${parseColor}20`,
                          }}
                        />
                      </div>
                      <span 
                        className="font-mono font-bold text-lg w-14 text-right"
                        style={{ color: parseColor }}
                      >
                        {parse.parsePercent}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-card-border bg-card/80 backdrop-blur-sm" data-testid="mythic-runs-card">
          <CardContent className="pt-6">
            <h3 className="font-display text-lg mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Recent M+ Runs
            </h3>
            
            {recentRuns.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">No M+ runs recorded</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentRuns.map((run) => {
                  const keyColor = getKeyLevelColor(run.keyLevel);
                  const isInTime = run.timerPercent >= 100;
                  const role = run.role as keyof typeof ROLE_ICONS | undefined;
                  const RoleIcon = role ? ROLE_ICONS[role] : null;
                  const roleColor = role ? ROLE_COLORS[role] : "#666";
                  
                  return (
                    <div 
                      key={run.id} 
                      className="flex items-center justify-between p-3 rounded-md bg-muted/30 hover-elevate cursor-pointer"
                      onClick={() => setSelectedRun(run)}
                      data-testid={`run-item-${run.id}`}
                    >
                      {RoleIcon && (
                        <div 
                          className="w-8 h-8 rounded-full flex items-center justify-center mr-3 flex-shrink-0"
                          style={{ backgroundColor: `${roleColor}20` }}
                        >
                          <RoleIcon className="w-4 h-4" style={{ color: roleColor }} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{run.dungeon}</p>
                          {isInTime ? (
                            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#1EFF00" }} />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#FF4444" }} />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          {run.spec && (
                            <>
                              <span>{run.spec}</span>
                              <span>-</span>
                            </>
                          )}
                          <span style={{ color: isInTime ? "#1EFF00" : "#FF4444" }}>
                            {isInTime ? "In Time" : "Depleted"}
                          </span>
                          <span>-</span>
                          <Clock className="w-3 h-3" />
                          <span>{formatRunTime(run.completionTime)}</span>
                          <span>-</span>
                          <span>{formatRunDate(run.timestamp)}</span>
                        </div>
                      </div>
                      <Badge 
                        variant="outline"
                        style={{ 
                          borderColor: `${keyColor}60`,
                          backgroundColor: `${keyColor}20`,
                          color: keyColor
                        }}
                        className="font-bold"
                      >
                        +{run.keyLevel}
                      </Badge>
                      <span className="font-mono text-sm ml-2" style={{ color: getScoreColor(run.score) }}>
                        +{run.score}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedRun} onOpenChange={(open) => !open && setSelectedRun(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              M+ Run Details
            </DialogTitle>
          </DialogHeader>
          
          {selectedRun && (() => {
            const role = selectedRun.role as keyof typeof ROLE_ICONS | undefined;
            const RoleIcon = role ? ROLE_ICONS[role] : null;
            const roleColor = role ? ROLE_COLORS[role] : "#666";
            const roleLabel = role === "tank" ? "Tank" : role === "healer" ? "Healer" : "DPS";
            
            return (
            <div className="space-y-4">
              <div className="text-center p-4 rounded-md bg-muted/30">
                <h3 className="text-xl font-bold mb-2">{selectedRun.dungeon}</h3>
                <div className="flex items-center justify-center gap-2">
                  <Badge 
                    variant="outline"
                    style={{ 
                      borderColor: `${getKeyLevelColor(selectedRun.keyLevel)}60`,
                      backgroundColor: `${getKeyLevelColor(selectedRun.keyLevel)}20`,
                      color: getKeyLevelColor(selectedRun.keyLevel)
                    }}
                    className="font-bold text-lg px-3 py-1"
                  >
                    +{selectedRun.keyLevel}
                  </Badge>
                  {RoleIcon && (
                    <Badge 
                      variant="outline"
                      style={{ 
                        borderColor: `${roleColor}60`,
                        backgroundColor: `${roleColor}20`,
                        color: roleColor
                      }}
                      className="gap-1"
                    >
                      <RoleIcon className="w-4 h-4" />
                      {roleLabel}
                    </Badge>
                  )}
                </div>
                {selectedRun.spec && (
                  <p className="text-sm text-muted-foreground mt-2">{selectedRun.spec}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-md bg-muted/30 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <div className="flex items-center justify-center gap-1">
                    {selectedRun.timerPercent >= 100 ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" style={{ color: "#1EFF00" }} />
                        <span className="font-medium" style={{ color: "#1EFF00" }}>In Time</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4" style={{ color: "#FF4444" }} />
                        <span className="font-medium" style={{ color: "#FF4444" }}>Depleted</span>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="p-3 rounded-md bg-muted/30 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Time</p>
                  <p className="font-mono font-bold">{formatRunTime(selectedRun.completionTime)}</p>
                </div>
                
                <div className="p-3 rounded-md bg-muted/30 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Score</p>
                  <p className="font-mono font-bold" style={{ color: getScoreColor(selectedRun.score) }}>
                    +{selectedRun.score}
                  </p>
                </div>
                
                <div className="p-3 rounded-md bg-muted/30 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Margin</p>
                  {(() => {
                    const margin = formatTimerMargin(
                      selectedRun.clearTimeMs, 
                      selectedRun.parTimeMs,
                      selectedRun.completionTime,
                      selectedRun.timerPercent
                    );
                    return (
                      <p 
                        className="font-mono font-bold"
                        style={{ color: margin.isPositive ? "#1EFF00" : "#FF4444" }}
                      >
                        {margin.text}
                      </p>
                    );
                  })()}
                </div>
              </div>

              <div className="p-3 rounded-md bg-muted/30">
                <p className="text-xs text-muted-foreground mb-2">Affixes</p>
                <div className="flex flex-wrap gap-1">
                  {selectedRun.affixes && selectedRun.affixes.length > 0 ? (
                    selectedRun.affixes.map((affix, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {affix}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">No affixes data</span>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-md bg-muted/30">
                <p className="text-xs text-muted-foreground mb-1">Completed</p>
                <p className="text-sm">
                  {selectedRun.timestamp 
                    ? new Date(selectedRun.timestamp).toLocaleDateString("en-US", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })
                    : "Unknown"
                  }
                </p>
              </div>

              {selectedRun.url && (
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => window.open(selectedRun.url!, "_blank")}
                  data-testid="button-view-on-rio"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View on Raider.IO
                </Button>
              )}
            </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
