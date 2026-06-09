import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { sendTestWebhook, SETTINGS_KEY, type WebhookConfig } from "../lib/webhook.js";

const router = Router();

const webhookConfigSchema = z.object({
  url: z.string().url("Must be a valid URL"),
  notifyOnComplete: z.boolean().default(true),
  notifyOnFailure: z.boolean().default(true),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getWebhookConfig(): Promise<WebhookConfig | null> {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.key, SETTINGS_KEY));
  if (!rows[0]) return null;
  try {
    return JSON.parse(rows[0].value) as WebhookConfig;
  } catch {
    return null;
  }
}

// ─── GET /settings/webhooks ───────────────────────────────────────────────────

router.get("/settings/webhooks", async (req, res) => {
  try {
    const config = await getWebhookConfig();
    if (!config) {
      res.json({ url: "", notifyOnComplete: true, notifyOnFailure: true });
      return;
    }
    res.json(config);
  } catch (err) {
    req.log.error({ err }, "Failed to get webhook config");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PUT /settings/webhooks ───────────────────────────────────────────────────

router.put("/settings/webhooks", async (req, res) => {
  const parsed = webhookConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  try {
    const value = JSON.stringify(parsed.data);
    await db
      .insert(settingsTable)
      .values({ key: SETTINGS_KEY, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });

    res.json(parsed.data);
  } catch (err) {
    req.log.error({ err }, "Failed to save webhook config");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── DELETE /settings/webhooks ────────────────────────────────────────────────

router.delete("/settings/webhooks", async (req, res) => {
  try {
    await db.delete(settingsTable).where(eq(settingsTable.key, SETTINGS_KEY));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete webhook config");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /settings/webhooks/test ────────────────────────────────────────────

router.post("/settings/webhooks/test", async (req, res) => {
  const parsed = webhookConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  try {
    const result = await sendTestWebhook(parsed.data);
    res.json({ ok: result.ok, provider: result.provider, statusCode: result.statusCode ?? null, error: result.error ?? null });
  } catch (err) {
    req.log.error({ err }, "Webhook test failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export { getWebhookConfig };
export default router;
