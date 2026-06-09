import { GoogleGenAI } from "@google/genai";
import { logger } from "./logger.js";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY environment variable is required");
}

export const ai = new GoogleGenAI({ apiKey });

// ─── Retry configuration ──────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 5_000; // 5s → 10s → 20s (exponential x2)

// ─── Error types ──────────────────────────────────────────────────────────────

/** Thrown when all Gemini retries are exhausted due to 503 / overload. */
export class GeminiOverloadError extends Error {
  constructor(attempts: number) {
    super(
      `Temporary API overload – please try again in a few minutes (failed after ${attempts} attempt${attempts === 1 ? "" : "s"})`
    );
    this.name = "GeminiOverloadError";
  }
}

// ─── 503 / overload detection ─────────────────────────────────────────────────

function isOverloadError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  // Gemini SDK may expose status on the error object
  const e = err as unknown as Record<string, unknown>;
  const status = e["status"] ?? e["statusCode"];
  if (status === 503 || status === 429) return true;
  return (
    msg.includes("503") ||
    msg.includes("429") ||
    msg.includes("overloaded") ||
    msg.includes("unavailable") ||
    msg.includes("service unavailable") ||
    msg.includes("resource exhausted") ||
    msg.includes("quota")
  );
}

// ─── Sleep helper ─────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── Public API ───────────────────────────────────────────────────────────────

export type OnRetryCallback = (attempt: number, totalAttempts: number, delayMs: number) => void | Promise<void>;

export async function generateContent(
  prompt: string,
  opts?: { onRetry?: OnRetryCallback }
): Promise<string> {
  let lastErr: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 8192 },
      });
      return response.text ?? "";
    } catch (err) {
      lastErr = err;

      if (!isOverloadError(err)) {
        // Non-transient error — don't retry
        throw err;
      }

      if (attempt === MAX_RETRIES) break;

      const delayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 5s, 10s, 20s
      logger.warn({ attempt, delayMs }, "Gemini 503/overload — retrying");

      if (opts?.onRetry) {
        await opts.onRetry(attempt, MAX_RETRIES, delayMs);
      }

      await sleep(delayMs);
    }
  }

  throw new GeminiOverloadError(MAX_RETRIES);
}
