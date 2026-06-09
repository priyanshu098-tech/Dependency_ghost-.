import type { Scan, ScanLog, Mismatch } from "@workspace/api-client-react";

export type ExportFormat = "json" | "markdown";

// ─── JSON export ──────────────────────────────────────────────────────────────

function buildJson(scan: Scan, logs: ScanLog[], mismatches: Mismatch[]): string {
  const report = {
    _meta: {
      tool: "Dependency Ghost",
      exportedAt: new Date().toISOString(),
      version: "1.0",
    },
    scan: {
      id: scan.id,
      repoUrl: scan.repoUrl,
      sandboxRepo: scan.sandboxRepo ?? null,
      status: scan.status,
      workflowRunId: scan.workflowRunId ?? null,
      prUrl: scan.prUrl ?? null,
      errorMessage: scan.errorMessage ?? null,
      createdAt: scan.createdAt,
      updatedAt: scan.updatedAt ?? null,
    },
    summary: {
      totalMismatches: mismatches.length,
      bySeverity: {
        critical: mismatches.filter((m) => m.severity === "critical").length,
        high:     mismatches.filter((m) => m.severity === "high").length,
        medium:   mismatches.filter((m) => m.severity === "medium").length,
        low:      mismatches.filter((m) => m.severity === "low").length,
      },
      patchesGenerated: mismatches.filter((m) => !!m.patch).length,
      patchesVerified:  mismatches.filter((m) => m.patchStatus === "verified").length,
    },
    mismatches: mismatches.map((m) => ({
      id: m.id,
      dependency: m.dependency,
      functionName: m.functionName,
      severity: m.severity,
      expected: m.expected,
      actual: m.actual,
      patch: m.patch ?? null,
      patchStatus: m.patchStatus ?? null,
      detectedAt: m.createdAt,
    })),
    agentLog: logs.map((l) => ({
      agent: l.agent,
      level: l.level,
      message: l.message,
      timestamp: l.createdAt,
    })),
  };

  return JSON.stringify(report, null, 2);
}

// ─── Markdown export ──────────────────────────────────────────────────────────

const SEVERITY_EMOJI: Record<string, string> = {
  critical: "🔴",
  high:     "🟠",
  medium:   "🟡",
  low:      "⚪",
};

function escMd(s: string): string {
  return s.replace(/[`|\\]/g, "\\$&");
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "long",
    timeStyle: "short",
  });
}

function buildMarkdown(scan: Scan, logs: ScanLog[], mismatches: Mismatch[]): string {
  const lines: string[] = [];

  const repoName = scan.repoUrl.replace(/^https?:\/\/github\.com\//, "");
  const critCount = mismatches.filter((m) => m.severity === "critical").length;
  const highCount = mismatches.filter((m) => m.severity === "high").length;
  const patched   = mismatches.filter((m) => !!m.patch).length;
  const verified  = mismatches.filter((m) => m.patchStatus === "verified").length;

  // Header
  lines.push(`# Dependency Ghost — Scan Report`);
  lines.push(`> **Scan #${scan.id}** · ${repoName} · ${fmtDate(scan.createdAt)}`);
  lines.push(``);

  // Status badge row
  const statusIcon = scan.status === "completed" ? "✅" : scan.status === "failed" ? "❌" : "⏳";
  lines.push(`**Status:** ${statusIcon} \`${scan.status.toUpperCase()}\``);
  if (scan.prUrl) lines.push(`**Pull Request:** [View PR on GitHub](${scan.prUrl})`);
  if (scan.sandboxRepo) lines.push(`**Sandbox:** \`${scan.sandboxRepo}\``);
  lines.push(``);

  // Summary
  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|------:|`);
  lines.push(`| Total mismatches | **${mismatches.length}** |`);
  lines.push(`| 🔴 Critical | ${critCount} |`);
  lines.push(`| 🟠 High | ${highCount} |`);
  lines.push(`| 🟡 Medium | ${mismatches.filter((m) => m.severity === "medium").length} |`);
  lines.push(`| ⚪ Low | ${mismatches.filter((m) => m.severity === "low").length} |`);
  lines.push(`| Patches generated | ${patched} |`);
  lines.push(`| Patches verified | ${verified} |`);
  lines.push(``);

  if (mismatches.length === 0) {
    lines.push(`✅ **No behavioral drift detected.** All dependency contracts match.`);
    lines.push(``);
  } else {
    // Mismatches overview table
    lines.push(`## Detected Mismatches`);
    lines.push(``);
    lines.push(`| # | Sev | Dependency | Function | Patch |`);
    lines.push(`|---|-----|------------|----------|-------|`);
    mismatches.forEach((m, i) => {
      const sev   = `${SEVERITY_EMOJI[m.severity] ?? ""} \`${m.severity}\``;
      const patch = m.patch ? (m.patchStatus === "verified" ? "✅ verified" : "⚙️ generated") : "—";
      lines.push(`| ${i + 1} | ${sev} | \`${escMd(m.dependency)}\` | \`${escMd(m.functionName)}()\` | ${patch} |`);
    });
    lines.push(``);

    // Per-mismatch detail
    lines.push(`## Mismatch Details`);
    lines.push(``);

    mismatches.forEach((m, i) => {
      lines.push(`### ${i + 1}. \`${m.dependency}.${m.functionName}()\``);
      lines.push(``);
      lines.push(`**Severity:** ${SEVERITY_EMOJI[m.severity] ?? ""} \`${m.severity.toUpperCase()}\``);
      lines.push(``);
      lines.push(`#### Before (expected)`);
      lines.push(`\`\`\``);
      lines.push(m.expected);
      lines.push(`\`\`\``);
      lines.push(``);
      lines.push(`#### After (actual)`);
      lines.push(`\`\`\``);
      lines.push(m.actual);
      lines.push(`\`\`\``);
      lines.push(``);

      if (m.patch) {
        const statusNote = m.patchStatus === "verified"
          ? " ✅ verified"
          : m.patchStatus === "failed"
          ? " ❌ failed verification"
          : "";
        lines.push(`#### Compatibility Patch${statusNote}`);
        lines.push(``);
        lines.push(`\`\`\`javascript`);
        lines.push(m.patch);
        lines.push(`\`\`\``);
        lines.push(``);
      }

      lines.push(`---`);
      lines.push(``);
    });
  }

  // Agent log
  lines.push(`## Agent Log`);
  lines.push(``);
  lines.push(`\`\`\``);
  logs.forEach((l) => {
    const ts = new Date(l.createdAt).toLocaleTimeString([], {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    lines.push(`[${ts}] [${l.agent.padEnd(7)}] ${l.message}`);
  });
  if (logs.length === 0) lines.push("(no log entries)");
  lines.push(`\`\`\``);
  lines.push(``);

  // Footer
  lines.push(`---`);
  lines.push(`*Generated by [Dependency Ghost](https://github.com) on ${new Date().toUTCString()}*`);

  return lines.join("\n");
}

// ─── Download trigger ─────────────────────────────────────────────────────────

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function exportScanReport(
  format: ExportFormat,
  scan: Scan,
  logs: ScanLog[],
  mismatches: Mismatch[],
): void {
  const slug    = scan.repoUrl.replace(/^https?:\/\/github\.com\//, "").replace(/\//g, "-");
  const datePart = new Date().toISOString().slice(0, 10);
  const base    = `dependency-ghost-scan-${scan.id}-${slug}-${datePart}`;

  if (format === "json") {
    triggerDownload(buildJson(scan, logs, mismatches), `${base}.json`, "application/json");
  } else {
    triggerDownload(buildMarkdown(scan, logs, mismatches), `${base}.md`, "text/markdown");
  }
}
