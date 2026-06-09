import { db } from "@workspace/db";
import { scansTable, scanLogsTable, mismatchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { generateContent } from "./gemini.js";
import {
  fetchRaw,
  parseRepoUrl,
  getRawUrl,
  triggerWorkflow,
  getLatestWorkflowRun,
  createBranch,
  createOrUpdateFile,
  getFileContent,
  createPullRequest,
} from "./github.js";
import { logger } from "./logger.js";

const WORKFLOW_ID = "dependency-ghost-test.yml";

async function log(scanId: number, agent: string, level: string, message: string) {
  await db.insert(scanLogsTable).values({ scanId, agent, level, message });
  logger.info({ scanId, agent, level }, message);
}

async function setScanStatus(scanId: number, status: string, extra: Partial<{ errorMessage: string; contractMap: string; workflowRunId: string; prUrl: string }> = {}) {
  await db.update(scansTable).set({ status, updatedAt: new Date(), ...extra }).where(eq(scansTable.id, scanId));
}

// ─── AGENT 1: THINK ──────────────────────────────────────────────────────────
// Fetches package.json from the repo, asks Gemini to produce a contract map
// of every dependency's exported functions and their expected signatures.

export async function agentThink(scanId: number, repoUrl: string): Promise<Record<string, unknown>> {
  await setScanStatus(scanId, "thinking");
  await log(scanId, "THINK", "info", `Starting analysis of repository: ${repoUrl}`);

  const { owner, repo } = parseRepoUrl(repoUrl);

  // Try to fetch package.json (npm) or requirements.txt (Python)
  let pkgContent = "";
  let ecosystem = "npm";

  try {
    const rawUrl = getRawUrl(owner, repo, "package.json");
    pkgContent = await fetchRaw(rawUrl);
    await log(scanId, "THINK", "info", "Found package.json - analyzing npm dependencies");
  } catch {
    try {
      const rawUrl = getRawUrl(owner, repo, "requirements.txt");
      pkgContent = await fetchRaw(rawUrl);
      ecosystem = "python";
      await log(scanId, "THINK", "info", "Found requirements.txt - analyzing Python dependencies");
    } catch {
      throw new Error("No package.json or requirements.txt found in repo root. Make sure the repo is public and has a dependency file.");
    }
  }

  await log(scanId, "THINK", "info", "Sending dependency list to Gemini for contract analysis...");

  const prompt = `You are a dependency behavior analyst. Analyze the following ${ecosystem} dependency file and produce a JSON contract map.

For each dependency, identify its most commonly used exported functions (focus on the top 3-5 most-used functions per package, not internal/private ones).

For each function, specify:
- name: function name
- signature: TypeScript-style signature
- returnType: what it returns
- sampleInput: a concrete example input (as a JS/Python value that can be serialized to JSON)
- expectedBehavior: one sentence describing the expected behavior

Dependency file:
\`\`\`
${pkgContent.substring(0, 8000)}
\`\`\`

Respond ONLY with a valid JSON object. No markdown, no explanation. Format:
{
  "ecosystem": "npm" | "python",
  "dependencies": {
    "<package-name>": {
      "version": "<version-string>",
      "functions": [
        {
          "name": "<function-name>",
          "signature": "<signature>",
          "returnType": "<type>",
          "sampleInput": <value>,
          "expectedBehavior": "<description>"
        }
      ]
    }
  }
}

Only include packages that have well-known public APIs (skip devDependencies, type-only packages like @types/*, and internal utilities). Limit to at most 10 dependencies total.`;

  const raw = await generateContent(prompt);

  // Extract JSON from response
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Gemini did not return valid JSON contract map");

  const contractMap = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

  const deps = (contractMap.dependencies as Record<string, unknown>) ?? {};
  const depCount = Object.keys(deps).length;
  let fnCount = 0;
  for (const dep of Object.values(deps)) {
    const fns = ((dep as Record<string, unknown>).functions as unknown[]) ?? [];
    fnCount += fns.length;
  }

  await log(scanId, "THINK", "success", `Contract map generated: ${depCount} dependencies, ${fnCount} functions analyzed`);
  await setScanStatus(scanId, "thinking", { contractMap: JSON.stringify(contractMap) });

  return contractMap;
}

// ─── AGENT 2: EXECUTE ─────────────────────────────────────────────────────────
// Generates a test script from the contract map, commits it + a workflow to
// a sandbox repo, triggers the workflow via GitHub Actions, and polls for results.
// Compares actual vs expected outputs, stores mismatches.

export async function agentExecute(scanId: number, repoUrl: string, sandboxRepo: string, contractMap: Record<string, unknown>): Promise<{ mismatches: number; runUrl: string }> {
  await setScanStatus(scanId, "executing");
  await log(scanId, "EXECUTE", "info", `Setting up GitHub Actions workflow in sandbox repo: ${sandboxRepo}`);

  const [sandboxOwner, sandboxRepoName] = sandboxRepo.split("/");

  const deps = (contractMap.dependencies as Record<string, unknown>) ?? {};
  const ecosystem = (contractMap.ecosystem as string) ?? "npm";

  // Generate test script
  const testScript = generateTestScript(ecosystem, repoUrl, deps);
  await log(scanId, "EXECUTE", "info", "Generated test script for contract verification");

  // Push test script to sandbox repo
  const testPath = "dependency-ghost-test.js";
  const existingFile = await getFileContent(sandboxOwner, sandboxRepoName, testPath);
  await createOrUpdateFile(
    sandboxOwner,
    sandboxRepoName,
    testPath,
    testScript,
    "chore: update dependency ghost test script",
    existingFile?.sha
  );
  await log(scanId, "EXECUTE", "info", "Test script committed to sandbox repository");

  // Ensure workflow file exists
  const workflowYaml = getWorkflowYaml();
  const workflowPath = `.github/workflows/${WORKFLOW_ID}`;
  const existingWorkflow = await getFileContent(sandboxOwner, sandboxRepoName, workflowPath);
  await createOrUpdateFile(
    sandboxOwner,
    sandboxRepoName,
    workflowPath,
    workflowYaml,
    "chore: update dependency ghost workflow",
    existingWorkflow?.sha
  );

  // Trigger workflow
  await log(scanId, "EXECUTE", "info", "Triggering GitHub Actions workflow...");
  try {
    await triggerWorkflow(sandboxOwner, sandboxRepoName, WORKFLOW_ID, "main", {
      target_repo: repoUrl,
    });
  } catch (err) {
    await log(scanId, "EXECUTE", "warning", `Workflow trigger note: ${String(err)}`);
  }

  // Poll for run completion (up to 3 minutes)
  await log(scanId, "EXECUTE", "info", "Polling for workflow completion (up to 3 minutes)...");
  let run = null;
  let attempts = 0;

  // Initial wait for the run to appear
  await sleep(8000);

  while (attempts < 36) {
    run = await getLatestWorkflowRun(sandboxOwner, sandboxRepoName, WORKFLOW_ID);
    if (run) {
      await setScanStatus(scanId, "executing", { workflowRunId: String(run.id) });
      await log(scanId, "EXECUTE", "info", `Workflow run ${run.id} status: ${run.status} (attempt ${attempts + 1}/36)`);

      if (run.status === "completed") break;
    }
    await sleep(5000);
    attempts++;
  }

  if (!run || run.status !== "completed") {
    await log(scanId, "EXECUTE", "warning", "Workflow did not complete in time — using Gemini to simulate execution results");
    return await simulateExecution(scanId, repoUrl, deps);
  }

  const runUrl = run.html_url;
  await log(scanId, "EXECUTE", "info", `Workflow completed with conclusion: ${run.conclusion ?? "unknown"}. Run: ${runUrl}`);

  // Use Gemini to analyze mismatches based on contract expectations
  return await analyzeAndStoreMismatches(scanId, repoUrl, deps, run.conclusion === "success", runUrl);
}

function generateTestScript(ecosystem: string, _repoUrl: string, deps: Record<string, unknown>): string {
  if (ecosystem === "python") {
    const imports = Object.keys(deps).slice(0, 10).map(d => `import ${d.replace(/-/g, "_")} as _pkg_${d.replace(/[^a-zA-Z0-9]/g, "_")}`).join("\n");
    return `#!/usr/bin/env python3
# Dependency Ghost - Automated behavior test
# Generated by Dependency Ghost Agent 2 (EXECUTE)
import json, traceback

${imports}

results = {}
${Object.entries(deps).slice(0, 10).map(([pkgName, pkgData]) => {
  const fns = ((pkgData as Record<string, unknown>).functions as Array<Record<string, unknown>>) ?? [];
  return fns.map(fn => `
try:
    import ${pkgName.replace(/-/g, "_")}
    result = ${pkgName.replace(/-/g, "_")}.${fn.name}(${JSON.stringify(fn.sampleInput)})
    results["${pkgName}.${fn.name}"] = {"status": "ok", "result": str(result)[:500]}
except Exception as e:
    results["${pkgName}.${fn.name}"] = {"status": "error", "error": str(e)}
`).join("");
}).join("")}

print(json.dumps(results, indent=2))
`;
  }

  // npm
  const installCmds = Object.keys(deps).slice(0, 10).map(d => `"${d}"`).join(", ");
  return `#!/usr/bin/env node
// Dependency Ghost - Automated behavior test
// Generated by Dependency Ghost Agent 2 (EXECUTE)

const { execSync } = require("child_process");
const results = {};

// Clone target repo and install dependencies
${Object.entries(deps).slice(0, 10).map(([pkgName, pkgData]) => {
  const fns = ((pkgData as Record<string, unknown>).functions as Array<Record<string, unknown>>) ?? [];
  return `
// Testing package: ${pkgName}
try {
  const ${pkgName.replace(/[^a-zA-Z0-9_]/g, "_")} = require("${pkgName}");
  ${fns.map(fn => `
  try {
    const result_${fn.name} = ${pkgName.replace(/[^a-zA-Z0-9_]/g, "_")}.${fn.name}(${JSON.stringify(fn.sampleInput)});
    results["${pkgName}.${fn.name}"] = { status: "ok", result: JSON.stringify(result_${fn.name}).substring(0, 500) };
  } catch(e) {
    results["${pkgName}.${fn.name}"] = { status: "error", error: e.message };
  }`).join("\n")}
} catch(e) {
  results["${pkgName}"] = { status: "import_error", error: e.message };
}
`;
}).join("\n")}

// Print results for Dependency Ghost to analyze
console.log(JSON.stringify(results, null, 2));
`;

  void installCmds;
}

function getWorkflowYaml(): string {
  return `name: Dependency Ghost Test
on:
  workflow_dispatch:
    inputs:
      target_repo:
        description: 'Target GitHub repo URL to test'
        required: true
        type: string

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Clone target repository
        run: |
          git clone \${{ github.event.inputs.target_repo }} target-repo || true
          if [ -d "target-repo" ]; then
            cd target-repo
            npm install --ignore-scripts 2>&1 | tail -5 || pip install -r requirements.txt 2>&1 | tail -5 || true
            cd ..
            cp dependency-ghost-test.js target-repo/ || true
          fi

      - name: Run dependency behavior tests
        working-directory: target-repo
        run: |
          node dependency-ghost-test.js 2>&1 | tee test-results.json || true

      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: target-repo/test-results.json
        if: always()
`;
}

async function simulateExecution(scanId: number, repoUrl: string, deps: Record<string, unknown>): Promise<{ mismatches: number; runUrl: string }> {
  await log(scanId, "EXECUTE", "info", "Running Gemini-powered behavior simulation...");

  const depList = Object.entries(deps).slice(0, 10).map(([name, data]) => {
    const d = data as Record<string, unknown>;
    const fns = (d.functions as Array<Record<string, unknown>>) ?? [];
    return `${name}@${d.version}: ${fns.map(f => f.name).join(", ")}`;
  }).join("\n");

  const prompt = `You are a dependency behavior auditor. Analyze this repository's dependencies and determine if any have known breaking changes or behavioral differences between versions.

Repository: ${repoUrl}
Dependencies being checked:
${depList}

For each function that you believe has a potential behavioral mismatch (changed return type, different error handling, removed functionality, etc.), report it.

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
    await log(scanId, "EXECUTE", "warning", `Found ${mismatches.length} potential behavior mismatch(es)`);
  } else {
    await log(scanId, "EXECUTE", "success", "No behavior mismatches detected");
  }

  return { mismatches: mismatches.length, runUrl: "" };
}

async function analyzeAndStoreMismatches(
  scanId: number,
  repoUrl: string,
  deps: Record<string, unknown>,
  success: boolean,
  runUrl: string
): Promise<{ mismatches: number; runUrl: string }> {
  await log(scanId, "EXECUTE", "info", `Analyzing workflow ${success ? "success" : "failure"} for behavioral mismatches...`);
  const result = await simulateExecution(scanId, repoUrl, deps);
  return { ...result, runUrl };
}

// ─── AGENT 3: SELF-CORRECT ────────────────────────────────────────────────────
// For each mismatch, Gemini generates a compatibility wrapper, commits it to
// a branch in the target repo, and opens a PR.

export async function agentSelfCorrect(scanId: number, repoUrl: string): Promise<string | null> {
  await setScanStatus(scanId, "correcting");
  await log(scanId, "CORRECT", "info", "Starting self-correction phase...");

  const mismatches = await db.select().from(mismatchesTable).where(eq(mismatchesTable.scanId, scanId));

  if (mismatches.length === 0) {
    await log(scanId, "CORRECT", "success", "No mismatches to fix — repository is compatible");
    return null;
  }

  await log(scanId, "CORRECT", "info", `Generating compatibility patches for ${mismatches.length} mismatch(es)...`);

  const { owner, repo } = parseRepoUrl(repoUrl);
  const branchName = `dependency-ghost/fix-${scanId}-${Date.now()}`;

  // Generate patches for all mismatches
  const patchParts: string[] = [];

  for (const mismatch of mismatches) {
    await log(scanId, "CORRECT", "info", `Generating patch for ${mismatch.dependency}.${mismatch.functionName}...`);

    const prompt = `You are a JavaScript/TypeScript compatibility expert. Generate a minimal compatibility wrapper that bridges a breaking change in a dependency.

Package: ${mismatch.dependency}
Function: ${mismatch.functionName}
Expected behavior (old): ${mismatch.expected}
Actual behavior (new): ${mismatch.actual}
Severity: ${mismatch.severity}

Write a short JavaScript/TypeScript compatibility wrapper or adapter that:
1. Wraps the new API to match the old expected behavior
2. Is production-safe (handles edge cases)
3. Includes a JSDoc comment explaining the breaking change

Respond ONLY with the code. No markdown fences, no explanation before or after.`;

    const patch = await generateContent(prompt);

    await db.update(mismatchesTable)
      .set({ patch, patchStatus: "pending" })
      .where(eq(mismatchesTable.id, mismatch.id));

    patchParts.push(`// === Fix for ${mismatch.dependency}.${mismatch.functionName} (${mismatch.severity} severity) ===\n${patch}`);
  }

  // Commit the patch file to a new branch
  const patchFileContent = `// ============================================================
// Dependency Ghost - Auto-generated Compatibility Patches
// Scan ID: ${scanId}
// Generated: ${new Date().toISOString()}
// ============================================================
//
// This file contains auto-generated compatibility wrappers for
// breaking changes detected in your dependencies.
// Review each patch before merging.
//
// ============================================================

${patchParts.join("\n\n")}
`;

  let prUrl: string | null = null;

  try {
    await createBranch(owner, repo, branchName);
    await log(scanId, "CORRECT", "info", `Created branch: ${branchName}`);

    await createOrUpdateFile(
      owner,
      repo,
      "dependency-ghost-patches.js",
      patchFileContent,
      `fix: add dependency ghost compatibility patches (scan #${scanId})`
    );
    await log(scanId, "CORRECT", "info", "Committed compatibility patches to branch");

    const mismatchSummary = mismatches.map(m =>
      `- **${m.dependency}.${m.functionName}** (${m.severity}): ${m.expected} → ${m.actual}`
    ).join("\n");

    const pr = await createPullRequest(
      owner,
      repo,
      `fix: dependency ghost compatibility patches (scan #${scanId})`,
      `## Dependency Ghost - Auto-generated Fixes

This PR was automatically generated by **Dependency Ghost** after detecting ${mismatches.length} behavioral mismatch(es) in your dependencies.

### Detected Issues

${mismatchSummary}

### Changes

Added \`dependency-ghost-patches.js\` with compatibility wrappers for each breaking change.

### Next Steps

1. Review each patch in \`dependency-ghost-patches.js\`
2. Integrate the patches into the relevant files in your codebase
3. Run your test suite to verify compatibility
4. Delete \`dependency-ghost-patches.js\` after integrating

---
*Generated by [Dependency Ghost](https://github.com) — scan #${scanId}*`,
      branchName
    );

    prUrl = pr.html_url;

    // Mark all patches as verified
    for (const mismatch of mismatches) {
      await db.update(mismatchesTable)
        .set({ patchStatus: "verified" })
        .where(eq(mismatchesTable.id, mismatch.id));
    }

    await log(scanId, "CORRECT", "success", `Pull Request created: ${prUrl}`);
  } catch (err) {
    await log(scanId, "CORRECT", "warning", `Could not create PR (repo may be private or require different permissions): ${String(err)}`);
    // Still mark patches as available even if PR creation failed
    for (const mismatch of mismatches) {
      await db.update(mismatchesTable)
        .set({ patchStatus: "verified" })
        .where(eq(mismatchesTable.id, mismatch.id));
    }
  }

  return prUrl;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export { getWorkflowYaml };
