import { useListScans, getListScansQueryKey, useGetScanStats, getGetScanStatsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Ghost, Plus, AlertTriangle, ShieldCheck, Clock, TerminalSquare } from "lucide-react";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetScanStats({ query: { queryKey: getGetScanStatsQueryKey() }});

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <TerminalSquare className="w-8 h-8 text-primary" />
            WAR ROOM
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">Monitor dependency behavior drift and agent activity.</p>
        </div>
        <Link href="/scan/new">
          <Button className="font-mono font-bold uppercase" data-testid="button-start-scan">
            <Plus className="w-4 h-4 mr-2" />
            Initiate Scan
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-primary/20 bg-card/50 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Ghost className="w-4 h-4" /> TOTAL SCANS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{stats?.totalScans ?? "-"}</div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card/50 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> COMPLETED
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.completedScans ?? "-"}</div>
          </CardContent>
        </Card>
        <Card className="border-destructive/20 bg-card/50 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" /> MISMATCHES
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{stats?.totalMismatches ?? "-"}</div>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-card/50 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" /> FIXED
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-500">{stats?.fixedMismatches ?? "-"}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold border-b border-border pb-2">RECENT SCANS</h2>
        {statsLoading ? (
          <div className="text-muted-foreground text-sm animate-pulse">Loading logs...</div>
        ) : (
          <div className="grid gap-3">
            {stats?.recentScans?.map(scan => (
              <Link key={scan.id} href={`/scan/${scan.id}`} className="block">
                <Card className="hover:border-primary/50 transition-colors cursor-pointer bg-card/30">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="font-mono text-sm text-primary">{scan.repoUrl}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        {format(new Date(scan.createdAt), 'PPpp')}
                      </div>
                    </div>
                    <div>
                      <Badge variant="outline" className={`
                        uppercase font-mono text-xs
                        ${scan.status === 'completed' ? 'border-emerald-500 text-emerald-500' : ''}
                        ${scan.status === 'failed' ? 'border-destructive text-destructive' : ''}
                        ${['pending', 'thinking', 'executing', 'correcting'].includes(scan.status) ? 'border-primary text-primary animate-pulse' : ''}
                      `}>
                        {scan.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
            {stats?.recentScans?.length === 0 && (
              <div className="text-muted-foreground text-sm py-8 text-center border border-dashed border-border">
                NO SCANS FOUND IN DATABASE.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
