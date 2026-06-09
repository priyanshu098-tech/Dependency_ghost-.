import { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle2, FileCode, Copy, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const SEVERITY_STYLES: Record<string, { badge: string; border: string; glow: string }> = {
  critical: {
    badge: "bg-red-500/10 text-red-400 border-red-500/30",
    border: "border-red-500/30",
    glow: "shadow-[0_0_12px_rgba(239,68,68,0.15)]",
  },
  high: {
    badge: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    border: "border-orange-500/30",
    glow: "shadow-[0_0_12px_rgba(249,115,22,0.12)]",
  },
  medium: {
    badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    border: "border-yellow-500/30",
    glow: "shadow-[0_0_12px_rgba(234,179,8,0.10)]",
  },
  low: {
    badge: "bg-zinc-700/30 text-zinc-400 border-zinc-600/30",
    border: "border-zinc-600/30",
    glow: "",
  },
};

// ─── Word-level diff ─────────────────────────────────────────────────────────
// Computes a simple word-level diff between two strings using LCS.
// Returns segments tagged as "same" | "removed" | "added".

type DiffSegment = { text: string; type: "same" | "removed" | "added" };

function wordDiff(before: string, after: string): { left: DiffSegment[]; right: DiffSegment[] } {
  const wordsA = before.split(/(\s+)/);
  const wordsB = after.split(/(\s+)/);

  // LCS table
  const m = wordsA.length;
  const n = wordsB.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = wordsA[i - 1] === wordsB[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const left: DiffSegment[] = [];
  const right: DiffSegment[] = [];
  let i = m, j = n;
  const ops: Array<"same" | "removed" | "added"> = [];
  const segs: Array<{ a?: string; b?: string }> = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && wordsA[i - 1] === wordsB[j - 1]) {
      segs.unshift({ a: wordsA[i - 1], b: wordsB[j - 1] });
      ops.unshift("same");
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      segs.unshift({ b: wordsB[j - 1] });
      ops.unshift("added");
      j--;
    } else {
      segs.unshift({ a: wordsA[i - 1] });
      ops.unshift("removed");
      i--;
    }
  }

  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    const seg = segs[k];
    if (op === "same") {
      left.push({ text: seg.a!, type: "same" });
      right.push({ text: seg.b!, type: "same" });
    } else if (op === "removed") {
      left.push({ text: seg.a!, type: "removed" });
    } else {
      right.push({ text: seg.b!, type: "added" });
    }
  }

  return { left, right };
}

// ─── Inline highlighted text ──────────────────────────────────────────────────

function HighlightedText({ segments }: { segments: DiffSegment[] }) {
  return (
    <span>
      {segments.map((seg, i) => {
        if (seg.type === "same") return <span key={i}>{seg.text}</span>;
        if (seg.type === "removed")
          return (
            <span key={i} className="bg-red-500/25 text-red-300 rounded-sm px-0.5">
              {seg.text}
            </span>
          );
        return (
          <span key={i} className="bg-emerald-500/25 text-emerald-300 rounded-sm px-0.5">
            {seg.text}
          </span>
        );
      })}
    </span>
  );
}

// ─── Patch code with copy button ──────────────────────────────────────────────

function PatchViewer({ patch }: { patch: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(patch);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = patch.split("\n");

  const lineColor = (line: string) => {
    const t = line.trimStart();
    if (t.startsWith("//") || t.startsWith("#")) return "text-zinc-500 italic";
    if (t.startsWith("export") || t.startsWith("function") || t.startsWith("const") || t.startsWith("class"))
      return "text-blue-300";
    if (t.startsWith("return")) return "text-purple-300";
    if (t.startsWith("import")) return "text-yellow-300/80";
    return "text-zinc-200";
  };

  return (
    <div className="relative group" data-testid="patch-viewer">
      <div className="flex items-center justify-between bg-zinc-900/80 border border-zinc-700/50 px-3 py-1.5 text-[10px] font-mono text-zinc-500 uppercase tracking-widest rounded-t">
        <span className="flex items-center gap-2">
          <FileCode className="w-3 h-3" />
          compatibility_patch.js
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-zinc-500 hover:text-primary transition-colors"
          data-testid="button-copy-patch"
          aria-label="Copy patch"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? "COPIED" : "COPY"}
        </button>
      </div>
      <div className="bg-black border border-zinc-700/50 border-t-0 rounded-b overflow-x-auto max-h-64 overflow-y-auto">
        <table className="w-full text-[11px] font-mono border-collapse">
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="hover:bg-white/[0.02] group/row">
                <td className="select-none text-right text-zinc-700 pr-3 pl-3 py-0.5 w-8 border-r border-zinc-800 group-hover/row:text-zinc-600 align-top">
                  {idx + 1}
                </td>
                <td className={`pl-4 pr-3 py-0.5 whitespace-pre ${lineColor(line)}`}>
                  {line || " "}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main mismatch card ───────────────────────────────────────────────────────

export type MismatchData = {
  id: number;
  dependency: string;
  functionName: string;
  expected: string;
  actual: string;
  severity: string;
  patch?: string | null;
  patchStatus?: string | null;
};

export function MismatchCard({ mismatch, index }: { mismatch: MismatchData; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEVERITY_STYLES[mismatch.severity] ?? SEVERITY_STYLES.low;
  const { left, right } = wordDiff(mismatch.expected, mismatch.actual);

  return (
    <div
      className={`border bg-zinc-950/80 rounded transition-all duration-200 ${sev.border} ${expanded ? sev.glow : ""}`}
      data-testid={`card-mismatch-${mismatch.id}`}
    >
      {/* ── Header ── */}
      <button
        className="w-full text-left p-3 flex items-start gap-3 hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded((v) => !v)}
        data-testid={`button-expand-mismatch-${mismatch.id}`}
        aria-expanded={expanded}
      >
        <span className="font-mono text-zinc-500 text-[10px] mt-0.5 shrink-0 w-5">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-bold text-primary truncate" data-testid={`text-dependency-${mismatch.id}`}>
              {mismatch.dependency}
            </span>
            <span className="text-zinc-500 font-mono text-xs shrink-0">.</span>
            <span className="font-mono text-xs text-zinc-300 shrink-0" data-testid={`text-function-${mismatch.id}`}>
              {mismatch.functionName}()
            </span>
          </div>
          <div className="mt-1 text-[10px] font-mono text-zinc-500 truncate">
            {mismatch.expected} → {mismatch.actual}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {mismatch.patchStatus === "verified" && (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" data-testid={`icon-patch-verified-${mismatch.id}`} />
          )}
          <Badge variant="outline" className={`text-[9px] uppercase font-mono h-4 px-1.5 ${sev.badge}`} data-testid={`badge-severity-${mismatch.id}`}>
            {mismatch.severity}
          </Badge>
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
            : <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />}
        </div>
      </button>

      {/* ── Expanded diff + patch ── */}
      {expanded && (
        <div className="border-t border-zinc-800/60 p-3 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">

          {/* Side-by-side diff */}
          <div data-testid={`diff-viewer-${mismatch.id}`}>
            <div className="text-[10px] uppercase tracking-widest font-mono text-zinc-500 mb-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 inline-block" />
              behavior_diff
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 border border-zinc-800 rounded overflow-hidden text-xs font-mono">
              {/* Before */}
              <div className="bg-red-950/10">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-950/20 border-b border-zinc-800">
                  <span className="text-red-400 font-bold text-[10px] tracking-wider">− BEFORE</span>
                  <span className="text-zinc-600 text-[9px] ml-auto">expected</span>
                </div>
                <div className="p-3 text-red-300/90 leading-relaxed">
                  <HighlightedText segments={left} />
                </div>
              </div>
              {/* After */}
              <div className="bg-emerald-950/10 border-t sm:border-t-0 sm:border-l border-zinc-800">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-950/20 border-b border-zinc-800">
                  <span className="text-emerald-400 font-bold text-[10px] tracking-wider">+ AFTER</span>
                  <span className="text-zinc-600 text-[9px] ml-auto">actual</span>
                </div>
                <div className="p-3 text-emerald-300/90 leading-relaxed">
                  <HighlightedText segments={right} />
                </div>
              </div>
            </div>
          </div>

          {/* Patch viewer */}
          {mismatch.patch ? (
            <div>
              <div className="text-[10px] uppercase tracking-widest font-mono mb-2 flex items-center gap-2">
                {mismatch.patchStatus === "verified" ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">patch_verified</span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                    <span className="text-primary">patch_generated</span>
                  </>
                )}
              </div>
              <PatchViewer patch={mismatch.patch} />
            </div>
          ) : (
            <div className="text-[10px] font-mono text-zinc-600 italic">
              No patch generated yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
