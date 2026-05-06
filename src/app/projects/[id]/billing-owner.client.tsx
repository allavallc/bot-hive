"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./billing-owner.module.css";

type Collaborator = {
  userId: string;
  login: string;
  avatarUrl: string;
};

export function BillingOwnerPanel({
  projectId,
  currentOwner,
  isOwner,
  collaborators,
}: {
  projectId: string;
  currentOwner: { userId: string; login: string; avatarUrl: string };
  isOwner: boolean;
  collaborators: Collaborator[];
}) {
  const [target, setTarget] = useState<Collaborator | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (target && !dlg.open) dlg.showModal();
    if (!target && dlg.open) dlg.close();
  }, [target]);

  const otherCollaborators = collaborators.filter((c) => c.userId !== currentOwner.userId);

  function openTakeover() {
    // The current viewer is taking over — target is the viewer.
    const me = collaborators.find((c) => c.userId !== currentOwner.userId);
    if (!me) {
      setError("you don't appear in the collaborator list");
      return;
    }
    setTarget(me);
  }

  function openTransfer(collab: Collaborator) {
    setTarget(collab);
  }

  async function confirm() {
    if (!target) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/billing-owner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: target.userId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `error ${res.status}`);
        setSubmitting(false);
        return;
      }
      // Reload to reflect new owner everywhere.
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
      setSubmitting(false);
    }
  }

  function cancel() {
    setTarget(null);
    setError(null);
  }

  return (
    <section className={styles.panel} aria-labelledby="billing-owner-heading">
      <h2 id="billing-owner-heading" className={styles.heading}>
        Billing owner
      </h2>
      <div className={styles.row}>
        <img src={currentOwner.avatarUrl} alt="" className={styles.avatar} width={32} height={32} />
        <span className={styles.login}>{currentOwner.login}</span>
        {isOwner && <span className={styles.youBadge}>you</span>}
      </div>

      {isOwner ? (
        <div className={styles.actions}>
          <span className={styles.label}>Transfer to:</span>
          {otherCollaborators.length === 0 ? (
            <span className={styles.empty}>no other collaborators on this repo</span>
          ) : (
            <div className={styles.collabList}>
              {otherCollaborators.map((c) => (
                <button
                  key={c.userId}
                  type="button"
                  className={styles.collabButton}
                  onClick={() => openTransfer(c)}
                >
                  <img src={c.avatarUrl} alt="" width={20} height={20} />
                  <span>{c.login}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={styles.actions}>
          <button type="button" className={styles.takeoverButton} onClick={openTakeover}>
            Take over billing
          </button>
        </div>
      )}

      <dialog ref={dialogRef} className={styles.confirmModal} onClose={cancel}>
        {target && (
          <>
            <h3>
              {isOwner ? "Transfer billing to" : "Take over billing as"} {target.login}?
            </h3>
            <p>
              The billing seat will move from <strong>{currentOwner.login}</strong> to{" "}
              <strong>{target.login}</strong>. This is reversible — anyone on the repo can transfer
              again later.
            </p>
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.confirmActions}>
              <button type="button" onClick={cancel} disabled={submitting}>
                Cancel
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={submitting}
                className={styles.confirmButton}
              >
                {submitting ? "Working…" : "Confirm"}
              </button>
            </div>
          </>
        )}
      </dialog>
    </section>
  );
}
