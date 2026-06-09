import { db } from "@workspace/db";
import { mismatchesTable, scanLogsTable } from "@workspace/db";
import { generateContent } from "../lib/gemini.js";

export async function simulateExecutionFallback(
  scanId: number,
  repoUrl: string,
  contractMap: Record<string, unknown>
): Promise<number> {
  await db.insert(scanLogsTable).values({
    scanId,
    agent: "EXECUTE",
    level: "info",
    message: "No sandbox repo configured — running Gemini-based behavior simulation",
  });

  const deps = (contractMap.dependencies as Record<string, unknown>) ?? {};
  const depList = Object.entries(deps).slice(0, 10).map(([name, data]) => {
    const d = data as Record<string, unknown>;
    const fns = (d.functions as Array<Record<string, unknown>>) ?? [];
    return `${name}@${d.version}: ${fns.map(f => f.name).join(", ")}`;
  }).join("\n");

  const prompt = `You are a dependency behavior auditor. Analyze this repository's dependencies and determine if any have known breaking changes or behavioral differences between versions.

Repository: ${repoUrl}
Dependencies being checked:
${depList}

For each function that you believe has a potential behavioral mismatch (changed return type, different error handling, removed functionality, changed default behavior, etc.), report it.

Respond with a JSON array. Each item should have:
{
  "dependency": "package-name",
  "functionName": "functionName",
  "expected": "what the old version returned/did",
  "actual": "what the new version returns/does",
  "severity": "low" | "medium" | "high" | "critical"
}

Be realistic — only report genuine known breaking changes. Return an empty array [] if no mismatches are found. Return ONLY the JSON array, no markdown.`;

  const raw = await generateContent(prompt);
  const jsonMatch = raw.match(/\[[\s\S]*\]/);

  let mismatches: Array<Record<string, string>> = [];
  if (jsonMatch) {
    try {
      mismatches = JSON.parse(jsonMatch[0]) as Array<Record<string, string>>;
    } catch {
      mismatches = [];
    }
  }

  for (const m of mismatches) {
    await db.insert(mismatchesTable).values({
      scanId,
      dependency: m.dependency ?? "unknown",
      functionName: m.functionName ?? "unknown",
      expected: m.expected ?? "",
      actual: m.actual ?? "",
      severity: (["low", "medium", "high", "critical"].includes(m.severity) ? m.severity : "medium"),
    });
  }

  if (mismatches.length > 0) {
    await db.insert(scanLogsTable).values({
      scanId,
      agent: "EXECUTE",
      level: "warning",
      message: `Simulation found ${mismatches.length} potential behavior mismatch(es)`,
    });
  } else {
    await db.insert(scanLogsTable).values({
      scanId,
      agent: "EXECUTE",
      level: "success",
      message: "Simulation found no behavior mismatches",
    });
  }

  return mismatches.length;
}
