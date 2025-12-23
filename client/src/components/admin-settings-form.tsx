import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Settings, Key, Globe, Shield, Bell, Trash2, Save, Copy, RefreshCw, Loader2 } from "lucide-react";
import { insertGuildSettingsSchema, type InsertGuildSettings, type GuildSettings, type AdminAuditLog } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface AdminSettingsFormProps {
  initialData?: Partial<InsertGuildSettings>;
  onSubmit: (data: InsertGuildSettings) => void;
  isLoading?: boolean;
}

export function AdminSettingsForm({ initialData, onSubmit, isLoading }: AdminSettingsFormProps) {
  const { toast } = useToast();
  const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null);

  const { data: settings } = useQuery<GuildSettings>({
    queryKey: ["/api/settings"],
  });

  const { data: auditLogs } = useQuery<AdminAuditLog[]>({
    queryKey: ["/api/admin/audit-logs"],
  });

  const formatAction = (action: string): string => {
    switch (action) {
      case "data_upload": return "Data uploaded";
      case "raiderio_sync": return "Raider.IO sync completed";
      case "warcraftlogs_sync": return "Warcraft Logs sync completed";
      case "settings_updated": return "Settings updated";
      default: return action.replace(/_/g, " ");
    }
  };

  const regenerateKeyMutation = useMutation({
    mutationFn: async () => {
      return apiRequest<{ apiKey: string }>("POST", "/api/settings/generate-api-key");
    },
    onSuccess: (data: { apiKey: string }) => {
      setGeneratedApiKey(data.apiKey);
      toast({
        title: "API Key Generated",
        description: "Your new API key has been generated. Copy it now - it won't be shown again!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "You must save guild settings first before generating an API key.",
        variant: "destructive",
      });
    },
  });

  const handleCopyApiKey = () => {
    const keyToCopy = generatedApiKey || settings?.uploadApiKey;
    if (keyToCopy) {
      navigator.clipboard.writeText(keyToCopy);
      toast({
        title: "Copied",
        description: "API key copied to clipboard",
      });
    }
  };

  const displayApiKey = generatedApiKey || settings?.uploadApiKey || "Click Regenerate to create an API key";

  const form = useForm<InsertGuildSettings>({
    resolver: zodResolver(insertGuildSettingsSchema),
    defaultValues: {
      name: initialData?.name || "",
      realm: initialData?.realm || "",
      region: initialData?.region || "US",
      faction: initialData?.faction || "Alliance",
      emblemUrl: initialData?.emblemUrl || "",
      raiderIOApiKey: initialData?.raiderIOApiKey || "",
      warcraftLogsClientId: initialData?.warcraftLogsClientId || "",
      warcraftLogsClientSecret: initialData?.warcraftLogsClientSecret || "",
      discordWebhook: initialData?.discordWebhook || "",
    },
  });

  return (
    <div className="space-y-6" data-testid="admin-settings">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="border-card-border bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <CardTitle className="font-display text-lg tracking-wide flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                <span 
                  className="text-foreground"
                  style={{ textShadow: "0 0 20px hsl(210, 90%, 55%, 0.3)" }}
                >
                  Guild Information
                </span>
              </CardTitle>
              <CardDescription>
                Basic information about your guild
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Guild Name</FormLabel>
                      <FormControl>
                        <Input placeholder="My Awesome Guild" {...field} data-testid="input-guild-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="realm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Realm</FormLabel>
                      <FormControl>
                        <Input placeholder="Area-52" {...field} data-testid="input-realm" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="region"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Region</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-region">
                            <SelectValue placeholder="Select region" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="US">US</SelectItem>
                          <SelectItem value="EU">EU</SelectItem>
                          <SelectItem value="KR">KR</SelectItem>
                          <SelectItem value="TW">TW</SelectItem>
                          <SelectItem value="CN">CN</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="faction"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Faction</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-faction">
                            <SelectValue placeholder="Select faction" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Alliance">
                            <span className="text-blue-400">Alliance</span>
                          </SelectItem>
                          <SelectItem value="Horde">
                            <span className="text-red-400">Horde</span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="emblemUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Guild Emblem URL</FormLabel>
                    <FormControl>
                      <Input 
                        type="url" 
                        placeholder="https://example.com/emblem.png" 
                        {...field} 
                        value={field.value || ""}
                        data-testid="input-emblem-url" 
                      />
                    </FormControl>
                    <FormDescription>Optional: URL to your guild's emblem image</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="border-card-border bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <CardTitle className="font-display text-lg tracking-wide flex items-center gap-2">
                <Key className="w-5 h-5 text-accent" />
                <span 
                  className="text-foreground"
                  style={{ textShadow: "0 0 20px hsl(43, 85%, 55%, 0.3)" }}
                >
                  API Keys
                </span>
              </CardTitle>
              <CardDescription>
                Connect external services to enhance data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="raiderIOApiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      Raider.IO API Key
                      <Badge variant="secondary" className="text-xs">Optional</Badge>
                    </FormLabel>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="Enter your Raider.IO API key" 
                        {...field}
                        value={field.value || ""}
                        data-testid="input-raiderio-key" 
                      />
                    </FormControl>
                    <FormDescription>
                      Used to fetch M+ scores and dungeon data
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="warcraftLogsClientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        WarcraftLogs Client ID
                        <Badge variant="secondary" className="text-xs">Optional</Badge>
                      </FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Client ID from WarcraftLogs" 
                          {...field}
                          value={field.value || ""}
                          data-testid="input-wlogs-client-id" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="warcraftLogsClientSecret"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        WarcraftLogs Client Secret
                        <Badge variant="secondary" className="text-xs">Optional</Badge>
                      </FormLabel>
                      <FormControl>
                        <Input 
                          type="password"
                          placeholder="Client Secret from WarcraftLogs" 
                          {...field}
                          value={field.value || ""}
                          data-testid="input-wlogs-client-secret" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormDescription>
                Get your OAuth credentials from the WarcraftLogs API client settings
              </FormDescription>

              <FormField
                control={form.control}
                name="discordWebhook"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      Discord Webhook URL
                      <Badge variant="secondary" className="text-xs">Optional</Badge>
                    </FormLabel>
                    <FormControl>
                      <Input 
                        type="url" 
                        placeholder="https://discord.com/api/webhooks/..." 
                        {...field}
                        value={field.value || ""}
                        data-testid="input-discord-webhook" 
                      />
                    </FormControl>
                    <FormDescription>
                      Send notifications to your Discord server
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-4">
            <Button 
              type="button" 
              variant="destructive" 
              className="gap-2"
              data-testid="button-purge"
            >
              <Trash2 className="w-4 h-4" />
              Purge Inactive Members
            </Button>
            
            <Button 
              type="submit" 
              disabled={isLoading}
              className="gap-2"
              data-testid="button-save-settings"
            >
              <Save className="w-4 h-4" />
              {isLoading ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </form>
      </Form>

      <Card className="border-card-border bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-4">
          <CardTitle className="font-display text-lg tracking-wide flex items-center gap-2">
            <Shield className="w-5 h-5 text-green-400" />
            <span className="text-foreground">
              Upload API Key
            </span>
          </CardTitle>
          <CardDescription>
            Use this key in your local Python uploader to authenticate
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={displayApiKey}
              className="font-mono bg-muted/30 text-xs"
              data-testid="input-upload-api-key"
            />
            <Button 
              variant="outline" 
              size="icon"
              onClick={handleCopyApiKey}
              disabled={!generatedApiKey && !settings?.uploadApiKey}
              data-testid="button-copy-key"
            >
              <Copy className="w-4 h-4" />
            </Button>
            <Button 
              variant="outline" 
              onClick={() => regenerateKeyMutation.mutate()}
              disabled={regenerateKeyMutation.isPending}
              data-testid="button-regenerate-key"
            >
              {regenerateKeyMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Regenerate
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Use this key in the <code className="bg-muted px-1 rounded">X-API-Key</code> header when uploading data to <code className="bg-muted px-1 rounded">POST /api/upload</code>
          </p>
        </CardContent>
      </Card>

      <Card className="border-card-border bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-4">
          <CardTitle className="font-display text-lg tracking-wide flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            <span className="text-foreground">
              Recent Activity Log
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {auditLogs && auditLogs.length > 0 ? (
              auditLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="flex items-center justify-between gap-2 p-2 rounded bg-muted/20" data-testid={`audit-log-${log.id}`}>
                  <span className="text-muted-foreground truncate" title={log.details || undefined}>
                    {formatAction(log.action)}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-muted-foreground text-center py-4">
                No activity recorded yet
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
