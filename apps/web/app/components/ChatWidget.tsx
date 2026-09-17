"use client";

import { useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function ChatWidget({ businessName, disclosure }: { businessName: string; disclosure: string }) {
  const [consentId, setConsentId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function acceptDisclosure() {
    setBusy(true);
    try {
      const res = await fetch("/api/chat/consent", { method: "POST" });
      const data = await res.json();
      setConsentId(data.consentId);
      setSessionId(data.sessionId);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!draft.trim() || !consentId || !sessionId) return;
    const userMessage = draft;
    setDraft("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consentId, sessionId, message: userMessage }),
      });
      if (res.status === 403) {
        setNote("Your session expired. Refresh the page to start again.");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setNote(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      if (data.leadCaptured) {
        setNote("We've saved your info and someone will follow up.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!consentId) {
    return (
      <div className="card">
        <p>{disclosure}</p>
        <button className="button" onClick={acceptDisclosure} disabled={busy}>
          {busy ? "Starting..." : "Continue"}
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="muted">Chatting with {businessName}&apos;s AI assistant.</p>
      <div className="chat-log">
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble ${m.role}`}>
            {m.content}
          </div>
        ))}
      </div>
      {note && <p className="muted">{note}</p>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask a question..."
          disabled={busy}
        />
        <button className="button" onClick={send} disabled={busy || !draft.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
