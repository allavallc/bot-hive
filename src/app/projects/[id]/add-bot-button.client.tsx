"use client";

import { robotColor } from "@/components/robot-mascot";
import { useCallback, useEffect, useState } from "react";
import styles from "./add-bot-button.module.css";

// "Add a bot" button + modal. Click → server picks the next free handle
// from hive/handles.txt and returns it along with the list of currently
// active handles. Modal shows a single copy-paste line that opens a new
// Windows Terminal (or macOS Terminal) tab/window with Claude Code
// running in a fresh git worktree at ./worktrees/<handle>/, with
// BOT_HIVE_HANDLE pre-set.
//
// User pastes the line in their main terminal. New terminal pops open
// with the bot ready to bootstrap via hive/bot-startup.md.

type NextHandleResp = {
  nextHandle: string;
  activeHandles: string[];
  poolSize: number;
};

type Platform = "windows" | "mac" | "linux";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "linux";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "mac";
  return "linux";
}

function commandFor(platform: Platform, handle: string): string {
  const branch = `${handle}-work`;
  const worktreeDir = `worktrees/${handle}`;
  if (platform === "windows") {
    // Escape the inner semicolon as \; so wt.exe passes it through to
    // PowerShell instead of interpreting it as a wt.exe command separator.
    // (https://learn.microsoft.com/en-us/windows/terminal/command-line-arguments)
    return [
      `git worktree add ${worktreeDir} -b ${branch}`,
      `wt.exe new-tab -d "${worktreeDir}" pwsh -NoExit -Command "$env:BOT_HIVE_HANDLE='${handle}'\\; claude"`,
    ].join("; ");
  }
  if (platform === "mac") {
    return [
      `git worktree add ${worktreeDir} -b ${branch}`,
      `osascript -e 'tell app "Terminal" to do script "cd ${worktreeDir} && export BOT_HIVE_HANDLE=${handle} && claude"'`,
    ].join(" && ");
  }
  return [
    `git worktree add ${worktreeDir} -b ${branch}`,
    "# Open a new terminal, then run:",
    `cd ${worktreeDir} && export BOT_HIVE_HANDLE=${handle} && claude`,
  ].join("\n");
}

export function AddBotButton({ projectId }: { projectId: string; repoSlug?: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NextHandleResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>("linux");
  const [copied, setCopied] = useState<"command" | "bootstrap" | null>(null);

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

  const onCopyCommand = useCallback(async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(commandFor(platform, data.nextHandle));
      setCopied("command");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // User can manually select + copy if clipboard API blocked
    }
  }, [data, platform]);

  const onCopyBootstrap = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        "Read hive/bot-startup.md and tell me what you're going to work on.",
      );
      setCopied("bootstrap");
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

                  <div className={styles.step}>
                    <h3 className={styles.stepTitle}>Step 1</h3>
                    <p className={styles.stepInstructions}>
                      Copy this and paste it into <strong>your main bot-hive terminal</strong>. A
                      new terminal window will open with Claude Code running.
                    </p>
                    <pre className={styles.code}>{commandFor(platform, data.nextHandle)}</pre>
                    <button type="button" className={styles.copyButton} onClick={onCopyCommand}>
                      {copied === "command" ? "Copied ✓" : "Copy"}
                    </button>
                  </div>

                  <div className={styles.step}>
                    <h3 className={styles.stepTitle}>Step 2</h3>
                    <p className={styles.stepInstructions}>
                      Once Claude Code is running, copy this and paste it into{" "}
                      <strong>the new terminal</strong>. The bot will read the startup guide and
                      pick its first task.
                    </p>
                    <pre className={styles.codeSecondary}>
                      Read hive/bot-startup.md and tell me what you're going to work on.
                    </pre>
                    <button type="button" className={styles.copyButton} onClick={onCopyBootstrap}>
                      {copied === "bootstrap" ? "Copied ✓" : "Copy"}
                    </button>
                  </div>

                  <hr className={styles.divider} />

                  {data.activeHandles.length > 0 ? (
                    <div className={styles.activeBots}>
                      <span className={styles.dim}>Currently active:</span>
                      <div className={styles.activeBotsList}>
                        {data.activeHandles.map((h) => (
                          <span
                            key={h}
                            className={styles.activeBotPill}
                            style={{ color: robotColor(h) }}
                          >
                            ● {h}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className={styles.dim}>No bots currently active.</p>
                  )}

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
