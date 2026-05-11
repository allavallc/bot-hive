"use client";

// Admin inbox: a single chip in the subnav band that surfaces
// pending PM suggestions (FS-025) and open swarm-health anomalies
// (FS-022) without pushing the kanban down. Click opens a slide-over
// hosting both panels as tabs. Hidden when both counts are zero so
// the chrome stays out of the way on quiet days.

import { useCallback, useEffect, useState } from "react";
import styles from "./admin-inbox.module.css";
import { SuggestionsInbox } from "./suggestions-inbox.client";
import { SwarmHealthPanel } from "./swarm-health-panel.client";

type Tab = "suggestions" | "health";

const COUNT_REFRESH_MS = 30_000;

export function AdminInbox({ projectId, isAdmin }: { projectId: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("suggestions");
  const [suggestionsCount, setSuggestionsCount] = useState(0);
  const [healthCount, setHealthCount] = useState(0);

  const refreshCounts = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [sRes, hRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/suggestions`),
        fetch(`/api/projects/${projectId}/health`),
      ]);
      if (sRes.ok) {
        const data = (await sRes.json()) as { suggestions: unknown[] };
        setSuggestionsCount(data.suggestions?.length ?? 0);
      }
      if (hRes.ok) {
        const data = (await hRes.json()) as { anomalies: { severity: string }[] };
        const actionable = (data.anomalies ?? []).filter(
          (a) => a.severity === "critical" || a.severity === "warning",
        );
        setHealthCount(actionable.length);
      }
    } catch {
      // Counts will retry on the next interval.
    }
  }, [projectId, isAdmin]);

  useEffect(() => {
    void refreshCounts();
    const id = setInterval(() => void refreshCounts(), COUNT_REFRESH_MS);
    return () => clearInterval(id);
  }, [refreshCounts]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!isAdmin) return null;

  const total = suggestionsCount + healthCount;

  return (
    <>
      <button
        type="button"
        className={styles.chip}
        onClick={() => {
          setOpen(true);
          // Re-fetch when opened so the user sees current state without
          // waiting up to 30s for the next interval.
          void refreshCounts();
        }}
        aria-label={`Inbox · ${total} item${total === 1 ? "" : "s"}`}
        data-has-critical={healthCount > 0 || undefined}
      >
        <span className={styles.chipLabel}>Inbox</span>
        <span className={styles.chipCount}>{total}</span>
      </button>

      {open && (
        <div className={styles.overlay}>
          <button
            type="button"
            className={styles.backdrop}
            onClick={() => setOpen(false)}
            aria-label="Close inbox"
          />
          <aside
            className={styles.panel}
            aria-label="Admin inbox"
            aria-modal="true"
            // Non-native dialog: state-driven open/close, Esc handler bound at the
            // window level. Using <aside> over <dialog> keeps the open/close logic
            // declarative without imperative showModal() ref calls.
            // biome-ignore lint/a11y/useSemanticElements: see comment above
            role="dialog"
          >
            <header className={styles.panelHeader}>
              <div className={styles.tabs} role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "suggestions"}
                  className={styles.tab}
                  data-active={tab === "suggestions"}
                  onClick={() => setTab("suggestions")}
                >
                  Suggestions
                  {suggestionsCount > 0 && (
                    <span className={styles.tabCount}>{suggestionsCount}</span>
                  )}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "health"}
                  className={styles.tab}
                  data-active={tab === "health"}
                  onClick={() => setTab("health")}
                >
                  Health
                  {healthCount > 0 && <span className={styles.tabCount}>{healthCount}</span>}
                </button>
              </div>
              <button
                type="button"
                className={styles.close}
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </header>

            <div className={styles.body}>
              <div hidden={tab !== "suggestions"}>
                <SuggestionsInbox projectId={projectId} />
              </div>
              <div hidden={tab !== "health"}>
                <SwarmHealthPanel projectId={projectId} />
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
