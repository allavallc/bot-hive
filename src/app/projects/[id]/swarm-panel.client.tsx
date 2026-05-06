"use client";

import { robotColor } from "@/components/robot-mascot";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./swarm-panel.module.css";

// The swarm panel is a real-time view of the per-actor event logs at
// `hive/events/<actor>.log` — the durable coordination logs every bot
// writes to. There is no separate signal channel, no bot tokens, no API
// surface beyond the existing GitHub webhook → SSE broadcast that already
// powers the live board. When a bot pushes a commit that touches its
// event log, the webhook fires, the panel re-fetches the merged view,
// and the new lines render here within seconds.

type EventEntry = {
  ts: string;
  hvId: string;
  action: string;
  actor: string;
  raw: string;
};

const STORAGE_KEY = "bot-hive:swarm-panel:open";

// Event lines look like:  <ISO ts>  <hv-id|tag>  <action>  [unblocked-list]  <actor>
// Tolerant parser — preserves the full raw line so anything off-format still renders.
function parseEntry(raw: string): EventEntry | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 3) return null;
  const [ts, hvId, action, ...rest] = parts;
  const actor = rest[rest.length - 1] ?? "";
  return { ts, hvId, action, actor, raw: trimmed };
}

function ago(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const ms = Date.now() - t;
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

const ACTION_GLYPH: Record<string, string> = {
  claim: "→",
  done: "✓",
  blocked: "⊘",
  reclaim: "↺",
  reverted: "↺",
  filed: "+",
  "in-progress": "·",
  "in-review": "▸",
  accepted: "✓",
  rejected: "✗",
  "not-doing": "—",
};

export function SwarmPanel({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState<boolean>(true);
  const [entries, setEntries] = useState<EventEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Load persisted open/closed state.
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
      const data = (await res.json()) as { entries: string[] };
      const parsed = data.entries.map(parseEntry).filter((e): e is EventEntry => e !== null);
      setEntries(parsed);
    } catch {
      // Network error — leave existing entries; SSE will trigger another refresh.
    }
  }, [projectId]);

  // Subscribe to the project SSE; refetch the merged event view on every change broadcast.
  useEffect(() => {
    if (!open) return;
    refresh();
    const es = new EventSource(`/api/projects/${projectId}/stream`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = () => {
      // Any change broadcast — refresh the merged event view. Cheap, idempotent.
      refresh();
    };
    return () => {
      es.close();
      setConnected(false);
    };
  }, [open, projectId, refresh]);

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
    <aside className={styles.panel} aria-label="Swarm — event log view">
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

      <div ref={listRef} className={styles.list}>
        {entries.length === 0 ? (
          <p className={styles.empty}>
            No events in the last 7 days. Activity appears here as agents push to{" "}
            <code>hive/events/&lt;actor&gt;.log</code>.
          </p>
        ) : (
          entries.map((e) => (
            <div key={e.raw} className={styles.signal} data-type={e.action}>
              <span className={styles.glyph} aria-hidden="true">
                {ACTION_GLYPH[e.action] ?? "·"}
              </span>
              <span
                className={styles.author}
                style={{ color: e.actor ? robotColor(e.actor) : undefined }}
              >
                {e.actor || "?"}
              </span>
              <span className={styles.message}>
                {e.action} {e.hvId}
              </span>
              <span className={styles.time} title={e.ts}>
                {ago(e.ts)}
              </span>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
