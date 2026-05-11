"use client";

import { robotColor } from "@/components/robot-mascot";
import { useCallback, useEffect, useState } from "react";
import styles from "./swarm-panel.module.css";

// The swarm panel is a real-time view across three substrates:
//   1. hive/events/<actor>.log   — lifecycle events (claim, done, etc.)
//   2. hive/notes-to-bots/<author>.log   — humans → bots
//   3. hive/notes-to-humans/<author>.log — bots → humans
// All three are plain text + Git, written by per-actor split so parallel
// writers never conflict. The panel renders a merged, newest-first view.
// The composer at the top writes notes (use @cc2 or @swarm to target).

type EntryKind = "lifecycle" | "note-to-bots" | "note-to-humans";

type Entry = {
  kind: EntryKind;
  ts: string;
  actor: string;
  raw: string;
};

const STORAGE_KEY = "bot-hive:swarm-panel:open";
const MAX_MESSAGE_CHARS = 280;

function ago(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const ms = Date.now() - t;
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

type Lifecycle = { hvId: string; action: string };

function parseLifecycle(raw: string): Lifecycle {
  const parts = raw.split(/\s+/);
  // <ts> <hv-id> <action> [unblocked-list] <actor>
  const hvId = parts[1] ?? "";
  const action = parts[2] ?? "";
  return { hvId, action };
}

export function SwarmPanel({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState<boolean>(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [connected, setConnected] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "0") setOpen(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
  }, [open]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/events`);
      if (!res.ok) return;
      const data = (await res.json()) as { entries: Entry[] };
      setEntries(data.entries);
    } catch {
      // Network error — leave existing entries; SSE will trigger another refresh.
    }
  }, [projectId]);

  // Subscribe to the project SSE; refetch the merged view on every change broadcast.
  useEffect(() => {
    if (!open) return;
    refresh();
    const es = new EventSource(`/api/projects/${projectId}/stream`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = () => {
      refresh();
    };
    return () => {
      es.close();
      setConnected(false);
    };
  }, [open, projectId, refresh]);

  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setSendError(data.error || "send failed");
        return;
      }
      setDraft("");
      // SSE will fire from the broadcast in the POST handler; refresh as a safety net.
      refresh();
    } catch {
      setSendError("network error");
    } finally {
      setSending(false);
    }
  }, [draft, sending, projectId, refresh]);

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
    <aside className={styles.panel} aria-label="Swarm — events and notes">
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

      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          type="text"
          className={styles.input}
          placeholder="Use @cc2 or @swarm to target. Enter to send."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_MESSAGE_CHARS}
          disabled={sending}
          aria-label="Note to bots"
        />
        <button type="submit" className={styles.sendButton} disabled={!draft.trim() || sending}>
          {sending ? "…" : "Send"}
        </button>
        {sendError && <span className={styles.sendError}>{sendError}</span>}
      </form>

      <div className={styles.list}>
        {entries.length === 0 ? (
          <p className={styles.empty}>
            No activity in the last 7 days. Lifecycle events and notes appear here.
          </p>
        ) : (
          entries.map((e, i) => {
            const key = `${e.kind}|${e.ts}|${e.actor}|${i}`;
            const color = e.actor ? robotColor(e.actor) : undefined;
            const isNote = e.kind === "note-to-bots" || e.kind === "note-to-humans";
            let body: string;
            if (e.kind === "lifecycle") {
              const { hvId, action } = parseLifecycle(e.raw);
              body = `${action} ${hvId}`.trim();
            } else {
              body = e.raw;
            }
            return (
              <div key={key} className={styles.row}>
                <span className={styles.bullet} style={{ color }} aria-hidden="true">
                  ●
                </span>
                <span className={styles.author} style={{ color }}>
                  {e.actor || "?"}
                </span>
                <span className={isNote ? styles.noteMessage : styles.message}>{body}</span>
                <span className={styles.time} title={e.ts}>
                  {ago(e.ts)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
