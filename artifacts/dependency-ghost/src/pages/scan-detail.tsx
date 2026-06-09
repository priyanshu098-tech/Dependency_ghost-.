import { useEffect, useRef } from "react";
import { useParams } from "wouter";
import { useGetScan, getGetScanQueryKey, useGetScanLogs, getGetScanLogsQueryKey, useGetScanMismatches, getGetScanMismatchesQueryKey, useRunScan } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Terminal, Activity, AlertCircle, FileCode, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const AGENT_COLORS = {
  THINK: "text-blue-400",
  EXECUTE: "text-amber-400",
  CORRECT: "text-emerald-400",
  SYSTEM: "text-muted-foreground"
};

const SEVERITY_COLORS = {
  critical: "bg-red-500/10 text-red-500 border-red-500/20",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  low: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

export default function ScanDetail() {
  const { id } = useParams();
  const scanId = parseInt(id || "0", 10);
  
  const { data: scan } = useGetScan(scanId, {
    query: {
      enabled: !!scanId,
      queryKey: getGetScanQueryKey(scanId),
      refetchInterval: (query) => {
        const status = query.state?.data?.status;
        return (status === 'completed' || status === 'failed') ? false : 3000;
      }
    }
  });

  const { data: logs } = useGetScanLogs(scanId, {
    query: {
      enabled: !!scanId,
      queryKey: getGetScanLogsQueryKey(scanId),
      refetchInterval: (query) => {
        return (scan?.status === 'completed' || scan?.status === 'failed') ? false : 3000;
      }
    }
  });

  const { data: mismatches } = useGetScanMismatches(scanId, {
    query: {
      enabled: !!scanId,
      queryKey: getGetScanMismatchesQueryKey(scanId),
      refetchInterval: (query) => {
        return (scan?.status === 'completed' || scan?.status === 'failed') ? false : 5000;
      }
    }
  });

  const runScan = useRunScan();
  const hasRun = useRef(false);

  useEffect(() => {
    if (scan && scan.status === 'pending' && !hasRun.current) {
      hasRun.current = true;
      runScan.mutate({ id: scanId });
    }
  }, [scan, scanId, runScan]);

  if (!scan) return <div className="animate-pulse font-mono text-primary">LOADING_SCAN_DATA...</div>;

  const isRunning = !['completed', 'failed'].includes(scan.status);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-mono flex items-center gap-3">
            SCAN #{scan.id}
            <Badge variant="outline" className={`
              uppercase font-mono ml-2
              ${scan.status === 'completed' ? 'border-emerald-500 text-emerald-500' : ''}
              ${scan.status === 'failed' ? 'border-destructive text-destructive' : ''}
              ${isRunning ? 'border-primary text-primary animate-pulse' : ''}
            `}>
              {scan.status}
            </Badge>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-mono">{scan.repoUrl}</p>
        </div>
        {scan.prUrl && (
          <Button variant="outline" className="border-primary text-primary hover:bg-primary/10" asChild>
            <a href={scan.prUrl} target="_blank" rel="noreferrer">
              VIEW PULL REQUEST
            </a>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-border bg-[#0a0a0a] shadow-xl overflow-hidden flex flex-col h-[600px]">
          <CardHeader className="bg-muted/50 border-b border-border py-3">
            <CardTitle className="text-sm font-mono flex items-center gap-2 text-muted-foreground">
              <Terminal className="w-4 h-4" />
              LIVE_LOG_STREAM
              {isRunning && <Activity className="w-3 h-3 text-primary animate-pulse ml-auto" />}
            </CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-2 font-mono text-xs">
              {logs?.map((log) => (
                <div key={log.id} className="flex gap-3">
                  <span className="text-muted-foreground opacity-50 shrink-0">
                    {new Date(log.createdAt).toLocaleTimeString([], { hour12: false })}
                  </span>
                  <span className={`w-16 shrink-0 font-bold ${AGENT_COLORS[log.agent] || "text-foreground"}`}>
                    [{log.agent}]
                  </span>
                  <span className={`${log.level === 'error' ? 'text-destructive' : 'text-foreground/90'}`}>
                    {log.message}
                  </span>
                </div>
              ))}
              {logs?.length === 0 && (
                <div className="text-muted-foreground opacity-50 italic">Awaiting agent initialization...</div>
              )}
            </div>
          </ScrollArea>
        </Card>

        <div className="space-y-6">
          <Card className="border-border bg-card/50">
            <CardHeader className="py-3 border-b border-border">
              <CardTitle className="text-sm font-mono flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                MISMATCHES_DETECTED ({mismatches?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[540px]">
                <div className="p-4 space-y-4">
                  {mismatches?.map((mismatch) => (
                    <Card key={mismatch.id} className="border-border bg-background shadow-none rounded-sm">
                      <div className="p-3 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="font-mono text-sm font-bold text-primary">
                            {mismatch.dependency}
                          </div>
                          <Badge variant="outline" className={`text-[10px] uppercase h-5 ${SEVERITY_COLORS[mismatch.severity]}`}>
                            {mismatch.severity}
                          </Badge>
                        </div>
                        <div className="text-xs font-mono text-muted-foreground">
                          fn: {mismatch.functionName}
                        </div>
                        <div className="space-y-1 mt-2">
                          <div className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Actual vs Expected</div>
                          <div className="text-xs font-mono bg-red-950/20 text-red-400 p-1.5 rounded-sm line-clamp-1 border border-red-900/30">
                            - {mismatch.expected}
                          </div>
                          <div className="text-xs font-mono bg-emerald-950/20 text-emerald-400 p-1.5 rounded-sm line-clamp-1 border border-emerald-900/30">
                            + {mismatch.actual}
                          </div>
                        </div>
                        {mismatch.patch && (
                          <div className="pt-2 mt-2 border-t border-border/50">
                            <div className="flex items-center gap-1.5 text-[10px] uppercase text-emerald-500 font-bold mb-1.5">
                              <FileCode className="w-3 h-3" />
                              Patch Generated
                              {mismatch.patchStatus === 'verified' && <CheckCircle2 className="w-3 h-3 ml-auto text-emerald-500" />}
                            </div>
                            <pre className="text-[10px] font-mono bg-black p-2 rounded border border-border text-gray-300 overflow-x-auto">
                              {mismatch.patch}
                            </pre>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                  {mismatches?.length === 0 && (
                    <div className="text-xs font-mono text-muted-foreground text-center py-8">
                      No behavior drift detected yet.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
