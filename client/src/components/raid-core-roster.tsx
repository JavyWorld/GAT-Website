import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Heart, Swords, Crown, Star } from "lucide-react";
import { Link } from "wouter";
import { WOW_CLASS_COLORS, PARSE_COLORS, type Player } from "@shared/schema";

interface CoreRaider {
  player: Player;
  primaryRole: "tank" | "healer" | "dps";
  primarySpec: string;
  parseCount: number;
  avgParse: number;
  bestParse: number;
}

interface RaidCoreData {
  tanks: CoreRaider[];
  healers: CoreRaider[];
  dps: CoreRaider[];
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

function getRoleIcon(role: "tank" | "healer" | "dps") {
  switch (role) {
    case "tank":
      return <Shield className="w-4 h-4" />;
    case "healer":
      return <Heart className="w-4 h-4" />;
    case "dps":
      return <Swords className="w-4 h-4" />;
  }
}

function getRoleColor(role: "tank" | "healer" | "dps") {
  switch (role) {
    case "tank":
      return "hsl(210, 90%, 55%)";
    case "healer":
      return "hsl(142, 70%, 50%)";
    case "dps":
      return "hsl(0, 70%, 55%)";
  }
}

interface RaiderCardProps {
  raider: CoreRaider;
  rank?: number;
}

function RaiderCard({ raider, rank }: RaiderCardProps) {
  const { player, primarySpec, parseCount, avgParse, bestParse } = raider;
  const classColor = WOW_CLASS_COLORS[player.class] || "#FFFFFF";
  const avgParseColor = getParseColor(avgParse);
  const bestParseColor = getParseColor(bestParse);
  
  return (
    <Link href={`/player/${player.id}`}>
      <div 
        className="group relative p-3 rounded-md bg-muted/30 border border-transparent hover-elevate active-elevate-2 cursor-pointer transition-all"
        style={{ borderColor: `${classColor}20` }}
        data-testid={`raider-card-${player.id}`}
      >
        {rank && rank <= 3 && (
          <div 
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ 
              background: rank === 1 ? "linear-gradient(135deg, #FFD700, #FFA500)" : 
                         rank === 2 ? "linear-gradient(135deg, #C0C0C0, #A0A0A0)" :
                         "linear-gradient(135deg, #CD7F32, #8B4513)",
              color: "#000"
            }}
          >
            {rank}
          </div>
        )}
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar 
              className="w-12 h-12 border-2"
              style={{ borderColor: classColor }}
            >
              <AvatarImage src={player.avatarUrl || undefined} alt={player.name} />
              <AvatarFallback 
                className="text-sm font-bold"
                style={{ backgroundColor: `${classColor}30`, color: classColor }}
              >
                {player.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div 
              className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-background border flex items-center justify-center"
              style={{ borderColor: classColor }}
            >
              <span className="text-[10px] font-bold" style={{ color: classColor }}>
                {parseCount}
              </span>
            </div>
          </div>
          
          <div className="flex-1 min-w-0">
            <p 
              className="font-semibold text-sm truncate"
              style={{ color: classColor }}
            >
              {player.name}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {primarySpec} {player.class}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <div 
                className="text-xs font-mono px-1.5 py-0.5 rounded"
                style={{ backgroundColor: `${avgParseColor}20`, color: avgParseColor }}
              >
                Avg: {avgParse}
              </div>
              <div 
                className="text-xs font-mono px-1.5 py-0.5 rounded"
                style={{ backgroundColor: `${bestParseColor}20`, color: bestParseColor }}
              >
                Best: {bestParse}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function RoleSection({ 
  title, 
  icon, 
  color, 
  raiders 
}: { 
  title: string; 
  icon: JSX.Element; 
  color: string; 
  raiders: CoreRaider[];
}) {
  if (raiders.length === 0) {
    return (
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-3">
          <div 
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: `${color}20`, color }}
          >
            {icon}
          </div>
          <h3 className="font-display text-sm tracking-wide" style={{ color }}>
            {title}
          </h3>
          <Badge variant="outline" className="text-xs">0</Badge>
        </div>
        <p className="text-sm text-muted-foreground text-center py-4">
          No raiders found with logs
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <div 
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {icon}
        </div>
        <h3 className="font-display text-sm tracking-wide" style={{ color }}>
          {title}
        </h3>
        <Badge variant="outline" className="text-xs">{raiders.length}</Badge>
      </div>
      <div className="space-y-2">
        {raiders.map((raider, index) => (
          <RaiderCard 
            key={raider.player.id} 
            raider={raider} 
            rank={index + 1}
          />
        ))}
      </div>
    </div>
  );
}

export function RaidCoreRoster() {
  const { data, isLoading, error } = useQuery<RaidCoreData>({
    queryKey: ["/api/raid-core"],
  });

  if (isLoading) {
    return (
      <Card className="border-card-border bg-card/80 backdrop-blur-sm" data-testid="raid-core-loading">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Skeleton className="w-5 h-5 rounded-full" />
            <Skeleton className="h-6 w-48" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-8 w-32" />
                {[1, 2, 3].map((j) => (
                  <Skeleton key={j} className="h-20 w-full" />
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return null;
  }

  const totalRaiders = data.tanks.length + data.healers.length + data.dps.length;
  
  if (totalRaiders === 0) {
    return (
      <Card 
        className="border-card-border bg-card/80 backdrop-blur-sm" 
        data-testid="raid-core-empty"
      >
        <CardHeader className="pb-4">
          <CardTitle className="font-display text-lg tracking-wide flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" />
            <span className="text-foreground">Raid Core Roster</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No Core Raiders Found</p>
            <p className="text-sm mt-1">
              Sync Warcraft Logs data in the Admin panel to populate the raid core
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      className="border-card-border bg-card/80 backdrop-blur-sm overflow-hidden" 
      data-testid="raid-core-roster"
    >
      <div 
        className="h-1 w-full"
        style={{
          background: "linear-gradient(90deg, hsl(210, 90%, 55%), hsl(142, 70%, 50%), hsl(0, 70%, 55%))"
        }}
      />
      <CardHeader className="pb-4">
        <CardTitle className="font-display text-lg tracking-wide flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" />
            <span 
              className="text-foreground"
              style={{ textShadow: "0 0 20px hsl(43, 85%, 55%, 0.3)" }}
            >
              Raid Core Roster
            </span>
          </div>
          <Badge 
            variant="outline" 
            className="border-amber-500/40 text-amber-500"
          >
            {totalRaiders} Raiders
          </Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Top raiders based on raid log participation
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <RoleSection 
            title="Tanks" 
            icon={<Shield className="w-4 h-4" />}
            color={getRoleColor("tank")}
            raiders={data.tanks}
          />
          <RoleSection 
            title="Healers" 
            icon={<Heart className="w-4 h-4" />}
            color={getRoleColor("healer")}
            raiders={data.healers}
          />
          <RoleSection 
            title="DPS" 
            icon={<Swords className="w-4 h-4" />}
            color={getRoleColor("dps")}
            raiders={data.dps}
          />
        </div>
      </CardContent>
    </Card>
  );
}
