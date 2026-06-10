import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { X, Copy, Check } from "lucide-react";

interface QrModalProps {
  url: string;
  scanId: number;
  onClose: () => void;
}

export function QrModal({ url, scanId, onClose }: QrModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  // Generate QR code onto the canvas
  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, {
      width: 240,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });
  }, [url]);

  const handleCopy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      {/* Panel */}
      <div
        className="relative flex flex-col items-center gap-5 rounded-xl border bg-zinc-950 p-7 shadow-2xl w-full max-w-xs"
        style={{ borderColor: "#39FF1466", boxShadow: "0 0 0 1px #39FF1433, 0 0 50px #39FF1420" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button
          className="absolute top-3 right-3 text-zinc-600 hover:text-zinc-300 transition-colors"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="text-center space-y-0.5 w-full">
          <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">Share scan result</p>
          <p className="font-black font-mono text-sm text-primary tracking-wider">SCAN #{scanId}</p>
        </div>

        {/* QR code — white background for scannability */}
        <div
          className="rounded-lg overflow-hidden p-2 shadow-inner"
          style={{ background: "#ffffff" }}
        >
          <canvas ref={canvasRef} />
        </div>

        {/* URL */}
        <div
          className="w-full rounded border px-3 py-2 font-mono text-[10px] text-zinc-400 truncate text-center"
          style={{ borderColor: "#27272a", background: "#111113" }}
          title={url}
        >
          {url}
        </div>

        {/* Copy button */}
        <button
          className="w-full flex items-center justify-center gap-2 rounded border font-mono text-xs py-2 transition-colors"
          style={{
            borderColor: copied ? "#10b981aa" : "#39FF1466",
            color: copied ? "#10b981" : "#39FF14",
            background: copied ? "#10b98112" : "#39FF1408",
          }}
          onClick={handleCopy}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "COPIED!" : "COPY LINK"}
        </button>

        <p className="text-[9px] font-mono text-zinc-700 tracking-widest">
          SCREENSHOT TO SHARE
        </p>
      </div>
    </div>
  );
}
