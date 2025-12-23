import { useState, useLayoutEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, ChevronUp, ChevronDown, Filter, Trash2, Eye, EyeOff, Shield, Heart, Swords, SlidersHorizontal } from "lucide-react";
import { WOW_CLASSES, WOW_CLASS_COLORS, GUILD_RANK_COLORS, type Player } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile, useIsMobileResolved } from "@/hooks/use-mobile";

interface PlayerTableProps {
  players: Player[];
  showFilters?: boolean;
  showInactiveToggle?: boolean;
  showDeleteControls?: boolean;
}

type SortField = "name" | "class" | "mythicScore" | "itemLevel" | "guildRank";
type SortDirection = "asc" | "desc";

export function PlayerTable({ 
  players, 
  showFilters = true, 
  showInactiveToggle = true,
  showDeleteControls = true 
}: PlayerTableProps) {
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [rankFilter, setRankFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("mythicScore");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [showInactive, setShowInactive] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(true);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { isResolved } = useIsMobileResolved();

  // On mobile, default filters to closed; on desktop, open
  useLayoutEffect(() => {
    if (isResolved) {
      setFiltersOpen(!isMobile);
    }
  }, [isMobile, isResolved]);

  const getPlayerRole = (spec: string | null): string => {
    if (!spec) return "DPS";
    const specLower = spec.toLowerCase();
    if (["protection", "guardian", "brewmaster", "blood", "vengeance"].includes(specLower)) {
      return "Tank";
    }
    if (["holy", "restoration", "discipline", "mistweaver", "preservation"].includes(specLower)) {
      return "Healer";
    }
    return "DPS";
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "Tank":
        return <Shield className="w-4 h-4 text-blue-400" />;
      case "Healer":
        return <Heart className="w-4 h-4 text-green-400" />;
      default:
        return <Swords className="w-4 h-4 text-red-400" />;
    }
  };

  const { data: guildRanks = [] } = useQuery<string[]>({
    queryKey: ["/api/guild-ranks"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiRequest("POST", "/api/players/bulk-delete", { ids });
      return response.json() as Promise<{ deleted: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      setSelectedIds(new Set());
      toast({
        title: "Players deleted",
        description: `Successfully deleted ${data.deleted} players`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete players",
        variant: "destructive",
      });
    },
  });

  const activePlayers = players.filter(p => p.isActive);
  const inactivePlayers = players.filter(p => !p.isActive);
  
  // When showInactive is on, apply statusFilter; otherwise only show active
  const displayPlayers = showInactive
    ? statusFilter === "active" 
      ? activePlayers 
      : statusFilter === "inactive" 
        ? inactivePlayers 
        : players
    : activePlayers;

  const filteredPlayers = displayPlayers
    .filter((player) => {
      if (search && !player.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (classFilter !== "all" && player.class !== classFilter) return false;
      if (rankFilter !== "all" && player.guildRank !== rankFilter) return false;
      if (roleFilter !== "all" && getPlayerRole(player.spec) !== roleFilter) return false;
      return true;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "class":
          comparison = a.class.localeCompare(b.class);
          break;
        case "mythicScore":
          comparison = (a.mythicScore || 0) - (b.mythicScore || 0);
          break;
        case "itemLevel":
          comparison = (a.itemLevel || 0) - (b.itemLevel || 0);
          break;
        case "guildRank":
          comparison = guildRanks.indexOf(a.guildRank || "") - guildRanks.indexOf(b.guildRank || "");
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? (
      <ChevronUp className="w-3 h-3" />
    ) : (
      <ChevronDown className="w-3 h-3" />
    );
  };

  function getScoreColor(score: number): string {
    if (score >= 3000) return "#E268A8";
    if (score >= 2500) return "#FF8000";
    if (score >= 2000) return "#A335EE";
    if (score >= 1500) return "#0070FF";
    if (score >= 1000) return "#1EFF00";
    return "#666666";
  }

  const toggleSelectPlayer = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredPlayers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPlayers.map(p => p.id)));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    deleteMutation.mutate(Array.from(selectedIds));
  };

  // Show a minimal loading state until isMobile is resolved to prevent layout flash
  if (!isResolved) {
    return (
      <Card className="border-card-border bg-card/80 backdrop-blur-sm" data-testid="player-table">
        <CardHeader className="pb-4">
          <CardTitle className="font-display text-lg tracking-wide">
            <span 
              className="text-foreground"
              style={{ textShadow: "0 0 20px hsl(210, 90%, 55%, 0.3)" }}
            >
              Guild Roster
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

  return (
    <Card className="border-card-border bg-card/80 backdrop-blur-sm" data-testid="player-table">
      {showFilters && (
        <CardHeader className="pb-4">
          <CardTitle className="font-display text-lg tracking-wide mb-4">
            <span 
              className="text-foreground"
              style={{ textShadow: "0 0 20px hsl(210, 90%, 55%, 0.3)" }}
            >
              Guild Roster
            </span>
          </CardTitle>
          
          {isMobile ? (
            <div className="space-y-3">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search players..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-players"
                />
              </div>
              <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between" data-testid="button-toggle-filters">
                    <span className="flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4" />
                      Filters & Sort
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  <Select value={classFilter} onValueChange={setClassFilter}>
                    <SelectTrigger className="w-full" data-testid="select-class-filter">
                      <Filter className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Class" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Classes</SelectItem>
                      {WOW_CLASSES.map((cls) => (
                        <SelectItem key={cls} value={cls}>
                          <span style={{ color: WOW_CLASS_COLORS[cls] }}>{cls}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={rankFilter} onValueChange={setRankFilter}>
                    <SelectTrigger className="w-full" data-testid="select-rank-filter">
                      <SelectValue placeholder="Rank" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Ranks</SelectItem>
                      {guildRanks.map((rank) => (
                        <SelectItem key={rank} value={rank}>{rank}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="w-full" data-testid="select-role-filter">
                      <Filter className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="DPS">DPS</SelectItem>
                      <SelectItem value="Tank">Tank</SelectItem>
                      <SelectItem value="Healer">Healer</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
                    <SelectTrigger className="w-full" data-testid="select-sort-field">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mythicScore">M+ Score</SelectItem>
                      <SelectItem value="itemLevel">Item Level</SelectItem>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="class">Class</SelectItem>
                      <SelectItem value="guildRank">Rank</SelectItem>
                    </SelectContent>
                  </Select>

                  {showInactiveToggle && inactivePlayers.length > 0 && (
                    <div className="flex items-center gap-2 pt-2">
                      <Switch
                        id="show-inactive-mobile"
                        checked={showInactive}
                        onCheckedChange={(checked) => {
                          setShowInactive(checked);
                          if (!checked) setStatusFilter("all");
                        }}
                        data-testid="switch-show-inactive"
                      />
                      <Label htmlFor="show-inactive-mobile" className="text-sm text-muted-foreground flex items-center gap-1">
                        {showInactive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        <span>Show Inactive ({inactivePlayers.length})</span>
                      </Label>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search players..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-players"
                />
              </div>
              
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="w-[160px]" data-testid="select-class-filter">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {WOW_CLASSES.map((cls) => (
                    <SelectItem key={cls} value={cls}>
                      <span style={{ color: WOW_CLASS_COLORS[cls] }}>{cls}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={rankFilter} onValueChange={setRankFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-rank-filter">
                  <SelectValue placeholder="Rank" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Ranks</SelectItem>
                  {guildRanks.map((rank) => (
                    <SelectItem key={rank} value={rank}>{rank}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-role-filter">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="DPS">DPS</SelectItem>
                  <SelectItem value="Tank">Tank</SelectItem>
                  <SelectItem value="Healer">Healer</SelectItem>
                </SelectContent>
              </Select>

              {showInactiveToggle && inactivePlayers.length > 0 && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="show-inactive"
                      checked={showInactive}
                      onCheckedChange={(checked) => {
                        setShowInactive(checked);
                        if (!checked) setStatusFilter("all");
                      }}
                      data-testid="switch-show-inactive"
                    />
                    <Label htmlFor="show-inactive" className="text-sm text-muted-foreground flex items-center gap-1">
                      {showInactive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      <span>Inactive ({inactivePlayers.length})</span>
                    </Label>
                  </div>
                  
                  {showInactive && (
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All ({players.length})</SelectItem>
                        <SelectItem value="active">Active ({activePlayers.length})</SelectItem>
                        <SelectItem value="inactive">Inactive ({inactivePlayers.length})</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>
          )}

          {showDeleteControls && selectedIds.size > 0 && (
            <div className="flex items-center gap-3 mt-4 p-3 bg-destructive/10 rounded-md border border-destructive/20 flex-wrap">
              <span className="text-sm text-muted-foreground">
                {selectedIds.size} player{selectedIds.size !== 1 ? "s" : ""} selected
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteSelected}
                disabled={deleteMutation.isPending}
                data-testid="button-delete-selected"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {deleteMutation.isPending ? "Deleting..." : "Delete Selected"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
                data-testid="button-clear-selection"
              >
                Clear Selection
              </Button>
            </div>
          )}
        </CardHeader>
      )}

      <CardContent className={showFilters ? "" : "pt-6"}>
        {isMobile ? (
          <div className="space-y-3">
            {filteredPlayers.length === 0 ? (
              <div className="h-24 flex items-center justify-center text-muted-foreground">
                No players found
              </div>
            ) : (
              filteredPlayers.map((player, index) => {
                const classColor = WOW_CLASS_COLORS[player.class] || "#FFFFFF";
                const scoreColor = getScoreColor(player.mythicScore || 0);
                const isInactive = !player.isActive;
                const position = index + 1;

                return (
                  <div 
                    key={player.id}
                    className={`p-3 rounded-md bg-muted/30 ${isInactive ? "opacity-50" : ""}`}
                    data-testid={`player-row-${player.id}`}
                  >
                    <div className="flex items-start gap-3">
                      {showDeleteControls && (
                        <Checkbox
                          checked={selectedIds.has(player.id)}
                          onCheckedChange={() => toggleSelectPlayer(player.id)}
                          className="mt-3"
                          data-testid={`checkbox-player-${player.id}`}
                        />
                      )}
                      <span className="font-mono text-xs text-muted-foreground mt-1 w-5">{position}</span>
                      <Link href={`/player/${player.id}`} className="flex-1 hover-elevate rounded-md -m-1 p-1">
                        <div className="flex items-start gap-3">
                          <Avatar className="w-10 h-10 shrink-0">
                            {player.avatarUrl ? (
                              <AvatarImage src={player.avatarUrl} alt={player.name} />
                            ) : null}
                            <AvatarFallback 
                              style={{ backgroundColor: `${classColor}20`, color: classColor }}
                              className="text-sm font-medium"
                            >
                              {player.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium" style={{ color: classColor }}>
                                {player.name}
                              </span>
                              {getRoleIcon(getPlayerRole(player.spec))}
                              {isInactive && (
                                <Badge variant="secondary" className="text-xs">Inactive</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap mt-1">
                              <Badge 
                                variant="outline" 
                                className="text-xs"
                                style={{ borderColor: `${classColor}40`, color: classColor, backgroundColor: `${classColor}10` }}
                              >
                                {player.spec || player.class}
                              </Badge>
                              <Badge 
                                variant="outline"
                                className="text-xs"
                                style={{ 
                                  borderColor: `${GUILD_RANK_COLORS[player.guildRank || ""] || "#666666"}60`,
                                  backgroundColor: `${GUILD_RANK_COLORS[player.guildRank || ""] || "#666666"}15`,
                                  color: GUILD_RANK_COLORS[player.guildRank || ""] || "#666666"
                                }}
                              >
                                {player.guildRank}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-xs">
                              <span className="text-muted-foreground">iLvl <span className="font-mono">{player.itemLevel || 0}</span></span>
                              <span style={{ color: scoreColor }} className="font-mono font-semibold">
                                {(player.mythicScore || 0).toLocaleString()} M+
                              </span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  {showDeleteControls && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={filteredPlayers.length > 0 && selectedIds.size === filteredPlayers.length}
                        onCheckedChange={toggleSelectAll}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                  )}
                  <TableHead className="w-12 text-center">
                    <span className="text-xs">#</span>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer select-none"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex items-center gap-1">
                      Player <SortIcon field="name" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer select-none"
                    onClick={() => handleSort("class")}
                  >
                    <div className="flex items-center gap-1">
                      Class <SortIcon field="class" />
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      Spec / Role
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer select-none"
                    onClick={() => handleSort("guildRank")}
                  >
                    <div className="flex items-center gap-1">
                      Rank <SortIcon field="guildRank" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer select-none text-right"
                    onClick={() => handleSort("itemLevel")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      iLvl <SortIcon field="itemLevel" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer select-none text-right"
                    onClick={() => handleSort("mythicScore")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      M+ Score <SortIcon field="mythicScore" />
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlayers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={showDeleteControls ? 8 : 7} className="h-24 text-center text-muted-foreground">
                      No players found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPlayers.map((player, index) => {
                    const classColor = WOW_CLASS_COLORS[player.class] || "#FFFFFF";
                    const scoreColor = getScoreColor(player.mythicScore || 0);
                    const isInactive = !player.isActive;
                    const position = index + 1;
                    
                    return (
                      <TableRow 
                        key={player.id}
                        className={`hover-elevate cursor-pointer ${isInactive ? "opacity-50" : ""}`}
                        data-testid={`player-row-${player.id}`}
                      >
                        {showDeleteControls && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(player.id)}
                              onCheckedChange={() => toggleSelectPlayer(player.id)}
                              data-testid={`checkbox-player-${player.id}`}
                            />
                          </TableCell>
                        )}
                        <TableCell className="text-center">
                          <span className="font-mono text-sm text-muted-foreground">{position}</span>
                        </TableCell>
                        <TableCell>
                          <Link href={`/player/${player.id}`}>
                            <div className="flex items-center gap-3">
                              <Avatar className="w-8 h-8">
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
                              <div>
                                <div className="flex items-center gap-2">
                                  <span 
                                    className="font-medium"
                                    style={{ color: classColor }}
                                  >
                                    {player.name}
                                  </span>
                                  {isInactive && (
                                    <Badge variant="secondary" className="text-xs">
                                      Inactive
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">{player.realm}</p>
                              </div>
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline"
                            style={{ 
                              borderColor: `${classColor}40`,
                              color: classColor,
                              backgroundColor: `${classColor}10`
                            }}
                          >
                            {player.class}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getRoleIcon(getPlayerRole(player.spec))}
                            <span className="text-sm" style={{ color: classColor }}>
                              {player.spec || "-"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline"
                            style={{ 
                              borderColor: `${GUILD_RANK_COLORS[player.guildRank || ""] || "#666666"}60`,
                              backgroundColor: `${GUILD_RANK_COLORS[player.guildRank || ""] || "#666666"}15`,
                              color: GUILD_RANK_COLORS[player.guildRank || ""] || "#666666"
                            }}
                            className="text-xs"
                          >
                            {player.guildRank}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-mono text-sm">{player.itemLevel || 0}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span 
                            className="font-mono font-semibold"
                            style={{ color: scoreColor }}
                          >
                            {(player.mythicScore || 0).toLocaleString()}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
        
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground flex-wrap gap-2">
          <span>
            Showing {filteredPlayers.length} of {displayPlayers.length} players
            {showInactive && inactivePlayers.length > 0 && (
              <span className="text-muted-foreground/70"> (including {inactivePlayers.filter(p => filteredPlayers.includes(p)).length} inactive)</span>
            )}
          </span>
          <span>
            Active: {activePlayers.length} | Inactive: {inactivePlayers.length}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
