import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Award, Shield, Heart, Swords } from "lucide-react";
import { WOW_CLASS_COLORS, type Player } from "@shared/schema";
import { useIsMobile } from "@/hooks/use-mobile";

const TANK_SPECS = ["Protection", "Blood", "Guardian", "Brewmaster", "Vengeance"];
const HEALER_SPECS = ["Restoration", "Holy", "Discipline", "Mistweaver", "Preservation"];

function getRole(spec: string | null): "Tank" | "Healer" | "DPS" {
  if (!spec) return "DPS";
  if (TANK_SPECS.includes(spec)) return "Tank";
  if (HEALER_SPECS.includes(spec)) return "Healer";
  return "DPS";
}

function getRoleIcon(role: "Tank" | "Healer" | "DPS") {
  switch (role) {
    case "Tank":
      return <Shield className="w-3 h-3 text-blue-400" />;
    case "Healer":
      return <Heart className="w-3 h-3 text-green-400" />;
    default:
      return <Swords className="w-3 h-3 text-red-400" />;
  }
}

interface LeaderboardCardProps {
  players: Player[];
  title?: string;
  showPodium?: boolean;
}

function getScoreColor(score: number | null): string {
  const value = score ?? 0;

  if (value >= 3000) return "#E268A8";
  if (value >= 2500) return "#FF8000";
  if (value >= 2000) return "#A335EE";
  if (value >= 1500) return "#0070FF";
  if (value >= 1000) return "#1EFF00";
  return "#666666";
}

function getRankIcon(rank: number) {
  switch (rank) {
    case 1:
      return <Trophy className="w-5 h-5 text-yellow-400" />;
    case 2:
      return <Medal className="w-5 h-5 text-gray-300" />;
    case 3:
      return <Award className="w-5 h-5 text-amber-600" />;
    default:
      return <span className="text-sm font-mono text-muted-foreground w-5 text-center">#{rank}</span>;
  }
}

function getRankBg(rank: number): string {
  switch (rank) {
    case 1:
      return "bg-gradient-to-r from-yellow-500/20 to-transparent";
    case 2:
      return "bg-gradient-to-r from-gray-400/20 to-transparent";
    case 3:
      return "bg-gradient-to-r from-amber-600/20 to-transparent";
    default:
      return "";
  }
}

export function LeaderboardCard({ players, title = "M+ Leaderboard", showPodium = true }: LeaderboardCardProps) {
  const isMobile = useIsMobile();
  const sortedPlayers = [...players].sort((a, b) => (b.mythicScore ?? 0) - (a.mythicScore ?? 0));
  const topThree = sortedPlayers.slice(0, 3);
  const topTen = sortedPlayers.slice(0, 10);
  const rest = sortedPlayers.slice(3, 10);
  const shouldShowPodium = showPodium && !isMobile;

  return (
    <Card className="border-card-border bg-card/80 backdrop-blur-sm h-full flex flex-col" data-testid="leaderboard-card">
      <CardHeader className="pb-4">
        <CardTitle className="font-display text-lg tracking-wide flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-400" />
          <span 
            className="text-foreground"
            style={{ textShadow: "0 0 20px hsl(43, 85%, 55%, 0.3)" }}
          >
            {title}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {shouldShowPodium && topThree.length > 0 && (
          <div className="flex items-end justify-center gap-4 mb-6 px-4 hidden md:flex">
            {[1, 0, 2].map((podiumIndex) => {
              const player = topThree[podiumIndex];
              if (!player) return <div key={podiumIndex} className="w-24" />;
              
              const classColor = WOW_CLASS_COLORS[player.class] || "#FFFFFF";
              const scoreColor = getScoreColor(player.mythicScore);
              const rank = podiumIndex === 0 ? 1 : podiumIndex === 1 ? 2 : 3;
              const heights = { 1: "h-28", 2: "h-20", 3: "h-16" };
              
              return (
                <Link key={player.id} href={`/player/${player.id}`}>
                  <div 
                    className="flex flex-col items-center cursor-pointer group"
                    data-testid={`podium-${rank}`}
                  >
                    <div className="relative mb-2">
                      <Avatar className="w-14 h-14 ring-2 ring-offset-2 ring-offset-background transition-transform group-hover:scale-110"
                        style={{ boxShadow: `0 0 0 2px ${classColor}` }}
                      >
                        {player.avatarUrl ? (
                          <AvatarImage src={player.avatarUrl} alt={player.name} />
                        ) : null}
                        <AvatarFallback 
                          style={{ 
                            backgroundColor: `${classColor}30`,
                            color: classColor 
                          }}
                          className="font-medium"
                        >
                          {player.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div 
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ 
                          backgroundColor: rank === 1 ? "#FFD700" : rank === 2 ? "#C0C0C0" : "#CD7F32",
                          color: "#000"
                        }}
                      >
                        {rank}
                      </div>
                    </div>
                    
                    <span 
                      className="text-sm font-medium truncate max-w-[80px]"
                      style={{ color: classColor }}
                    >
                      {player.name}
                    </span>
                    
                    <span 
                      className="text-lg font-mono font-bold"
                      style={{ color: scoreColor }}
                    >
                      {(player.mythicScore ?? 0).toLocaleString()}
                    </span>
                    
                    <div 
                      className={`${heights[rank as 1 | 2 | 3]} w-20 mt-2 rounded-t-md`}
                      style={{ 
                        background: `linear-gradient(180deg, ${classColor}40 0%, ${classColor}10 100%)`,
                        borderTop: `3px solid ${classColor}`
                      }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <div className="flex-1 flex flex-col justify-between">
          {(shouldShowPodium ? rest : topTen).map((player, index) => {
            const rank = shouldShowPodium ? index + 4 : index + 1;
            const classColor = WOW_CLASS_COLORS[player.class] || "#FFFFFF";
            const scoreColor = getScoreColor(player.mythicScore);
            const isTopThree = rank <= 3;
            
            return (
              <Link key={player.id} href={`/player/${player.id}`}>
                <div 
                  className={`flex items-center gap-3 rounded-md hover-elevate cursor-pointer ${getRankBg(rank)} ${isTopThree ? 'p-3' : 'p-2'}`}
                  data-testid={`leaderboard-row-${rank}`}
                >
                  <div className="w-6 flex justify-center">
                    {getRankIcon(rank)}
                  </div>
                  
                  <Avatar className={isTopThree ? "w-9 h-9" : "w-7 h-7"}>
                    {player.avatarUrl ? (
                      <AvatarImage src={player.avatarUrl} alt={player.name} />
                    ) : null}
                    <AvatarFallback 
                      style={{ 
                        backgroundColor: `${classColor}20`,
                        color: classColor 
                      }}
                      className="text-xs font-medium"
                    >
                      {player.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <span 
                      className={`font-medium ${isTopThree ? 'text-base' : 'text-sm'}`}
                      style={{ color: classColor }}
                    >
                      {player.name}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    {getRoleIcon(getRole(player.spec))}
                    <Badge 
                      variant="outline"
                      className="text-xs"
                      style={{ 
                        borderColor: `${classColor}40`,
                        color: classColor,
                        backgroundColor: `${classColor}10`
                      }}
                    >
                      {player.spec || player.class}
                    </Badge>
                  </div>
                  
                  <span 
                    className={`font-mono font-semibold ${isTopThree ? 'text-base' : 'text-sm'}`}
                    style={{ color: scoreColor }}
                  >
                    {(player.mythicScore ?? 0).toLocaleString()}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
