"use client";

import { robotColor } from "@/components/robot-mascot";
import { type FormEvent, useEffect, useRef, useState } from "react";
import styles from "./swarm-panel.module.css";

type Signal = {
  id: string;
  timestamp: string;
  type: "claim" | "done" | "blocked" | "question" | "note" | "handoff" | "accepted" | "rejected";
  message: string;
  bot?: string;
  user?: string;
  refs?: string[];
};

const STORAGE_KEY = "bot-hive:swarm-panel:open";

const TYPE_GLYPH: Record<Signal["type"], string> = {
  claim: "→",
  done: "✓",
  blocked: "⊘",
  question: "?",
  note: "·",
  handoff: "⇌",
  accepted: "✓",
  rejected: "↻",
};

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h`;
}

export function SwarmPanel({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState<boolean>(true);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);

  // Load persisted open/closed state on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "0") setOpen(false);
  }, []);

  // Persist open state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
  }, [open]);

  // Subscribe to SSE when open.
  useEffect(() => {
    if (!open) return;
    const es = new EventSource(`/api/projects/${projectId}/signals/stream`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      try {
        const signal = JSON.parse(ev.data) as Signal;
        setSignals((prev) => {
          if (prev.some((s) => s.id === signal.id)) return prev;
          return [...prev, signal];
        });
      } catch {
        // Ignore malformed payload.
      }
    };
    return () => {
      es.close();
      setConnected(false);
    };
  }, [open, projectId]);

  // Stick-to-bottom autoscroll: re-attach to the bottom whenever a new signal lands,
  // unless the user has scrolled up. We *read* signals.length so biome's exhaustive-deps
  // rule sees the dependency; the actual scroll logic doesn't need the value.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (stickToBottom.current) {
      list.scrollTop = list.scrollHeight;
    }
    // signals.length is referenced here purely for the dependency; the useEffect closure
    // captures listRef + stickToBottom which are refs (always current).
    void signals.length;
  }, [signals.length]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
    stickToBottom.current = nearBottom;
  }

  async function publish(e: FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "note", message }),
      });
      if (res.ok) {
        setInput("");
      }
    } catch {
      // Network error — leave the input populated so user can retry.
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className={styles.collapsedToggle}
        onClick={() => setOpen(true)}
        aria-label="Open swarm panel"
      >
        Swarm
      </button>
    );
  }

  return (
    <aside className={styles.panel} aria-label="Swarm signal stream">
      <header className={styles.panelHeader}>
        <span className={styles.title}>Swarm</span>
        <span className={styles.connState} data-on={connected} aria-live="polite">
          {connected ? "● live" : "○ off"}
        </span>
        <button
          type="button"
          className={styles.closeButton}
          onClick={() => setOpen(false)}
          aria-label="Hide swarm panel"
        >
          ×
        </button>
      </header>

      <div ref={listRef} className={styles.list} onScroll={handleScroll}>
        {signals.length === 0 ? (
          <p className={styles.empty}>
            No signals yet. Bots and humans will appear here as they work.
          </p>
        ) : (
          signals.map((s) => {
            const author = s.bot ?? s.user ?? "?";
            const color = robotColor(author);
            return (
              <div key={s.id} className={styles.signal} data-type={s.type}>
                <span className={styles.glyph} aria-hidden="true">
                  {TYPE_GLYPH[s.type]}
                </span>
                <span className={styles.author} style={{ color }}>
                  {author}
                </span>
                <span className={styles.message}>{s.message}</span>
                <span className={styles.time} title={s.timestamp}>
                  {ago(s.timestamp)}
                </span>
              </div>
            );
          })
        )}
      </div>

      <form className={styles.composer} onSubmit={publish}>
        <input
          type="text"
          className={styles.input}
          placeholder="Type a note to the swarm…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
          maxLength={500}
        />
        <button type="submit" className={styles.sendButton} disabled={sending || !input.trim()}>
          {sending ? "…" : "Send"}
        </button>
      </form>
    </aside>
  );
}
