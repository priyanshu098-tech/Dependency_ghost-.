import { logger } from "./logger.js";

export type WebhookConfig = {
  url: string;
  notifyOnComplete: boolean;
  notifyOnFailure: boolean;
};

export type WebhookEvent = {
  scanId: number;
  repoUrl: string;
  status: "completed" | "failed";
  mismatchCount: number;
  prUrl?: string | null;
  errorMessage?: string | null;
};

const SETTINGS_KEY = "webhook";

// ─── Detect provider from URL ─────────────────────────────────────────────────

type Provider = "slack" | "discord" | "generic";

function detectProvider(url: string): Provider {
  if (url.includes("hooks.slack.com")) return "slack";
  if (url.includes("discord.com/api/webhooks") || url.includes("discordapp.com/api/webhooks")) return "discord";
  return "generic";
}

// ─── Payload builders ─────────────────────────────────────────────────────────

const SEVERITY_EMOJI: Record<string, string> = {
  completed: "✅",
  failed: "❌",
};

function buildSlackPayload(event: WebhookEvent): object {
  const emoji = SEVERITY_EMOJI[event.status] ?? "⚠️";
  const repoName = event.repoUrl.replace(/^https?:\/\/github\.com\//, "");
  const statusLabel = event.status === "completed" ? "COMPLETED" : "FAILED";
  const color = event.status === "completed" ? "#00ff88" : "#ff4444";

  const fields: object[] = [
    { type: "mrkdwn", text: `*Repository*\n<${event.repoUrl}|${repoName}>` },
    { type: "mrkdwn", text: `*Scan ID*\n#${event.scanId}` },
  ];

  if (event.status === "completed") {
    fields.push({ type: "mrkdwn", text: `*Mismatches*\n${event.mismatchCount}` });
    if (event.prUrl) fields.push({ type: "mrkdwn", text: `*Pull Request*\n<${event.prUrl}|View PR>` });
  }
  if (event.status === "failed" && event.errorMessage) {
    fields.push({ type: "mrkdwn", text: `*Error*\n\`${event.errorMessage.slice(0, 120)}\`` });
  }

  return {
    attachments: [
      {
        color,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: `${emoji} Dependency Ghost — Scan ${statusLabel}`, emoji: true },
          },
          { type: "section", fields },
          {
            type: "context",
            elements: [{ type: "mrkdwn", text: `Powered by Dependency Ghost · ${new Date().toUTCString()}` }],
          },
        ],
      },
    ],
  };
}

function buildDiscordPayload(event: WebhookEvent): object {
  const repoName = event.repoUrl.replace(/^https?:\/\/github\.com\//, "");
  const isOk = event.status === "completed";
  const color = isOk ? 0x00ff88 : 0xff4444;
  const title = isOk ? `✅ Scan #${event.scanId} Completed` : `❌ Scan #${event.scanId} Failed`;

  const fields = [
    { name: "Repository", value: `[${repoName}](${event.repoUrl})`, inline: true },
  ];

  if (isOk) {
    fields.push({ name: "Mismatches", value: String(event.mismatchCount), inline: true });
    if (event.prUrl) fields.push({ name: "Pull Request", value: `[View PR](${event.prUrl})`, inline: false });
  }
  if (!isOk && event.errorMessage) {
    fields.push({ name: "Error", value: `\`${event.errorMessage.slice(0, 200)}\``, inline: false });
  }

  return {
    embeds: [
      {
        title,
        color,
        fields,
        footer: { text: `Dependency Ghost · Scan #${event.scanId}` },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function buildGenericPayload(event: WebhookEvent): object {
  return {
    event: `scan.${event.status}`,
    scanId: event.scanId,
    repoUrl: event.repoUrl,
    status: event.status,
    mismatchCount: event.mismatchCount,
    prUrl: event.prUrl ?? null,
    errorMessage: event.errorMessage ?? null,
    timestamp: new Date().toISOString(),
  };
}

// ─── Send ─────────────────────────────────────────────────────────────────────

async function postWebhook(url: string, payload: object): Promise<{ ok: boolean; statusCode: number; body: string }> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await resp.text();
  return { ok: resp.ok, statusCode: resp.status, body };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendScanWebhook(config: WebhookConfig, event: WebhookEvent): Promise<void> {
  if (!config.url) return;
  if (event.status === "completed" && !config.notifyOnComplete) return;
  if (event.status === "failed" && !config.notifyOnFailure) return;

  const provider = detectProvider(config.url);
  const payload =
    provider === "slack"   ? buildSlackPayload(event) :
    provider === "discord" ? buildDiscordPayload(event) :
    buildGenericPayload(event);

  try {
    const result = await postWebhook(config.url, payload);
    if (result.ok) {
      logger.info({ scanId: event.scanId, provider }, "Webhook delivered successfully");
    } else {
      logger.warn({ scanId: event.scanId, statusCode: result.statusCode, body: result.body }, "Webhook delivery failed");
    }
  } catch (err) {
    logger.error({ err, scanId: event.scanId }, "Webhook request threw an error");
  }
}

export async function sendTestWebhook(config: WebhookConfig): Promise<{ ok: boolean; provider: Provider; statusCode?: number; error?: string }> {
  const provider = detectProvider(config.url);
  const testEvent: WebhookEvent = {
    scanId: 0,
    repoUrl: "https://github.com/example/test-repo",
    status: "completed",
    mismatchCount: 3,
    prUrl: "https://github.com/example/test-repo/pull/1",
  };

  const payload =
    provider === "slack"   ? buildSlackPayload(testEvent) :
    provider === "discord" ? buildDiscordPayload(testEvent) :
    buildGenericPayload(testEvent);

  try {
    const result = await postWebhook(config.url, payload);
    return { ok: result.ok, provider, statusCode: result.statusCode };
  } catch (err) {
    return { ok: false, provider, error: err instanceof Error ? err.message : String(err) };
  }
}

export { SETTINGS_KEY };
