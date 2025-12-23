import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Users, 
  Trophy, 
  Swords, 
  Settings,
  Shield,
  LogOut,
  LogIn,
  MessageSquare,
  UserCog
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Roster", url: "/roster", icon: Users },
  { title: "Leaderboard", url: "/leaderboard", icon: Trophy },
  { title: "Raid Analytics", url: "/raids", icon: Swords },
];

const adminItems = [
  { title: "Chats", url: "/chats", icon: MessageSquare },
  { title: "Roster Management", url: "/roster-management", icon: UserCog },
  { title: "Admin Panel", url: "/admin", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, isAuthenticated, isAdmin, logout, isLoading } = useAuth();

  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-md bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="absolute -inset-1 bg-primary/20 rounded-md blur-sm -z-10" />
          </div>
          <div className="flex flex-col">
            <span 
              className="font-display text-lg font-semibold tracking-wide text-sidebar-foreground"
              style={{ textShadow: "0 0 20px hsl(210, 90%, 55%, 0.3)" }}
            >
              GAT-Web
            </span>
            <span className="text-xs text-muted-foreground">Guild Activity Tracker</span>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="px-2">
        <SidebarGroup className="py-4">
          <SidebarGroupLabel className="px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {navItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title} className="border-b border-sidebar-border pb-2">
                    <SidebarMenuButton
                      asChild
                      size="lg"
                      data-active={isActive}
                      className={isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}
                    >
                      <Link href={item.url} data-testid={`nav-${item.title.toLowerCase()}`}>
                        <item.icon className="w-5 h-5" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup className="py-4 border-t border-sidebar-border">
            <SidebarGroupLabel className="px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              Management
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-2">
                {adminItems.map((item) => {
                  const isActive = location === item.url;
                  return (
                    <SidebarMenuItem key={item.title} className="border-b border-sidebar-border pb-2">
                      <SidebarMenuButton
                        asChild
                        size="lg"
                        data-active={isActive}
                        className={isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}
                      >
                        <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(' ', '-')}`}>
                          <item.icon className="w-5 h-5" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        {isLoading ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
            <div className="flex-1 min-w-0">
              <div className="h-4 bg-muted rounded animate-pulse mb-1" />
              <div className="h-3 bg-muted rounded animate-pulse w-16" />
            </div>
          </div>
        ) : isAuthenticated && user ? (
          <div className="flex items-center gap-3">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-medium">
                {user.firstName?.slice(0, 1).toUpperCase() || user.email?.slice(0, 1).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {user.firstName || user.email?.split("@")[0] || "User"}
              </p>
              <p className="text-xs text-muted-foreground truncate">Connected</p>
            </div>
            <Button 
              size="icon" 
              variant="ghost" 
              className="shrink-0"
              onClick={() => logout()}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <Button 
            variant="outline" 
            className="w-full"
            onClick={handleLogin}
            data-testid="button-login"
          >
            <LogIn className="w-4 h-4 mr-2" />
            Sign In
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
