import { useEffect, useRef } from "react";
import { useParams, Link } from "wouter";
import {
  useGetScan, getGetScanQueryKey,
  useGetScanLogs, getGetScanLogsQueryKey,
  useGetScanMismatches, getGetScanMismatchesQueryKey,
  useRunScan,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Terminal, Activity, AlertTriangle, ExternalLink, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MismatchCard } from "@/components/diff-viewer";

const AGENT_COLORS: Record<string, string> = {
  THINK:   "text-blue-400",
  EXECUTE: "text-amber-400",
  CORRECT: "text-emerald-400",
  SYSTEM:  "text-zinc-500",
};

const LOG_LEVEL_COLORS: Record<string, string> = {
  info:    "text-zinc-300",
  warning: "text-yellow-400",
  error:   "text-red-400",
  success: "text-emerald-400",
};

const STATUS_STYLES: Record<string, string> = {
  pending:    "border-zinc-500   text-zinc-400",
  thinking:   "border-blue-500   text-blue-400",
  executing:  "border-amber-500  text-amber-400",
  correcting: "border-purple-500 text-purple-400",
  completed:  "border-emerald-500 text-emerald-400",
  failed:     "border-red-500    text-red-400",
};

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default function ScanDetail() {
  const { id } = useParams();
  const scanId = parseInt(id || "0", 10);

  const isTerminal = (status?: string) =>
    status === "completed" || status === "failed";

  const { data: scan } = useGetScan(scanId, {
    query: {
      enabled: !!scanId,
      queryKey: getGetScanQueryKey(scanId),
      refetchInterval: (q) => (isTerminal(q.state?.data?.status) ? false : 3000),
    },
  });

  const { data: logs } = useGetScanLogs(scanId, {
    query: {
      enabled: !!scanId,
      queryKey: getGetScanLogsQueryKey(scanId),
      refetchInterval: () => (isTerminal(scan?.status) ? false : 2500),
    },
  });

  const { data: mismatches } = useGetScanMismatches(scanId, {
    query: {
      enabled: !!scanId,
      queryKey: getGetScanMismatchesQueryKey(scanId),
      refetchInterval: () => (isTerminal(scan?.status) ? false : 4000),
    },
  });

  const runScan = useRunScan();
  const hasRun = useRef(false);

  useEffect(() => {
    if (scan && scan.status === "pending" && !hasRun.current) {
      hasRun.current = true;
      runScan.mutate({ id: scanId });
    }
  }, [scan, scanId, runScan]);

  // Auto-scroll log pane
  const logEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs?.length]);

  if (!scan) {
    return (
      <div className="flex items-center gap-3 font-mono text-primary animate-pulse py-8">
        <Terminal className="w-4 h-4" />
        LOADING_SCAN_DATA...
      </div>
    );
  }

  const isRunning = !isTerminal(scan.status);
  const statusStyle = STATUS_STYLES[scan.status] ?? "border-zinc-500 text-zinc-400";

  const sortedMismatches = [...(mismatches ?? [])].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  );

  const criticalCount = sortedMismatches.filter((m) => m.severity === "critical").length;
  const highCount     = sortedMismatches.filter((m) => m.severity === "high").length;

  return (
    <div className="space-y-5 animate-in fade-in duration-300" data-testid="scan-detail-page">

      {/* ── Top bar ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-zinc-500 text-xs font-mono mb-2">
            <Link href="/">
              <button className="flex items-center gap-1 hover:text-primary transition-colors" data-testid="link-back-dashboard">
                <ArrowLeft className="w-3 h-3" />
                WAR_ROOM
              </button>
            </Link>
            <span>/</span>
            <span className="text-zinc-400">SCAN #{scan.id}</span>
          </div>
          <h1 className="text-xl font-bold font-mono flex items-center gap-3 flex-wrap">
            <span data-testid="text-scan-title">SCAN #{scan.id}</span>
            <Badge
              variant="outline"
              className={`uppercase font-mono text-[11px] ${statusStyle} ${isRunning ? "animate-pulse" : ""}`}
              data-testid="badge-scan-status"
            >
              {scan.status}
            </Badge>
          </h1>
          <p className="text-zinc-500 text-xs font-mono truncate max-w-xl" data-testid="text-scan-repo">
            {scan.repoUrl}
          </p>
        </div>

        {scan.prUrl && (
          <a
            href={scan.prUrl}
            target="_blank"
            rel="noreferrer"
            data-testid="link-pull-request"
          >
            <Button
              variant="outline"
              className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 font-mono text-xs gap-2"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              VIEW PULL REQUEST
            </Button>
          </a>
        )}
      </div>

      {/* ── Main layout ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

        {/* Log pane — 2 cols */}
        <Card className="xl:col-span-2 border-zinc-800 bg-zinc-950 flex flex-col h-[580px]">
          <CardHeader className="py-2.5 px-4 border-b border-zinc-800 bg-zinc-900/60 shrink-0">
            <CardTitle className="text-[11px] font-mono flex items-center gap-2 text-zinc-500 uppercase tracking-widest">
              <Terminal className="w-3.5 h-3.5" />
              LIVE_LOG_STREAM
              {isRunning && (
                <Activity className="w-3 h-3 text-primary animate-pulse ml-auto" />
              )}
              {!isRunning && (
                <span className="ml-auto text-zinc-600 text-[9px]">
                  {logs?.length ?? 0} entries
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <div className="flex-1 overflow-y-auto p-3">
            <div className="space-y-1 font-mono text-[11px]" data-testid="log-stream">
              {logs?.map((log, i) => (
                <div
                  key={log.id}
                  className="flex gap-2 items-start animate-in fade-in slide-in-from-bottom-1"
                  style={{ animationDelay: `${Math.min(i * 20, 300)}ms` }}
                  data-testid={`log-entry-${log.id}`}
                >
                  <span className="text-zinc-700 shrink-0 tabular-nums">
                    {new Date(log.createdAt).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                  <span
                    className={`shrink-0 font-bold w-[60px] ${AGENT_COLORS[log.agent] ?? "text-zinc-400"}`}
                  >
                    [{log.agent}]
                  </span>
                  <span className={LOG_LEVEL_COLORS[log.level] ?? "text-zinc-300"}>
                    {log.message}
                  </span>
                </div>
              ))}
              {(!logs || logs.length === 0) && (
                <div className="text-zinc-700 italic text-center py-12">
                  Awaiting agent initialization...
                </div>
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </Card>

        {/* Diff / mismatches pane — 3 cols */}
        <div className="xl:col-span-3 flex flex-col gap-4">

          {/* Summary bar */}
          <div className="flex items-center gap-3 font-mono text-xs flex-wrap" data-testid="mismatches-summary">
            <span className="flex items-center gap-1.5 text-zinc-500">
              <AlertTriangle className="w-3.5 h-3.5" />
              MISMATCHES
            </span>
            <span className="text-zinc-200 font-bold" data-testid="text-mismatch-count">
              {sortedMismatches.length}
            </span>
            {criticalCount > 0 && (
              <span className="text-red-400 text-[10px] border border-red-500/30 px-1.5 py-0.5 rounded">
                {criticalCount} CRITICAL
              </span>
            )}
            {highCount > 0 && (
              <span className="text-orange-400 text-[10px] border border-orange-500/30 px-1.5 py-0.5 rounded">
                {highCount} HIGH
              </span>
            )}
            {sortedMismatches.length > 0 && (
              <span className="ml-auto text-zinc-600 text-[10px]">
                click a row to expand diff + patch
              </span>
            )}
          </div>

          {/* Scrollable mismatch list */}
          <div className="overflow-y-auto flex-1 space-y-2 pr-1" style={{ maxHeight: 520 }} data-testid="mismatches-list">
            {sortedMismatches.map((m, i) => (
              <MismatchCard key={m.id} mismatch={m} index={i} />
            ))}

            {sortedMismatches.length === 0 && !isRunning && (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                <div className="w-10 h-10 rounded-full border border-emerald-500/30 flex items-center justify-center">
                  <span className="text-emerald-400 font-mono text-lg">✓</span>
                </div>
                <p className="font-mono text-xs text-zinc-500">NO_BEHAVIORAL_DRIFT_DETECTED</p>
                <p className="text-[10px] text-zinc-700 max-w-xs">
                  All dependency functions match their expected contracts.
                </p>
              </div>
            )}

            {sortedMismatches.length === 0 && isRunning && (
              <div className="text-center py-16 font-mono text-xs text-zinc-600 animate-pulse">
                Scanning for behavioral drift...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
