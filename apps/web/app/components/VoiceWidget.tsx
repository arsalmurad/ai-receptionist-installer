"use client";

import { useState } from "react";

const WIDGET_SCRIPT_SRC = "https://unpkg.com/@elevenlabs/convai-widget-embed";

let widgetScriptPromise: Promise<void> | null = null;

function loadWidgetScript(): Promise<void> {
  if (!widgetScriptPromise) {
    widgetScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = WIDGET_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("could not load the voice widget script"));
      document.body.appendChild(script);
    });
  }
  return widgetScriptPromise;
}

export function VoiceWidget({ maxDurationSeconds }: { maxDurationSeconds: number }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/voice/web-session", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not start the voice demo right now.");
        return;
      }
      await loadWidgetScript();
      setSignedUrl(data.signedUrl);
    } catch {
      setError("Could not start the voice demo right now.");
    } finally {
      setBusy(false);
    }
  }

  const minutes = Math.round(maxDurationSeconds / 60);

  return (
    <div className="card">
      <p className="muted">
        AI receptionist demo for a fictional plumbing company. Calls are capped at {minutes} minute{minutes === 1 ? "" : "s"}.
      </p>
      {!signedUrl && (
        <button className="button" onClick={start} disabled={busy}>
          {busy ? "Starting..." : "Talk to the receptionist"}
        </button>
      )}
      {error && <p style={{ color: "#b3261e" }}>{error}</p>}
      {signedUrl && <elevenlabs-convai signed-url={signedUrl}></elevenlabs-convai>}
    </div>
  );
}
