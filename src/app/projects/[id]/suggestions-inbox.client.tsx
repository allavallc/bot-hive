"use client";

// FS-025: PM suggestions inbox panel section. Lists pending suggestions
// from the bot_suggestions table and lets the admin (allavallc) Approve
// or Reject each. Reject opens an inline reason field.
//
// V1 also exposes a "File a suggestion" form so the admin can populate
// the inbox manually while bot-side API token auth is still pending
// (FS-025 v2). That form lets us exercise the flow end-to-end during
// rung-3 testing.

import { useCallback, useEffect, useState } from "react";
import styles from "./suggestions-inbox.module.css";

type Suggestion = {
  id: string;
  suggesterActor: string;
  targetPmActor: string;
  message: string;
  status: string;
  createdAt: string;
};

export function SuggestionsInbox({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showFile, setShowFile] = useState(false);
  const [fileSuggester, setFileSuggester] = useState("");
  const [fileTarget, setFileTarget] = useState("");
  const [fileMessage, setFileMessage] = useState("");

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/suggestions`);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error || `failed to load (${res.status})`);
        return;
      }
      const data = (await res.json()) as { suggestions: Suggestion[] };
      setItems(data.suggestions);
    } catch {
      setError("network error");
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const approve = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/projects/${projectId}/suggestions/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve" }),
        });
        await refresh();
      } catch {
        // Refresh on next tick will surface stale state.
      }
    },
    [projectId, refresh],
  );

  const reject = useCallback(
    async (id: string) => {
      const reason = rejectReason.trim();
      if (!reason) return;
      try {
        await fetch(`/api/projects/${projectId}/suggestions/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reject", reason }),
        });
        setRejectingId(null);
        setRejectReason("");
        await refresh();
      } catch {
        // ignore
      }
    },
    [projectId, refresh, rejectReason],
  );

  const fileSuggestion = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!fileSuggester.trim() || !fileTarget.trim() || !fileMessage.trim()) return;
      try {
        await fetch(`/api/projects/${projectId}/suggestions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            suggesterActor: fileSuggester.trim(),
            targetPmActor: fileTarget.trim(),
            message: fileMessage.trim(),
          }),
        });
        setFileSuggester("");
        setFileTarget("");
        setFileMessage("");
        setShowFile(false);
        await refresh();
      } catch {
        // ignore
      }
    },
    [projectId, refresh, fileSuggester, fileTarget, fileMessage],
  );

  if (error) {
    return (
      <section className={styles.section}>
        <h2 className={styles.heading}>Suggestions</h2>
        <p className={styles.error}>{error}</p>
      </section>
    );
  }

  const pending = items ?? [];

  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <h2 className={styles.heading}>
          Suggestions
          {pending.length > 0 && <span className={styles.count}>· {pending.length} pending</span>}
        </h2>
        <button type="button" className={styles.fileToggle} onClick={() => setShowFile((v) => !v)}>
          {showFile ? "Cancel" : "+ File a suggestion"}
        </button>
      </header>

      {showFile && (
        <form className={styles.fileForm} onSubmit={fileSuggestion}>
          <input
            className={styles.fileInput}
            placeholder="suggester (e.g. allavallc.dart)"
            value={fileSuggester}
            onChange={(e) => setFileSuggester(e.target.value)}
          />
          <input
            className={styles.fileInput}
            placeholder="target PM (e.g. allavallc.buzz)"
            value={fileTarget}
            onChange={(e) => setFileTarget(e.target.value)}
          />
          <textarea
            className={styles.fileMessage}
            placeholder="suggestion message"
            value={fileMessage}
            onChange={(e) => setFileMessage(e.target.value)}
            rows={3}
          />
          <button type="submit" className={styles.fileSubmit}>
            File
          </button>
        </form>
      )}

      {pending.length === 0 ? (
        <p className={styles.dim}>No pending suggestions.</p>
      ) : (
        <ul className={styles.list}>
          {pending.map((s) => (
            <li key={s.id} className={styles.row}>
              <div className={styles.from}>
                <span className={styles.actor}>{s.suggesterActor}</span>
                <span className={styles.arrow}>→</span>
                <span className={styles.actor}>{s.targetPmActor}</span>
              </div>
              <div className={styles.message}>{s.message}</div>
              <div className={styles.timing}>{new Date(s.createdAt).toLocaleString()}</div>
              {rejectingId === s.id ? (
                <div className={styles.actions}>
                  <input
                    className={styles.reasonInput}
                    placeholder="rejection reason (max 280 chars)"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value.slice(0, 280))}
                    maxLength={280}
                  />
                  <button
                    type="button"
                    className={styles.rejectConfirm}
                    onClick={() => reject(s.id)}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className={styles.cancel}
                    onClick={() => {
                      setRejectingId(null);
                      setRejectReason("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className={styles.actions}>
                  <button type="button" className={styles.approve} onClick={() => approve(s.id)}>
                    Approve
                  </button>
                  <button
                    type="button"
                    className={styles.reject}
                    onClick={() => {
                      setRejectingId(s.id);
                      setRejectReason("");
                    }}
                  >
                    Reject
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
