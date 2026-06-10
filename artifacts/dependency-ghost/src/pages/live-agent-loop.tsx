import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import {
  useListScans, getListScansQueryKey,
  useGetScan, getGetScanQueryKey,
  useGetScanLogs, getGetScanLogsQueryKey,
} from "@workspace/api-client-react";
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Clock, Radio } from "lucide-react";

// ─── Agent config ──────────────────────────────────────────────────────────────

const AGENTS = [
  {
    key: "THINK",
    emoji: "🧠",
    label: "THINK",
    subtitle: "Contract Map Generation",
    activeStatus: "thinking",
    idleColor: "#3b82f6",   // blue
  },
  {
    key: "EXECUTE",
    emoji: "⚙️",
    label: "EXECUTE",
    subtitle: "Behavioral Test Execution",
    activeStatus: "executing",
    idleColor: "#f59e0b",   // amber
  },
  {
    key: "CORRECT",
    emoji: "🔧",
    label: "SELF-CORRECT",
    subtitle: "Patch Generation & PR",
    activeStatus: "correcting",
    idleColor: "#a855f7",   // purple
  },
] as const;

type AgentPhase = "pending" | "active" | "done" | "error";

const NEON = "#39FF14";
const NEON_GLOW = `0 0 0 1px ${NEON}99, 0 0 24px ${NEON}55, 0 0 55px ${NEON}22`;

const STATUS_FLOW = ["pending", "thinking", "executing", "correcting", "completed"];

// ─── Derive per-agent phase from scan.status ───────────────────────────────────

function getAgentPhases(
  status: string | undefined,
  logs: Array<{ agent: string; level: string }> | undefined
): Record<string, AgentPhase> {
  const map: Record<string, AgentPhase> = {
    THINK: "pending", EXECUTE: "pending", CORRECT: "pending",
  };

  if (!status) return map;

  if (status === "thinking")   { map.THINK = "active"; }
  if (status === "executing")  { map.THINK = "done";   map.EXECUTE = "active"; }
  if (status === "correcting") { map.THINK = "done";   map.EXECUTE = "done";   map.CORRECT = "active"; }
  if (status === "completed")  { map.THINK = "done";   map.EXECUTE = "done";   map.CORRECT = "done"; }

  if (status === "failed") {
    const order = ["THINK", "EXECUTE", "CORRECT"];
    // Prefer an explicit non-SYSTEM error log; fall back to the last agent that has any logs
    const lastErr = [...(logs ?? [])].reverse().find((l) => l.level === "error" && l.agent !== "SYSTEM");
    const agentsWithLogs = order.filter((a) => (logs ?? []).some((l) => l.agent === a));
    const lastActiveAgent = agentsWithLogs[agentsWithLogs.length - 1] ?? "THINK";
    const failedAgent = lastErr?.agent ?? lastActiveAgent;
    const failIdx = order.indexOf(failedAgent);
    order.forEach((k, i) => {
      if (i < failIdx)        map[k] = "done";
      else if (i === failIdx) map[k] = "error";
    });
  }

  return map;
}

// ─── Log level colours ──────────────────────────────────────────────────────────

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
  agent: typeof AGENTS[number];
  phase: AgentPhase;
  logs: Array<{ id: number; agent: string; level: string; message: string; createdAt: string }>;
}) {
  const logsEndRef = useRef<HTMLDivElement>(null);
  const agentLogs = logs.filter((l) => l.agent === agent.key);

  useEffect(() => {
    if (phase === "active") {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [agentLogs.length, phase]);

  const isActive  = phase === "active";
  const isDone    = phase === "done";
  const isError   = phase === "error";
  const isPending = phase === "pending";

  const cardStyle: React.CSSProperties = isActive
    ? { boxShadow: NEON_GLOW, borderColor: NEON }
    : isError
    ? { boxShadow: "0 0 0 1px #ef444499, 0 0 24px #ef444430", borderColor: "#ef4444" }
    : isDone
    ? { borderColor: "#27272a" }
    : { borderColor: "#18181b", opacity: 0.55 };

  const headerGlow: React.CSSProperties = isActive
    ? { color: NEON, textShadow: `0 0 12px ${NEON}99` }
    : isError
    ? { color: "#ef4444" }
    : isDone
    ? { color: "#6ee7b7" }
    : { color: "#52525b" };

  return (
    <div
      className="flex flex-col rounded-lg border bg-zinc-950 overflow-hidden transition-all duration-500"
      style={cardStyle}
    >
      {/* ── Card header ── */}
      <div
        className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-zinc-900"
        style={{ background: isActive ? `${NEON}08` : "transparent" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl leading-none select-none">{agent.emoji}</span>
          <div>
            <div className="font-bold font-mono text-sm tracking-widest" style={headerGlow}>
              {agent.label}
            </div>
            <div className="text-[10px] font-mono text-zinc-600 mt-0.5 tracking-wider">
              {agent.subtitle}
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 mt-0.5">
          {isActive && (
            <div className="flex items-center gap-1.5">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: NEON }} />
              <span className="text-[10px] font-mono tracking-widest" style={{ color: NEON }}>
                RUNNING
              </span>
            </div>
          )}
          {isDone && (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] font-mono text-emerald-400 tracking-widest">DONE</span>
            </div>
          )}
          {isError && (
            <div className="flex items-center gap-1.5">
              <XCircle className="w-4 h-4 text-red-400" />
              <span className="text-[10px] font-mono text-red-400 tracking-widest">FAILED</span>
            </div>
          )}
          {isPending && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-zinc-700" />
              <span className="text-[10px] font-mono text-zinc-700 tracking-widest">STANDBY</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Log stream ── */}
      <div className="flex-1 overflow-y-auto min-h-[180px] max-h-[260px] p-3 space-y-1 font-mono text-[11px] leading-relaxed scrollbar-thin scrollbar-track-transparent scrollbar-thumb-zinc-800">
        {agentLogs.length === 0 ? (
          <div className="text-zinc-800 italic select-none pt-2 text-center">
            {isPending ? "awaiting activation…" : "no logs yet"}
          </div>
        ) : (
          agentLogs.map((log) => (
            <div key={log.id} className="flex gap-2 items-start">
              <span className="text-zinc-700 shrink-0 tabular-nums">
                {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span className={LOG_COLORS[log.level] ?? "text-zinc-400"}>
                {log.message}
              </span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>

      {/* ── Active pulse bar ── */}
      {isActive && (
        <div
          className="h-0.5 w-full animate-pulse"
          style={{ background: `linear-gradient(90deg, transparent, ${NEON}, transparent)` }}
        />
      )}
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

  // Auto-select: prefer active scan, else most recent
  useEffect(() => {
    if (!scans?.length || selectedId !== null) return;
    const running = scans.find((s) =>
      ["thinking", "executing", "correcting", "pending"].includes(s.status)
    );
    setSelectedId((running ?? scans[0]).id);
  }, [scans, selectedId]);

  const scanId = selectedId ?? 0;

  const { data: scan } = useGetScan(scanId, {
    query: {
      enabled: !!scanId,
      queryKey: getGetScanQueryKey(scanId),
      refetchInterval: (q) => (isTerminal(q.state?.data?.status) ? false : 2000),
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

      {/* ── Page header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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

          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold font-mono tracking-tight">LIVE AGENT LOOP</h1>
            {isLive ? (
              <span
                className="flex items-center gap-1.5 text-[11px] font-mono tracking-widest animate-pulse"
                style={{ color: NEON }}
              >
                <Radio className="w-3 h-3" />
                LIVE
              </span>
            ) : scan?.status === "completed" ? (
              <span className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-400 tracking-widest">
                <CheckCircle2 className="w-3 h-3" />
                COMPLETED
              </span>
            ) : scan?.status === "failed" ? (
              <span className="flex items-center gap-1.5 text-[11px] font-mono text-red-400 tracking-widest">
                <XCircle className="w-3 h-3" />
                FAILED
              </span>
            ) : null}
          </div>

          {scan && (
            <p className="text-zinc-600 text-xs font-mono truncate max-w-lg">{scan.repoUrl}</p>
          )}
        </div>

        {/* Scan selector */}
        {scans && scans.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-mono text-zinc-700 uppercase tracking-widest">
              Scan
            </label>
            <select
              className="bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-xs rounded px-3 py-1.5 focus:outline-none focus:border-primary focus:ring-0 cursor-pointer"
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(Number(e.target.value))}
            >
              {scans.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.id} — {s.status.toUpperCase()} — {new URL(s.repoUrl).pathname.slice(1)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── No scans empty state ── */}
      {!scans?.length && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-zinc-700 font-mono">
          <Radio className="w-8 h-8 animate-pulse" />
          <p className="text-sm">No scans yet — start one from <Link href="/scan/new"><span className="text-primary hover:underline cursor-pointer">[NEW_SCAN]</span></Link></p>
        </div>
      )}

      {/* ── Pipeline connector bar ── */}
      {scan && (
        <div className="relative hidden md:flex items-center justify-center gap-0 px-8 -my-2">
          {AGENTS.map((agent, i) => {
            const phase = phases[agent.key];
            const isActive = phase === "active";
            const isDone   = phase === "done";
            return (
              <div key={agent.key} className="flex items-center flex-1">
                {/* Node dot */}
                <div
                  className="w-3 h-3 rounded-full border-2 shrink-0 transition-all duration-500 mx-auto"
                  style={{
                    borderColor: isActive ? NEON : isDone ? "#6ee7b7" : "#27272a",
                    backgroundColor: isActive ? `${NEON}40` : "transparent",
                    boxShadow: isActive ? `0 0 10px ${NEON}80` : "none",
                  }}
                />
                {/* Connector line */}
                {i < AGENTS.length - 1 && (
                  <div
                    className="flex-1 h-px transition-all duration-700"
                    style={{
                      background: isDone || (phases[AGENTS[i + 1].key] !== "pending")
                        ? `linear-gradient(90deg, #6ee7b7, #27272a)`
                        : "#18181b",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Three agent cards ── */}
      {scan && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {AGENTS.map((agent) => (
            <AgentCard
              key={agent.key}
              agent={agent}
              phase={phases[agent.key]}
              logs={logs ?? []}
            />
          ))}
        </div>
      )}

      {/* ── Error message banner ── */}
      {scan?.status === "failed" && scan.errorMessage && (
        <div
          className="rounded border px-4 py-3 font-mono text-xs text-red-300 bg-red-950/30"
          style={{ borderColor: "#ef444450" }}
        >
          <span className="text-red-500 font-bold tracking-widest mr-2">PIPELINE_ERROR:</span>
          {scan.errorMessage}
          {" "}
          <Link href={`/scan/${scan.id}`}>
            <span className="text-primary hover:underline cursor-pointer ml-2">[VIEW SCAN →]</span>
          </Link>
        </div>
      )}

      {/* ── Completion banner ── */}
      {scan?.status === "completed" && (
        <div
          className="rounded border px-4 py-3 font-mono text-xs flex items-center justify-between"
          style={{ borderColor: `${NEON}40`, background: `${NEON}08`, color: NEON }}
        >
          <span>✓ All agents completed successfully.</span>
          <Link href={`/scan/${scan.id}`}>
            <span className="hover:underline cursor-pointer opacity-70 hover:opacity-100 transition-opacity">
              [VIEW FULL REPORT →]
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
