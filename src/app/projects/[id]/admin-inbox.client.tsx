"use client";

// Admin inbox: a single fixed-position button that opens a centered modal
// containing the Suggestions inbox and Swarm health panel, stacked.
// Always visible to admin users — `Inbox · 0` when nothing's pending,
// `Inbox · N` otherwise.

import { useCallback, useEffect, useState } from "react";
import styles from "./admin-inbox.module.css";
import { SuggestionsInbox } from "./suggestions-inbox.client";
import { SwarmHealthPanel } from "./swarm-health-panel.client";

const COUNT_REFRESH_MS = 30_000;

export function AdminInbox({ projectId, isAdmin }: { projectId: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
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
      // Counts retry on the next interval.
    }
  }, [projectId, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    void refreshCounts();
    const id = setInterval(() => void refreshCounts(), COUNT_REFRESH_MS);
    return () => clearInterval(id);
  }, [refreshCounts, isAdmin]);

  if (!isAdmin) return null;

  const total = suggestionsCount + healthCount;
  const hasCritical = healthCount > 0;

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => {
          setOpen(true);
          // Re-fetch on open so the modal shows current state immediately.
          void refreshCounts();
        }}
        aria-label={`Inbox (${total} item${total === 1 ? "" : "s"})`}
        data-has-critical={hasCritical || undefined}
      >
        Inbox · {total}
      </button>

      {open && (
        <div
          className={styles.backdrop}
          onClick={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          // biome-ignore lint/a11y/useSemanticElements: <dialog> + show/showModal conflicts with React render-controlled visibility
          role="dialog"
          aria-modal="true"
          aria-label="Admin inbox"
        >
          <div
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <header className={styles.modalHeader}>
              <span className={styles.modalTitle}>Admin inbox</span>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </header>

            <div className={styles.body}>
              <SuggestionsInbox projectId={projectId} />
              <SwarmHealthPanel projectId={projectId} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
