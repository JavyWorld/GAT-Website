import { useQuery } from "@tanstack/react-query";
import { Trophy, Shield, Heart, Swords } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface RankingsData {
  globalRank: number | null;
  totalPlayers: number;
  roleRank: number | null;
  totalInRole: number;
  role: "tank" | "healer" | "dps";
  roleLabel: string;
  mythicScore: number;
}

interface GuildRankingsProps {
  playerId: string;
  variant?: "compact" | "full";
  className?: string;
}

const ROLE_ICONS = {
  tank: Shield,
  healer: Heart,
  dps: Swords,
};

const ROLE_COLORS = {
  tank: "#3B82F6",
  healer: "#22C55E",
  dps: "#EF4444",
};

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function getRankColor(rank: number, total: number): string {
  const percentile = (rank / total) * 100;
  if (percentile <= 5) return "#FFD700";
  if (percentile <= 15) return "#C0C0C0";
  if (percentile <= 30) return "#CD7F32";
  return "#9CA3AF";
}

export function GuildRankings({ playerId, variant = "compact", className = "" }: GuildRankingsProps) {
  const { data: rankings, isLoading } = useQuery<RankingsData>({
    queryKey: ["/api/players", playerId, "rankings"],
    enabled: !!playerId,
  });

  if (isLoading) {
    return (
      <div className={`flex gap-2 ${className}`}>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>
    );
  }

  if (!rankings || (rankings.globalRank === null && rankings.roleRank === null)) {
    return null;
  }

  const RoleIcon = ROLE_ICONS[rankings.role];
  const roleColor = ROLE_COLORS[rankings.role];
  const globalRankColor = rankings.globalRank ? getRankColor(rankings.globalRank, rankings.totalPlayers) : "#666";
  const roleRankColor = rankings.roleRank ? getRankColor(rankings.roleRank, rankings.totalInRole) : "#666";

  if (variant === "compact") {
    return (
      <div className={`flex flex-wrap gap-2 ${className}`}>
        {rankings.globalRank !== null && rankings.totalPlayers > 0 && (
          <Badge 
            variant="outline"
            className="gap-1.5"
            style={{ 
              borderColor: `${globalRankColor}60`,
              backgroundColor: `${globalRankColor}15`,
              color: globalRankColor
            }}
            data-testid="badge-global-rank"
          >
            <Trophy className="w-3.5 h-3.5" />
            <span className="font-mono font-bold">{getOrdinalSuffix(rankings.globalRank)}</span>
            <span className="text-muted-foreground font-normal">/ {rankings.totalPlayers}</span>
          </Badge>
        )}
        
        {rankings.roleRank !== null && rankings.totalInRole > 0 && (
          <Badge 
            variant="outline"
            className="gap-1.5"
            style={{ 
              borderColor: `${roleColor}60`,
              backgroundColor: `${roleColor}15`,
              color: roleColor
            }}
            data-testid="badge-role-rank"
          >
            <RoleIcon className="w-3.5 h-3.5" />
            <span className="font-mono font-bold">{getOrdinalSuffix(rankings.roleRank)}</span>
            <span className="text-muted-foreground font-normal">{rankings.roleLabel}</span>
          </Badge>
        )}
      </div>
    );
  }

  const hasGlobalRank = rankings.globalRank !== null && rankings.totalPlayers > 0;
  const hasRoleRank = rankings.roleRank !== null && rankings.totalInRole > 0;

  if (!hasGlobalRank && !hasRoleRank) {
    return null;
  }

  return (
    <div className={`grid grid-cols-2 gap-3 ${className}`}>
      {hasGlobalRank && (
        <div 
          className="text-center p-3 rounded-md"
          style={{ backgroundColor: `${globalRankColor}10` }}
          data-testid="card-global-rank"
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            <Trophy className="w-4 h-4" style={{ color: globalRankColor }} />
            <span className="text-xs text-muted-foreground">Guild Rank</span>
          </div>
          <p className="text-2xl font-mono font-bold" style={{ color: globalRankColor }}>
            {getOrdinalSuffix(rankings.globalRank!)}
          </p>
          <p className="text-xs text-muted-foreground">of {rankings.totalPlayers} players</p>
        </div>
      )}
      
      {hasRoleRank && (
        <div 
          className="text-center p-3 rounded-md"
          style={{ backgroundColor: `${roleColor}10` }}
          data-testid="card-role-rank"
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            <RoleIcon className="w-4 h-4" style={{ color: roleColor }} />
            <span className="text-xs text-muted-foreground">{rankings.roleLabel} Rank</span>
          </div>
          <p className="text-2xl font-mono font-bold" style={{ color: roleColor }}>
            {getOrdinalSuffix(rankings.roleRank!)}
          </p>
          <p className="text-xs text-muted-foreground">of {rankings.totalInRole} {rankings.roleLabel.toLowerCase()}s</p>
        </div>
      )}
    </div>
  );
}
