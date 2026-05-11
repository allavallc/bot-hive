"use client";

// FS-022: swarm health panel section. Renders open anomalies for the
// project, sorted by severity. Mark-resolved button per row.
//
// Gated server-side AND here: only the user named "allavallc" sees it.
// Other Bot Hive customers don't render it at all (the parent decides
// whether to mount this component based on the same gate).

import { useCallback, useEffect, useState } from "react";
import styles from "./swarm-health-panel.module.css";

type Anomaly = {
  id: string;
  code: string;
  severity: "critical" | "warning" | "info" | string;
  message: string;
  details: Record<string, unknown>;
  firstSeenAt: string;
  lastSeenAt: string;
};

export function SwarmHealthPanel({ projectId }: { projectId: string }) {
  const [anomalies, setAnomalies] = useState<Anomaly[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/health`);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error || `failed to fetch (${res.status})`);
        return;
      }
      const data = (await res.json()) as { anomalies: Anomaly[] };
      setAnomalies(data.anomalies);
    } catch {
      setError("network error");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const markResolved = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/projects/${projectId}/health/${id}`, { method: "PATCH" });
        await refresh();
      } catch {
        // Ignore — refresh on next tick will surface stale state.
      }
    },
    [projectId, refresh],
  );

  if (loading && anomalies === null) {
    return (
      <section className={styles.section}>
        <h2 className={styles.heading}>Swarm health</h2>
        <p className={styles.dim}>Loading…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.section}>
        <h2 className={styles.heading}>Swarm health</h2>
        <p className={styles.error}>{error}</p>
      </section>
    );
  }

  const open = anomalies ?? [];

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>
        Swarm health{open.length > 0 && <span className={styles.count}>· {open.length} open</span>}
      </h2>
      {open.length === 0 ? (
        <p className={styles.dim}>No open anomalies.</p>
      ) : (
        <ul className={styles.list}>
          {open.map((a) => (
            <li key={a.id} className={styles.row} data-severity={a.severity}>
              <span className={styles.severity} data-severity={a.severity}>
                {a.severity}
              </span>
              <div className={styles.body}>
                <div className={styles.code}>{a.code}</div>
                <div className={styles.message}>{a.message}</div>
                <div className={styles.timing}>
                  first seen {new Date(a.firstSeenAt).toLocaleString()} · last seen{" "}
                  {new Date(a.lastSeenAt).toLocaleString()}
                </div>
              </div>
              <button
                type="button"
                className={styles.resolve}
                onClick={() => markResolved(a.id)}
                aria-label="Mark resolved"
              >
                Mark resolved
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
