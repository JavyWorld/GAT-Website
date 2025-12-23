import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AnimatedBackground } from "@/components/animated-background";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Roster from "@/pages/roster";
import Leaderboard from "@/pages/leaderboard";
import Raids from "@/pages/raids";
import PlayerPage from "@/pages/player";
import Admin from "@/pages/admin";
import Chats from "@/pages/chats";
import RosterManagement from "@/pages/roster-management";

interface UploadStatus {
  processing: boolean;
  processedCount: number;
  startedAt: string | null;
  lastCompletedAt: string | null;
}

function UploadStatusIndicator() {
  const [now, setNow] = useState(Date.now());
  
  const { data: status } = useQuery<UploadStatus>({
    queryKey: ["/api/upload/status"],
    refetchInterval: 5000,
  });

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  const relativeTime = useMemo(() => {
    if (!status?.lastCompletedAt) return null;
    const completedAt = new Date(status.lastCompletedAt).getTime();
    const diffMs = now - completedAt;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "just now";
    if (diffMins === 1) return "1 min ago";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours === 1) return "1 hour ago";
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays === 1) return "1 day ago";
    return `${diffDays} days ago`;
  }, [status?.lastCompletedAt, now]);

  if (status?.processing) {
    return (
      <div className="flex items-center gap-2" data-testid="upload-status-processing">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <span className="text-xs text-primary font-medium">
          Procesando Data: {status.processedCount} jugadores procesados
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2" data-testid="upload-status-idle">
      <span className="text-xs text-muted-foreground">
        {relativeTime ? `Last sync: ${relativeTime}` : "No uploads yet"}
      </span>
      {relativeTime && (
        <div className="w-2 h-2 rounded-full bg-green-500" />
      )}
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/roster" component={Roster} />
      <Route path="/chats" component={Chats} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/raids" component={Raids} />
      <Route path="/player/:id" component={PlayerPage} />
      <Route path="/roster-management" component={RosterManagement} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={sidebarStyle as React.CSSProperties}>
          <div className="flex h-screen w-full relative">
            <AnimatedBackground />
            <AppSidebar />
            <div className="flex flex-col flex-1 relative z-10">
              <header className="flex h-16 md:h-14 items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-3 md:px-4 sticky top-0 z-50">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
                <div className="flex-1" />
                <UploadStatusIndicator />
              </header>
              <ScrollArea className="flex-1">
                <main className="min-h-[calc(100vh-3.5rem)]">
                  <Router />
                </main>
              </ScrollArea>
            </div>
          </div>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
