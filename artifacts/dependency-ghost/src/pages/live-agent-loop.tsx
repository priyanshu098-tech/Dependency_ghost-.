import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import {
  useListScans, getListScansQueryKey,
  useGetScan, getGetScanQueryKey,
  useGetScanLogs, getGetScanLogsQueryKey,
} from "@workspace/api-client-react";
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Clock, Radio } from "lucide-react";

// ─── Config ────────────────────────────────────────────────────────────────────

const AGENTS = [
  {
    key: "THINK",
    emoji: "🧠",
    label: "THINK",
    subtitle: "Contract Map Generation",
    activeStatus: "thinking",
  },
  {
    key: "EXECUTE",
    emoji: "⚙️",
    label: "EXECUTE",
    subtitle: "Behavioral Test Execution",
    activeStatus: "executing",
  },
  {
    key: "CORRECT",
    emoji: "🔧",
    label: "SELF-CORRECT",
    subtitle: "Patch Generation & PR",
    activeStatus: "correcting",
  },
] as const;

type AgentPhase = "pending" | "active" | "done" | "error";

const NEON = "#39FF14";
const NEON_GLOW = `0 0 0 1px ${NEON}cc, 0 0 20px ${NEON}66, 0 0 50px ${NEON}33`;
const RED_GLOW = `0 0 0 1px #ef4444cc, 0 0 20px #ef444455, 0 0 50px #ef444422`;

// ─── Phase derivation ──────────────────────────────────────────────────────────

function getAgentPhases(
  status: string | undefined,
  logs: Array<{ agent: string; level: string }> | undefined
): Record<string, AgentPhase> {
  const map: Record<string, AgentPhase> = { THINK: "pending", EXECUTE: "pending", CORRECT: "pending" };
  if (!status) return map;

  if (status === "thinking")   { map.THINK = "active"; }
  if (status === "executing")  { map.THINK = "done";   map.EXECUTE = "active"; }
  if (status === "correcting") { map.THINK = "done";   map.EXECUTE = "done";  map.CORRECT = "active"; }
  if (status === "completed")  { map.THINK = "done";   map.EXECUTE = "done";  map.CORRECT = "done"; }

  if (status === "failed") {
    const order = ["THINK", "EXECUTE", "CORRECT"];
    const lastErr = [...(logs ?? [])].reverse().find(l => l.level === "error" && l.agent !== "SYSTEM");
    const agentsWithLogs = order.filter(a => (logs ?? []).some(l => l.agent === a));
    const lastActive = agentsWithLogs[agentsWithLogs.length - 1] ?? "THINK";
    const failedAgent = lastErr?.agent ?? lastActive;
    const failIdx = order.indexOf(failedAgent);
    order.forEach((k, i) => {
      if (i < failIdx)        map[k] = "done";
      else if (i === failIdx) map[k] = "error";
    });
  }

  return map;
}

// ─── Log colours ───────────────────────────────────────────────────────────────

const LOG_COLORS: Record<string, string> = {
  info:    "text-zinc-400",
  warning: "text-yellow-400",
  error:   "text-red-400",
  success: "text-emerald-400",
};

// ─── Agent card ─────────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  phase,
  logs,
}: {
  agent: (typeof AGENTS)[number];
  phase: AgentPhase;
  logs: Array<{ id: number; agent: string; level: string; message: string; createdAt: string }>;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const agentLogs = logs.filter(l => l.agent === agent.key);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentLogs.length]);

  const isActive  = phase === "active";
  const isDone    = phase === "done";
  const isError   = phase === "error";
  const isPending = phase === "pending";

  return (
    <div
      className="flex flex-col rounded-xl border-2 bg-zinc-950 overflow-hidden transition-all duration-500"
      style={{
        borderColor: isActive ? NEON : isError ? "#ef4444" : isDone ? "#3f3f46" : "#1c1c1f",
        boxShadow:   isActive ? NEON_GLOW : isError ? RED_GLOW : "none",
        opacity:     isPending ? 0.5 : 1,
      }}
    >
      {/* Top glow bar */}
      <div
        className="h-1 w-full transition-all duration-500"
        style={{
          background: isActive
            ? `linear-gradient(90deg, transparent 0%, ${NEON} 50%, transparent 100%)`
            : isError
            ? `linear-gradient(90deg, transparent 0%, #ef4444 50%, transparent 100%)`
            : isDone
            ? `linear-gradient(90deg, transparent 0%, #10b981 50%, transparent 100%)`
            : "transparent",
          animation: isActive ? "pulse 2s ease-in-out infinite" : "none",
        }}
      />

      {/* Card header */}
      <div
        className="flex items-start justify-between gap-3 px-5 pt-5 pb-4"
        style={{ background: isActive ? `${NEON}0a` : isError ? "#ef44440a" : "transparent" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl leading-none select-none">{agent.emoji}</span>
          <div>
            <div
              className="font-black font-mono text-base tracking-widest"
              style={{
                color: isActive ? NEON : isError ? "#ef4444" : isDone ? "#6ee7b7" : "#3f3f46",
                textShadow: isActive ? `0 0 16px ${NEON}aa` : isError ? "0 0 16px #ef444488" : "none",
              }}
            >
              {agent.label}
            </div>
            <div className="text-[11px] font-mono text-zinc-600 mt-0.5 tracking-wider">
              {agent.subtitle}
            </div>
          </div>
        </div>

        {/* Status badge */}
        <div className="shrink-0 mt-0.5">
          {isActive && (
            <div className="flex items-center gap-1.5">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: NEON }} />
              <span className="text-[10px] font-mono font-bold tracking-widest animate-pulse" style={{ color: NEON }}>
                RUNNING
              </span>
            </div>
          )}
          {isDone && (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] font-mono font-bold text-emerald-400 tracking-widest">DONE</span>
            </div>
          )}
          {isError && (
            <div className="flex items-center gap-1.5">
              <XCircle className="w-4 h-4 text-red-400" />
              <span className="text-[10px] font-mono font-bold text-red-400 tracking-widest">FAILED</span>
            </div>
          )}
          {isPending && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-zinc-700" />
              <span className="text-[10px] font-mono text-zinc-700 tracking-widest">STANDBY</span>
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div
        className="mx-5 h-px"
        style={{ background: isActive ? `${NEON}33` : isError ? "#ef444433" : "#27272a" }}
      />

      {/* Log stream */}
      <div className="flex-1 overflow-y-auto min-h-[160px] max-h-[240px] px-4 py-3 space-y-1.5 font-mono text-[11px] leading-relaxed">
        {agentLogs.length === 0 ? (
          <p className="text-zinc-800 italic text-center pt-4 select-none">
            {isPending ? "awaiting activation…" : "no logs yet"}
          </p>
        ) : (
          agentLogs.map(log => (
            <div key={log.id} className="flex gap-2 items-start">
              <span className="text-zinc-700 shrink-0 tabular-nums text-[10px] pt-px">
                {new Date(log.createdAt).toLocaleTimeString([], {
                  hour: "2-digit", minute: "2-digit", second: "2-digit",
                })}
              </span>
              <span className={`${LOG_COLORS[log.level] ?? "text-zinc-400"} break-words`}>
                {log.message}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────

const isTerminal = (s?: string) => s === "completed" || s === "failed";

export default function LiveAgentLoop() {
  const { data: scans } = useListScans({
    query: { queryKey: getListScansQueryKey(), refetchInterval: 5000 },
  });

  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (!scans?.length || selectedId !== null) return;
    const running = scans.find(s =>
      ["thinking", "executing", "correcting", "pending"].includes(s.status)
    );
    setSelectedId((running ?? scans[0]).id);
  }, [scans, selectedId]);

  const scanId = selectedId ?? 0;

  const { data: scan } = useGetScan(scanId, {
    query: {
      enabled: !!scanId,
      queryKey: getGetScanQueryKey(scanId),
      refetchInterval: q => (isTerminal(q.state?.data?.status) ? false : 2000),
    },
  });

  const { data: logs } = useGetScanLogs(scanId, {
    query: {
      enabled: !!scanId,
      queryKey: getGetScanLogsQueryKey(scanId),
      refetchInterval: () => (isTerminal(scan?.status) ? false : 1500),
    },
  });

  const phases = getAgentPhases(scan?.status, logs);
  const isLive = scan && !isTerminal(scan.status);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-zinc-600 text-xs font-mono mb-2">
            <Link href="/">
              <button className="flex items-center gap-1 hover:text-primary transition-colors">
                <ArrowLeft className="w-3 h-3" />
                WAR_ROOM
              </button>
            </Link>
            <span>/</span>
            <span className="text-zinc-500">LIVE_AGENT_LOOP</span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-black font-mono tracking-tight">LIVE AGENT LOOP</h1>
            {isLive && (
              <span className="flex items-center gap-1.5 text-[11px] font-mono font-bold tracking-widest animate-pulse" style={{ color: NEON }}>
                <Radio className="w-3 h-3" /> LIVE
              </span>
            )}
            {scan?.status === "completed" && (
              <span className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-emerald-400 tracking-widest">
                <CheckCircle2 className="w-3 h-3" /> COMPLETED
              </span>
            )}
            {scan?.status === "failed" && (
              <span className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-red-400 tracking-widest">
                <XCircle className="w-3 h-3" /> FAILED
              </span>
            )}
          </div>

          {scan && (
            <p className="text-zinc-600 text-xs font-mono truncate max-w-md">{scan.repoUrl}</p>
          )}
        </div>

        {/* Scan selector */}
        {!!scans?.length && (
          <div className="flex flex-col gap-1 sm:items-end shrink-0">
            <label className="text-[9px] font-mono text-zinc-700 uppercase tracking-widest">Scan</label>
            <select
              className="bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-xs rounded px-3 py-1.5 focus:outline-none focus:border-primary cursor-pointer w-full sm:w-auto"
              value={selectedId ?? ""}
              onChange={e => setSelectedId(Number(e.target.value))}
            >
              {scans.map(s => {
                let repoShort = s.repoUrl;
                try { repoShort = new URL(s.repoUrl).pathname.slice(1); } catch {}
                return (
                  <option key={s.id} value={s.id}>
                    #{s.id} — {s.status.toUpperCase()} — {repoShort}
                  </option>
                );
              })}
            </select>
          </div>
        )}
      </div>

      {/* Empty state */}
      {!scans?.length && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-zinc-700 font-mono text-sm">
          <Radio className="w-8 h-8 animate-pulse" />
          <p>
            No scans yet —{" "}
            <Link href="/scan/new">
              <span className="text-primary hover:underline cursor-pointer">[NEW_SCAN]</span>
            </Link>
          </p>
        </div>
      )}

      {/* Pipeline connector (desktop only) */}
      {scan && (
        <div className="hidden md:grid grid-cols-3 gap-4 -mb-3 px-1">
          {AGENTS.map((agent, i) => {
            const phase = phases[agent.key];
            const isActive = phase === "active";
            const isDone   = phase === "done";
            return (
              <div key={agent.key} className="flex items-center">
                <div
                  className="w-2.5 h-2.5 rounded-full border-2 shrink-0 transition-all duration-500"
                  style={{
                    borderColor: isActive ? NEON : isDone ? "#10b981" : "#27272a",
                    background:  isActive ? `${NEON}55` : "transparent",
                    boxShadow:   isActive ? `0 0 12px ${NEON}aa` : "none",
                  }}
                />
                {i < AGENTS.length - 1 && (
                  <div
                    className="flex-1 h-px ml-1 transition-all duration-700"
                    style={{
                      background: isDone
                        ? `linear-gradient(90deg, #10b981, #27272a)`
                        : "#18181b",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Three agent cards */}
      {scan && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {AGENTS.map(agent => (
            <AgentCard
              key={agent.key}
              agent={agent}
              phase={phases[agent.key]}
              logs={logs ?? []}
            />
          ))}
        </div>
      )}

      {/* Error banner */}
      {scan?.status === "failed" && scan.errorMessage && (
        <div
          className="rounded-lg border px-4 py-3 font-mono text-xs"
          style={{ borderColor: "#ef444455", background: "#ef44440d", color: "#fca5a5" }}
        >
          <span className="text-red-500 font-black tracking-widest mr-2">PIPELINE_ERROR:</span>
          {scan.errorMessage}
          <Link href={`/scan/${scan.id}`}>
            <span className="text-primary hover:underline cursor-pointer ml-3">[VIEW SCAN →]</span>
          </Link>
        </div>
      )}

      {/* Success banner */}
      {scan?.status === "completed" && (
        <div
          className="rounded-lg border px-4 py-3 font-mono text-xs flex items-center justify-between gap-4"
          style={{ borderColor: `${NEON}55`, background: `${NEON}0a`, color: NEON }}
        >
          <span>✓ All agents completed successfully.</span>
          <Link href={`/scan/${scan.id}`}>
            <span className="hover:underline cursor-pointer opacity-70 hover:opacity-100 transition-opacity whitespace-nowrap">
              [VIEW FULL REPORT →]
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
