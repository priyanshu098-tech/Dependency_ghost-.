import { Router } from "express";
import { db } from "@workspace/db";
import { scansTable, scanLogsTable, mismatchesTable } from "@workspace/db";
import { eq, desc, count, and, sql } from "drizzle-orm";
import { z } from "zod";
import { agentThink, agentExecute, agentSelfCorrect } from "../lib/agents.js";
import { logger } from "../lib/logger.js";
import { sendScanWebhook } from "../lib/webhook.js";
import { getWebhookConfig } from "./settings.js";

const router = Router();

// GET /scans/stats — must come before /scans/:id to avoid param conflict
router.get("/scans/stats", async (req, res) => {
  try {
    const [totalScans] = await db.select({ count: count() }).from(scansTable);
    const [completedScans] = await db.select({ count: count() }).from(scansTable).where(eq(scansTable.status, "completed"));
    const [totalMismatches] = await db.select({ count: count() }).from(mismatchesTable);
    const [fixedMismatches] = await db.select({ count: count() }).from(mismatchesTable).where(eq(mismatchesTable.patchStatus, "verified"));
    const recentScans = await db.select().from(scansTable).orderBy(desc(scansTable.createdAt)).limit(5);

    res.json({
      totalScans: totalScans?.count ?? 0,
      completedScans: completedScans?.count ?? 0,
      totalMismatches: totalMismatches?.count ?? 0,
      fixedMismatches: fixedMismatches?.count ?? 0,
      recentScans: recentScans.map(serializeScan),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get scan stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /scans
router.get("/scans", async (req, res) => {
  try {
    const scans = await db.select().from(scansTable).orderBy(desc(scansTable.createdAt));
    res.json(scans.map(serializeScan));
  } catch (err) {
    req.log.error({ err }, "Failed to list scans");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /scans
const createScanSchema = z.object({
  repoUrl: z.string().url(),
  sandboxRepo: z.string().nullable().optional(),
});

router.post("/scans", async (req, res) => {
  const parsed = createScanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  try {
    const [scan] = await db.insert(scansTable).values({
      repoUrl: parsed.data.repoUrl,
      sandboxRepo: parsed.data.sandboxRepo ?? null,
      status: "pending",
    }).returning();

    res.status(201).json(serializeScan(scan));
  } catch (err) {
    req.log.error({ err }, "Failed to create scan");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /scans/:id
router.get("/scans/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid scan ID" }); return; }

  try {
    const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, id));
    if (!scan) { res.status(404).json({ error: "Scan not found" }); return; }
    res.json(serializeScan(scan));
  } catch (err) {
    req.log.error({ err }, "Failed to get scan");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /scans/:id/run — executes the 3-agent pipeline asynchronously
router.post("/scans/:id/run", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid scan ID" }); return; }

  try {
    const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, id));
    if (!scan) { res.status(404).json({ error: "Scan not found" }); return; }

    if (!["pending", "failed"].includes(scan.status)) {
      res.status(400).json({ error: `Scan is already in status: ${scan.status}` });
      return;
    }

    // Start the pipeline async — don't await it
    runPipeline(id, scan.repoUrl, scan.sandboxRepo).catch(err => {
      logger.error({ err, scanId: id }, "Pipeline crashed");
    });

    const [updated] = await db.select().from(scansTable).where(eq(scansTable.id, id));
    res.json(serializeScan(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to start scan run");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /scans/:id/logs
router.get("/scans/:id/logs", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid scan ID" }); return; }

  try {
    const logs = await db.select().from(scanLogsTable).where(eq(scanLogsTable.scanId, id)).orderBy(scanLogsTable.createdAt);
    res.json(logs.map(serializeLog));
  } catch (err) {
    req.log.error({ err }, "Failed to get scan logs");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /scans/:id/mismatches
router.get("/scans/:id/mismatches", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid scan ID" }); return; }

  try {
    const mismatches = await db.select().from(mismatchesTable).where(eq(mismatchesTable.scanId, id)).orderBy(desc(mismatchesTable.createdAt));
    res.json(mismatches.map(serializeMismatch));
  } catch (err) {
    req.log.error({ err }, "Failed to get mismatches");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Pipeline orchestrator ────────────────────────────────────────────────────

async function runPipeline(scanId: number, repoUrl: string, sandboxRepo: string | null) {
  const { db: dbInstance } = await import("@workspace/db");
  const { scansTable: st } = await import("@workspace/db");
  const { eq: eqFn } = await import("drizzle-orm");

  try {
    // Agent 1: THINK
    const contractMap = await agentThink(scanId, repoUrl);

    // Agent 2: EXECUTE
    let mismatchCount = 0;
    if (sandboxRepo) {
      const execResult = await agentExecute(scanId, repoUrl, sandboxRepo, contractMap);
      mismatchCount = execResult.mismatches;
    } else {
      // No sandbox — still run simulation-based analysis via Gemini
      const { simulateExecutionFallback } = await import("./scans-helpers.js");
      mismatchCount = await simulateExecutionFallback(scanId, repoUrl, contractMap);
    }

    // Agent 3: SELF-CORRECT (only if mismatches found)
    let prUrl: string | null = null;
    if (mismatchCount > 0) {
      prUrl = await agentSelfCorrect(scanId, repoUrl);
    }

    await dbInstance.update(st).set({
      status: "completed",
      updatedAt: new Date(),
      prUrl,
    }).where(eqFn(st.id, scanId));

    const { scanLogsTable: slt } = await import("@workspace/db");
    await dbInstance.insert(slt).values({
      scanId,
      agent: "SYSTEM",
      level: "success",
      message: mismatchCount > 0
        ? `Scan complete. Found ${mismatchCount} mismatch(es).${prUrl ? ` PR created: ${prUrl}` : ""}`
        : "Scan complete. No behavioral mismatches detected.",
    });

    // Fire webhook notification (non-blocking)
    getWebhookConfig().then((cfg) => {
      if (cfg?.url) {
        sendScanWebhook(cfg, { scanId, repoUrl, status: "completed", mismatchCount, prUrl });
      }
    }).catch((err) => logger.warn({ err }, "Webhook notify failed (completed)"));

  } catch (err) {
    logger.error({ err, scanId }, "Pipeline error");
    const { db: dbErr } = await import("@workspace/db");
    const { scansTable: stErr, scanLogsTable: sltErr } = await import("@workspace/db");
    const { eq: eqErr } = await import("drizzle-orm");

    const errorMessage = err instanceof Error ? err.message : String(err);

    await dbErr.update(stErr).set({
      status: "failed",
      errorMessage,
      updatedAt: new Date(),
    }).where(eqErr(stErr.id, scanId));

    await dbErr.insert(sltErr).values({
      scanId,
      agent: "SYSTEM",
      level: "error",
      message: `Pipeline failed: ${errorMessage}`,
    });

    // Fire webhook notification (non-blocking)
    getWebhookConfig().then((cfg) => {
      if (cfg?.url) {
        sendScanWebhook(cfg, { scanId, repoUrl, status: "failed", mismatchCount: 0, errorMessage });
      }
    }).catch((wErr) => logger.warn({ wErr }, "Webhook notify failed (failed)"));
  }
}

// ─── Serializers ──────────────────────────────────────────────────────────────

function serializeScan(scan: typeof scansTable.$inferSelect) {
  return {
    ...scan,
    createdAt: scan.createdAt.toISOString(),
    updatedAt: scan.updatedAt?.toISOString() ?? null,
  };
}

function serializeLog(log: typeof scanLogsTable.$inferSelect) {
  return {
    ...log,
    createdAt: log.createdAt.toISOString(),
  };
}

function serializeMismatch(m: typeof mismatchesTable.$inferSelect) {
  return {
    ...m,
    createdAt: m.createdAt.toISOString(),
  };
}

export default router;
