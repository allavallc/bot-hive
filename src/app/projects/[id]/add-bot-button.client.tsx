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
  colony: string;
};

type Platform = "windows" | "mac" | "linux";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "linux";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "mac";
  return "linux";
}

// HV-100 ADR: Each step is ONE shell. Don't compose commands across shells —
// PowerShell's variable substitution happens at every layer and ate
// $env:BOT_HIVE_HANDLE before it reached the inner shell. Three pastes,
// each in one shell, no escaping interaction. Boring but bulletproof.
//
// ADR-003: Step 1 also writes .bot-hive-identity in the worktree so the
// bot's identity (colony + handle) survives shell restarts and isn't tied
// to env vars. Step 2 simplifies to just `claude` — the file is there.

type StepCommand = { command: string; runIn: string };

// HV-104: the bot's identity is stamped into THREE places at spawn so the
// human can tell terminals apart at a glance:
//   1. .bot-hive-identity (canonical; read by all bot CLI helpers)
//   2. .claude/settings.json statusLine command (shows in chat, persistent)
//   3. wt.exe / osascript window title (shows in tab bar)
const claudeSettingsPosix = (worktreeDir: string) =>
  `mkdir -p ${worktreeDir}/.claude && printf '{\\n  "statusLine": {\\n    "type": "command",\\n    "command": "bash ./scripts/claude-statusline.sh"\\n  }\\n}\\n' > ${worktreeDir}/.claude/settings.json`;

const claudeSettingsWindows = (worktreeDir: string) =>
  `New-Item -ItemType Directory -Force -Path ${worktreeDir}/.claude | Out-Null; Set-Content -Path ${worktreeDir}/.claude/settings.json -Value '{\`n  "statusLine": {\`n    "type": "command",\`n    "command": "powershell -NoProfile -File ./scripts/claude-statusline.ps1"\`n  }\`n}'`;

function step1Command(platform: Platform, handle: string, colony: string): StepCommand {
  const branch = `${handle}-work`;
  const worktreeDir = `worktrees/${handle}`;
  const tabTitle = `${colony}.${handle}`;
  if (platform === "windows") {
    return {
      command: `if (Test-Path ${worktreeDir}) { git worktree remove ${worktreeDir} --force }; git worktree add ${worktreeDir} -B ${branch}; Set-Content -Path ${worktreeDir}/.bot-hive-identity -Value "colony=${colony}\`nhandle=${handle}"; ${claudeSettingsWindows(worktreeDir)}; wt.exe new-tab --title "${tabTitle}" -d "${worktreeDir}"`,
      runIn: "your main bot-hive terminal",
    };
  }
  if (platform === "mac") {
    return {
      command: `if [ -d ${worktreeDir} ]; then git worktree remove ${worktreeDir} --force; fi && git worktree add ${worktreeDir} -B ${branch} && printf 'colony=${colony}\\nhandle=${handle}\\n' > ${worktreeDir}/.bot-hive-identity && ${claudeSettingsPosix(worktreeDir)} && osascript -e 'tell application "Terminal" to do script "cd ${worktreeDir} && echo -e \\"\\\\033]0;${tabTitle}\\\\007\\""'`,
      runIn: "your main bot-hive terminal",
    };
  }
  return {
    command: `if [ -d ${worktreeDir} ]; then git worktree remove ${worktreeDir} --force; fi && git worktree add ${worktreeDir} -B ${branch} && printf 'colony=${colony}\\nhandle=${handle}\\n' > ${worktreeDir}/.bot-hive-identity && ${claudeSettingsPosix(worktreeDir)}\n# Then open a new terminal manually in ${worktreeDir} (set tab title to ${tabTitle} if your terminal supports it)`,
    runIn: "your main bot-hive terminal",
  };
}

function step2Command(_platform: Platform, _handle: string): StepCommand {
  // ADR-003: identity file is already in the worktree from Step 1, so no
  // env var to set. Just run claude.
  return {
    command: "claude",
    runIn: "the new terminal that just opened",
  };
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
