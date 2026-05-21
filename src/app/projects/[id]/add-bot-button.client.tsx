"use client";

import { useCallback, useState } from "react";
import styles from "./add-bot-button.module.css";

// Add-a-Bot is now only a UX affordance for the single canonical startup path.
// It does NOT pre-pick a handle or generate a bespoke spawn script anymore.
// The server assigns handle/seat/role, and the startup wrapper/stream handle
// secondary-bot worktree creation automatically.

export function AddBotButton({ projectId: _projectId }: { projectId: string; repoSlug?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"start" | "stop" | null>(null);

  const copyText = useCallback(async (text: string, marker: "start" | "stop") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(marker);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // User can manually select + copy if clipboard API blocked
    }
  }, []);

  const startPhrase = "hive add a bot";
  const stopPhrase = "hive shutdown";

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
        aria-label="Add a bot"
      >
        + Add a bot
      </button>

      {open && (
        <div
          className={styles.backdrop}
          onClick={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          // biome-ignore lint/a11y/useSemanticElements: render-controlled modal visibility mirrors the established project pattern here
          role="dialog"
          aria-modal="true"
          aria-label="Add a bot"
        >
          <div
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <header className={styles.modalHeader}>
              <span className={styles.modalTitle}>Add a bot</span>
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
              <div className={styles.step}>
                <h3 className={styles.stepTitle}>Single startup path</h3>
                <p className={styles.stepInstructions}>
                  Open a new terminal, start your LLM, and type this exactly:
                </p>
                <pre className={styles.codeSecondary}>{startPhrase}</pre>
                <button
                  type="button"
                  className={styles.copyButton}
                  onClick={() => copyText(startPhrase, "start")}
                >
                  {copied === "start" ? "Copied ✓" : "Copy"}
                </button>
              </div>

              <div className={styles.step}>
                <h3 className={styles.stepTitle}>What happens next</h3>
                <p className={styles.stepInstructions}>
                  The server assigns the new bot's handle, seat, and role. If this is bot 2, 3, 4,
                  or higher, the startup wrapper and stream create/use the bot's dedicated
                  worktree/session root automatically.
                </p>
              </div>

              <div className={styles.step}>
                <h3 className={styles.stepTitle}>When you are done</h3>
                <p className={styles.stepInstructions}>In that bot's terminal, sign off with:</p>
                <pre className={styles.codeSecondary}>{stopPhrase}</pre>
                <button
                  type="button"
                  className={styles.copyButton}
                  onClick={() => copyText(stopPhrase, "stop")}
                >
                  {copied === "stop" ? "Copied ✓" : "Copy"}
                </button>
              </div>

              <hr className={styles.divider} />

              <p className={styles.disclaimer}>
                ⚠ Each bot consumes from your LLM subscription/credits — N parallel bots ≈ N× the
                rate-limit consumption.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
