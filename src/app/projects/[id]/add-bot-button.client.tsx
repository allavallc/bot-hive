"use client";

import { robotColor } from "@/components/robot-mascot";
import { useCallback, useEffect, useState } from "react";
import styles from "./add-bot-button.module.css";
import { type Platform, step1Command, step2Command } from "./add-bot-spawn-command";

// "Add a bot" button + modal. Click → server picks the next free handle
// from hive/handles.txt and returns it along with the list of currently
// active handles. Modal shows a single copy-paste line that opens a new
// Windows Terminal (or macOS Terminal) tab/window with Claude Code
// running in a fresh git worktree at ./worktrees/<handle>/.
//
// User pastes the line in their main terminal. New terminal pops open
// with the bot ready to bootstrap via hive/bot-startup.md — the spawn
// command writes a .bot-hive-kickoff marker so the operator doesn't have
// to re-type `start the hive` in the new terminal (HV-129).

type NextHandleResp = {
  nextHandle: string;
  activeHandles: string[];
  poolSize: number;
  colony: string;
};

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "linux";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "mac";
  return "linux";
}

export function AddBotButton({ projectId }: { projectId: string; repoSlug?: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NextHandleResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>("linux");
  const [copied, setCopied] = useState<"step1" | "step2" | "step3" | null>(null);

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  const fetchHandle = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/next-handle`);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error || "failed to fetch handle");
        return;
      }
      setData((await res.json()) as NextHandleResp);
    } catch {
      setError("network error");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const onOpen = useCallback(() => {
    setOpen(true);
    setCopied(null);
    void fetchHandle();
  }, [fetchHandle]);

  const copyText = useCallback(async (text: string, marker: "step1" | "step2" | "step3") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(marker);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // User can manually select + copy if clipboard API blocked
    }
  }, []);

  return (
    <>
      <button type="button" className={styles.trigger} onClick={onOpen} aria-label="Add a bot">
        + Add a bot
      </button>

      {open && (
        <div
          className={styles.backdrop}
          onClick={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          // biome-ignore lint/a11y/useSemanticElements: <dialog> + show()/showModal() conflicts with our React render-controlled visibility
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
              {loading && <p className={styles.dim}>Picking handle…</p>}
              {error && <p className={styles.error}>{error}</p>}
              {data && (
                <>
                  <div className={styles.handleRow}>
                    <span className={styles.dim}>Next free handle:</span>
                    <span className={styles.handle} style={{ color: robotColor(data.nextHandle) }}>
                      {data.nextHandle}
                    </span>
                  </div>

                  <div className={styles.platformRow}>
                    <label htmlFor="platform" className={styles.dim}>
                      Platform:
                    </label>
                    <select
                      id="platform"
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value as Platform)}
                      className={styles.platformSelect}
                    >
                      <option value="windows">Windows (Windows Terminal)</option>
                      <option value="mac">macOS (Terminal)</option>
                      <option value="linux">Linux / other</option>
                    </select>
                  </div>

                  {(() => {
                    const s1 = step1Command(platform, data.nextHandle, data.colony);
                    const s2 = step2Command(platform, data.nextHandle);
                    const s3 = "Read hive/bot-startup.md and tell me what you're going to work on.";
                    return (
                      <>
                        <div className={styles.step}>
                          <h3 className={styles.stepTitle}>Step 1 — create the worktree</h3>
                          <p className={styles.stepInstructions}>
                            Copy this and paste it into <strong>{s1.runIn}</strong>. It creates a
                            new git worktree at <code>worktrees/{data.nextHandle}/</code> and opens
                            a new terminal window in that directory.
                          </p>
                          <pre className={styles.code}>{s1.command}</pre>
                          <button
                            type="button"
                            className={styles.copyButton}
                            onClick={() => copyText(s1.command, "step1")}
                          >
                            {copied === "step1" ? "Copied ✓" : "Copy"}
                          </button>
                        </div>

                        <div className={styles.step}>
                          <h3 className={styles.stepTitle}>Step 2 — start Claude Code</h3>
                          <p className={styles.stepInstructions}>
                            Copy this and paste it into <strong>{s2.runIn}</strong>. It sets the
                            bot's handle and launches Claude Code.
                          </p>
                          <pre className={styles.code}>{s2.command}</pre>
                          <button
                            type="button"
                            className={styles.copyButton}
                            onClick={() => copyText(s2.command, "step2")}
                          >
                            {copied === "step2" ? "Copied ✓" : "Copy"}
                          </button>
                        </div>

                        <div className={styles.step}>
                          <h3 className={styles.stepTitle}>Step 3 — bootstrap the bot</h3>
                          <p className={styles.stepInstructions}>
                            Once Claude Code is running, copy this and paste it{" "}
                            <strong>into the Claude Code chat</strong>. The bot will read the
                            startup guide and pick its first task.
                          </p>
                          <pre className={styles.codeSecondary}>{s3}</pre>
                          <button
                            type="button"
                            className={styles.copyButton}
                            onClick={() => copyText(s3, "step3")}
                          >
                            {copied === "step3" ? "Copied ✓" : "Copy"}
                          </button>
                        </div>
                      </>
                    );
                  })()}

                  <hr className={styles.divider} />

                  <p className={styles.disclaimer}>
                    ⚠ Each bot consumes from your Claude subscription/credits — N parallel bots ≈ N×
                    the rate-limit consumption. Heavy parallel usage can throttle on Pro/Max or rack
                    up tokens on API plans.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
