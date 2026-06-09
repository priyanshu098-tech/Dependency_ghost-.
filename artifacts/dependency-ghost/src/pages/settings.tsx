import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  useGetWebhookConfig,
  useSaveWebhookConfig,
  useTestWebhook,
  useDeleteWebhookConfig,
  getGetWebhookConfigQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Bell, BellOff, Send, Trash2, Check, AlertTriangle,
  Slack, MessageSquare, Webhook, Loader2, Info,
} from "lucide-react";

// ─── Provider detection ───────────────────────────────────────────────────────

type Provider = "slack" | "discord" | "generic" | null;

function detectProvider(url: string): Provider {
  if (!url) return null;
  if (url.includes("hooks.slack.com")) return "slack";
  if (url.includes("discord.com/api/webhooks") || url.includes("discordapp.com/api/webhooks")) return "discord";
  if (url.startsWith("http")) return "generic";
  return null;
}

const PROVIDER_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  slack:   { label: "Slack",   color: "border-purple-500/40 text-purple-400 bg-purple-500/10", icon: <Slack className="w-3 h-3" /> },
  discord: { label: "Discord", color: "border-indigo-500/40 text-indigo-400 bg-indigo-500/10", icon: <MessageSquare className="w-3 h-3" /> },
  generic: { label: "Webhook", color: "border-zinc-500/40 text-zinc-400 bg-zinc-500/10",       icon: <Webhook className="w-3 h-3" /> },
};

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label, description }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      className="flex items-start gap-3 text-left w-full group"
      onClick={() => onChange(!checked)}
    >
      <div className={`mt-0.5 w-8 h-4 rounded-full border flex items-center transition-colors shrink-0 ${
        checked ? "bg-primary border-primary" : "bg-zinc-800 border-zinc-700"
      }`}>
        <div className={`w-3 h-3 rounded-full bg-black mx-0.5 transition-transform ${checked ? "translate-x-3.5" : "translate-x-0"}`} />
      </div>
      <div>
        <div className="text-xs font-mono text-zinc-200 group-hover:text-primary transition-colors">{label}</div>
        <div className="text-[10px] text-zinc-600 mt-0.5">{description}</div>
      </div>
    </button>
  );
}

// ─── Test result banner ───────────────────────────────────────────────────────

type TestResult = { ok: boolean; provider: string; statusCode?: number | null; error?: string | null };

function TestResultBanner({ result }: { result: TestResult }) {
  if (result.ok) {
    return (
      <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-3 py-2">
        <Check className="w-3.5 h-3.5 shrink-0" />
        Test notification delivered successfully via {result.provider}
        {result.statusCode && <span className="text-emerald-600 ml-auto">HTTP {result.statusCode}</span>}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs font-mono text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
      <span className="flex-1">{result.error ?? `Delivery failed (HTTP ${result.statusCode})`}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type FormValues = {
  url: string;
  notifyOnComplete: boolean;
  notifyOnFailure: boolean;
};

export default function Settings() {
  const queryClient = useQueryClient();
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: config, isLoading } = useGetWebhookConfig({
    query: { queryKey: getGetWebhookConfigQueryKey() },
  });

  const { register, watch, setValue, handleSubmit, reset, formState: { isDirty } } = useForm<FormValues>({
    defaultValues: { url: "", notifyOnComplete: true, notifyOnFailure: true },
  });

  useEffect(() => {
    if (config) reset({ url: config.url ?? "", notifyOnComplete: config.notifyOnComplete, notifyOnFailure: config.notifyOnFailure });
  }, [config, reset]);

  const saveConfig = useSaveWebhookConfig();
  const testWebhook = useTestWebhook();
  const deleteConfig = useDeleteWebhookConfig();

  const watchedUrl = watch("url");
  const watchedComplete = watch("notifyOnComplete");
  const watchedFailure = watch("notifyOnFailure");
  const provider = detectProvider(watchedUrl);

  const onSave = handleSubmit((values) => {
    saveConfig.mutate({ data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWebhookConfigQueryKey() });
        setSaved(true);
        setTestResult(null);
        setTimeout(() => setSaved(false), 2500);
        reset(values);
      },
    });
  });

  const onTest = () => {
    setTestResult(null);
    testWebhook.mutate(
      { data: { url: watchedUrl, notifyOnComplete: watchedComplete, notifyOnFailure: watchedFailure } },
      { onSuccess: (r) => setTestResult(r as TestResult) },
    );
  };

  const onDelete = () => {
    deleteConfig.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWebhookConfigQueryKey() });
        reset({ url: "", notifyOnComplete: true, notifyOnFailure: true });
        setTestResult(null);
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 font-mono text-primary animate-pulse py-8">
        <Loader2 className="w-4 h-4 animate-spin" />
        LOADING_CONFIG...
      </div>
    );
  }

  const hasUrl = watchedUrl.trim().length > 0;
  const providerMeta = provider ? PROVIDER_LABELS[provider] : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300" data-testid="settings-page">
      <div>
        <h1 className="text-xl font-bold font-mono flex items-center gap-3">
          <Bell className="w-5 h-5 text-primary" />
          NOTIFICATIONS
        </h1>
        <p className="text-zinc-500 text-xs font-mono mt-1">
          Send alerts to Slack or Discord when scans complete or fail.
        </p>
      </div>

      <form onSubmit={onSave} className="space-y-4">

        {/* Webhook URL */}
        <Card className="border-zinc-800 bg-zinc-950">
          <CardHeader className="py-3 px-4 border-b border-zinc-800">
            <CardTitle className="text-[11px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <Webhook className="w-3.5 h-3.5" />
              WEBHOOK_URL
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-mono text-zinc-400">Incoming webhook URL</Label>
                {providerMeta && (
                  <Badge variant="outline" className={`text-[9px] font-mono px-1.5 h-4 flex items-center gap-1 ${providerMeta.color}`}>
                    {providerMeta.icon}
                    {providerMeta.label}
                  </Badge>
                )}
              </div>
              <Input
                {...register("url")}
                placeholder="https://hooks.slack.com/... or https://discord.com/api/webhooks/..."
                className="font-mono text-xs bg-black border-zinc-700 focus:border-primary text-zinc-200 placeholder:text-zinc-700"
                data-testid="input-webhook-url"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-[10px] text-zinc-600 flex items-start gap-1.5">
                <Info className="w-3 h-3 shrink-0 mt-0.5" />
                Slack: Integrations → Incoming Webhooks. Discord: Channel Settings → Integrations → Webhooks.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Notification triggers */}
        <Card className="border-zinc-800 bg-zinc-950">
          <CardHeader className="py-3 px-4 border-b border-zinc-800">
            <CardTitle className="text-[11px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <Bell className="w-3.5 h-3.5" />
              TRIGGERS
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <Toggle
              checked={watchedComplete}
              onChange={(v) => setValue("notifyOnComplete", v, { shouldDirty: true })}
              label="Scan completed"
              description="Notify when all 3 agents finish — includes mismatch count and PR link."
            />
            <Toggle
              checked={watchedFailure}
              onChange={(v) => setValue("notifyOnFailure", v, { shouldDirty: true })}
              label="Scan failed"
              description="Notify when the pipeline encounters an unrecoverable error."
            />
          </CardContent>
        </Card>

        {/* Test result */}
        {testResult && <TestResultBanner result={testResult} />}

        {/* Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            type="submit"
            disabled={saveConfig.isPending || !isDirty}
            className="font-mono text-xs gap-2 bg-primary text-black hover:bg-primary/90"
            data-testid="button-save-webhook"
          >
            {saveConfig.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : saved ? (
              <Check className="w-3.5 h-3.5" />
            ) : null}
            {saved ? "SAVED" : "SAVE_CONFIG"}
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={!hasUrl || testWebhook.isPending}
            className="font-mono text-xs gap-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-primary disabled:opacity-40"
            onClick={onTest}
            data-testid="button-test-webhook"
          >
            {testWebhook.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Send className="w-3.5 h-3.5" />
            }
            SEND_TEST
          </Button>

          {hasUrl && (
            <Button
              type="button"
              variant="ghost"
              className="font-mono text-xs gap-2 text-red-500 hover:text-red-400 hover:bg-red-500/10 ml-auto"
              onClick={onDelete}
              disabled={deleteConfig.isPending}
              data-testid="button-delete-webhook"
            >
              {deleteConfig.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Trash2 className="w-3.5 h-3.5" />
              }
              CLEAR
            </Button>
          )}
        </div>
      </form>

      {/* What the notification looks like */}
      <Card className="border-zinc-800/60 bg-zinc-950/50">
        <CardHeader className="py-3 px-4 border-b border-zinc-800/60">
          <CardTitle className="text-[11px] font-mono text-zinc-600 uppercase tracking-widest">
            PREVIEW — what your team sees
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="bg-black border border-zinc-800 rounded p-3 space-y-2 font-mono text-xs">
            <div className="flex items-center gap-2">
              <div className="w-1 h-full bg-emerald-500 rounded self-stretch min-h-[40px]" />
              <div className="space-y-1 flex-1">
                <div className="text-zinc-200 font-bold">✅ Dependency Ghost — Scan COMPLETED</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-zinc-500">
                  <span><span className="text-zinc-400">Repository</span> your-org/your-repo</span>
                  <span><span className="text-zinc-400">Scan ID</span> #42</span>
                  <span><span className="text-zinc-400">Mismatches</span> 3</span>
                  <span><span className="text-zinc-400">Pull Request</span> <span className="text-primary underline">View PR</span></span>
                </div>
                <div className="text-[9px] text-zinc-700 pt-1">Powered by Dependency Ghost</div>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-zinc-600 mt-2 font-mono">
            Discord uses rich embeds. Slack uses Block Kit attachments. Other URLs receive a plain JSON payload.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
