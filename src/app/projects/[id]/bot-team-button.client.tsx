"use client";

// "See Bot Team" — fixed-position trigger button mirroring AddBotButton +
// AdminInbox shape. Opens a centered modal listing every active bot in
// the project, grouped by colony with seat numbers + roles. Subscribes
// to the existing project SSE stream so the modal updates live when
// bots join, leave, or are reclaimed.
//
// HV-132 / FS-028.

import { useCallback, useEffect, useState } from "react";
import styles from "./bot-team-button.module.css";

type SeatEntry = { handle: string; seat: number; role: string };
type ColonyEntry = { colony: string; seats: SeatEntry[] };

type ColonyEvent =
  | { type: "bot-joined"; colony: string; seatMap: SeatEntry[] }
  | { type: "bot-left"; colony: string; seatMap: SeatEntry[] };

export function BotTeamButton({
  projectId,
  githubRepo,
}: {
  projectId: string;
  githubRepo: string;
}) {
  const [open, setOpen] = useState(false);
  const [colonies, setColonies] = useState<ColonyEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bots/colony?repo_full_name=${encodeURIComponent(githubRepo)}`);
      if (!res.ok) {
        setError(`server responded ${res.status}`);
        return;
      }
      const data = (await res.json()) as { colonies: ColonyEntry[] };
      setColonies(data.colonies ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "fetch failed");
    } finally {
      setLoading(false);
    }
  }, [githubRepo]);

  // Live updates via the project SSE stream.
  useEffect(() => {
    const es = new EventSource(`/api/projects/${projectId}/stream`);
    es.onmessage = (ev) => {
      let event: ColonyEvent | { type: string } | null = null;
      try {
        event = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!event || (event.type !== "bot-joined" && event.type !== "bot-left")) return;
      const colonyEvent = event as ColonyEvent;
      setColonies((prev) => {
        const next = prev.filter((c) => c.colony !== colonyEvent.colony);
        if (colonyEvent.seatMap.length > 0) {
          next.push({ colony: colonyEvent.colony, seats: colonyEvent.seatMap });
        }
        next.sort((a, b) => a.colony.localeCompare(b.colony));
        return next;
      });
    };
    return () => es.close();
  }, [projectId]);

  const totalBots = colonies.reduce((sum, c) => sum + c.seats.length, 0);

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => {
          setOpen(true);
          void refresh();
        }}
        aria-label={`See bot team (${totalBots} active)`}
      >
        See Bot Team{totalBots > 0 ? ` · ${totalBots}` : ""}
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
          aria-label="Bot team"
        >
          <div
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <header className={styles.modalHeader}>
              <span className={styles.modalTitle}>Bot team</span>
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
              {loading && colonies.length === 0 && <p className={styles.empty}>Loading…</p>}
              {error && <p className={styles.error}>Error: {error}</p>}
              {!loading && !error && colonies.length === 0 && (
                <p className={styles.empty}>No bots active in any colony.</p>
              )}
              {colonies.map((c) => (
                <section key={c.colony} className={styles.colony}>
                  <h3 className={styles.colonyName}>{c.colony}</h3>
                  <ul className={styles.seatList}>
                    {c.seats.map((s) => (
                      <li key={s.handle} className={styles.seatRow}>
                        <span className={styles.seatNum}>seat {s.seat}</span>
                        <span className={styles.handle}>{s.handle}</span>
                        <span className={styles.role}>{s.role}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
