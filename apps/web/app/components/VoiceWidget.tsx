"use client";

import { useCallback, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";

/**
 * Uses the ElevenLabs React SDK instead of the <elevenlabs-convai> embed
 * widget, because the SDK exposes conversation status, speaking/listening
 * mode, mute, and sendUserMessage (a text fallback) - the embed widget
 * does not expose any of these as attributes. Neither the widget nor the
 * SDK lets us pass custom getUserMedia constraints (echoCancellation,
 * noiseSuppression, autoGainControl) per ElevenLabs' current docs, so
 * browser-side noise suppression is whatever the OS/browser does by
 * default - see docs/DESIGN_NOTES.md.
 */
export function VoiceWidget({ maxDurationSeconds }: { maxDurationSeconds: number }) {
  return (
    <ConversationProvider>
      <VoiceWidgetInner maxDurationSeconds={maxDurationSeconds} />
    </ConversationProvider>
  );
}

function VoiceWidgetInner({ maxDurationSeconds }: { maxDurationSeconds: number }) {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [textDraft, setTextDraft] = useState("");

  const conversation = useConversation({
    onError: (message: unknown) => {
      setError(typeof message === "string" ? message : "Something went wrong with the voice demo.");
    },
  });

  const start = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/voice/web-session", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not start the voice demo right now.");
        return;
      }
      await conversation.startSession({ signedUrl: data.signedUrl });
    } catch {
      setError("Could not start the voice demo right now.");
    } finally {
      setStarting(false);
    }
  }, [conversation]);

  const end = useCallback(() => {
    void conversation.endSession();
  }, [conversation]);

  const toggleMute = useCallback(() => {
    void conversation.setMuted(!conversation.isMuted);
  }, [conversation]);

  const sendText = useCallback(() => {
    const text = textDraft.trim();
    if (!text) return;
    conversation.sendUserMessage(text);
    setTextDraft("");
  }, [textDraft, conversation]);

  const minutes = Math.round(maxDurationSeconds / 60);
  const connected = conversation.status === "connected";

  return (
    <div className="card">
      <p className="muted">
        AI receptionist demo for a fictional plumbing company. Calls are capped at {minutes} minute{minutes === 1 ? "" : "s"}.
      </p>
      <p className="muted">Works best in a quiet room. You can mute or type instead.</p>

      {!connected && (
        <button className="button" onClick={start} disabled={starting}>
          {starting ? "Starting..." : "Talk to the receptionist"}
        </button>
      )}

      {error && <p style={{ color: "#b3261e" }}>{error}</p>}

      {connected && (
        <div>
          <p className="muted">
            {conversation.isSpeaking ? "Agent is speaking..." : "Listening..."}
            {conversation.isMuted ? " (muted)" : ""}
          </p>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <button className="button" onClick={toggleMute}>
              {conversation.isMuted ? "Unmute" : "Mute"}
            </button>
            <button className="button" onClick={end}>
              End call
            </button>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendText()}
              placeholder="Or type instead of talking..."
            />
            <button className="button" onClick={sendText} disabled={!textDraft.trim()}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
