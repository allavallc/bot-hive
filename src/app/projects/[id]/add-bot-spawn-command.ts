// HV-100 ADR: Each step is ONE shell. Don't compose commands across shells —
// PowerShell's variable substitution happens at every layer and ate
// $env:BOT_HIVE_HANDLE before it reached the inner shell. Three pastes,
// each in one shell, no escaping interaction. Boring but bulletproof.
//
// ADR-003: Step 1 also writes .bot-hive-identity in the worktree so the
// bot's identity (colony + handle) survives shell restarts and isn't tied
// to env vars. Step 2 simplifies to just `claude` — the file is there.
//
// HV-104: the bot's identity is stamped into THREE places at spawn so the
// human can tell terminals apart at a glance:
//   1. .bot-hive-identity (canonical; read by all bot CLI helpers)
//   2. .claude/settings.json statusLine command (shows in chat, persistent)
//   3. wt.exe / osascript window title (shows in tab bar)
//
// HV-129: the spawn flow also writes a .bot-hive-kickoff marker file. Its
// presence is the kickoff signal — bot-startup.md treats it as equivalent
// to the operator typing `start the hive`, so the operator doesn't have
// to re-type the phrase in every new terminal. The marker is one-shot:
// step 4 of bootstrap deletes it.

export type Platform = "windows" | "mac" | "linux";

export type StepCommand = { command: string; runIn: string };

// FS-028 / HV-135: bots also need the UserPromptSubmit hook wired to
// scripts/check-role so role changes are announced mid-session. Earlier
// versions wrote a settings.json with only statusLine, which silently
// disabled the role-change announce for every spawned bot.
const claudeSettingsPosix = (worktreeDir: string) =>
  `mkdir -p ${worktreeDir}/.claude && printf '{\\n  "statusLine": {\\n    "type": "command",\\n    "command": "bash ./scripts/claude-statusline.sh"\\n  },\\n  "hooks": {\\n    "UserPromptSubmit": [{\\n      "matcher": "*",\\n      "hooks": [{\\n        "type": "command",\\n        "command": "bash ./scripts/check-role.sh"\\n      }]\\n    }]\\n  }\\n}\\n' > ${worktreeDir}/.claude/settings.json`;

// One-line JSON on purpose. Single-quoted PowerShell strings are literal
// — backtick escapes (`n) are NOT expanded. Older multi-line attempt
// wrote the literal characters `n into the file, breaking JSON parse.
// One-liner sidesteps the entire escape-interpretation problem.
const claudeSettingsWindows = (worktreeDir: string) =>
  `New-Item -ItemType Directory -Force -Path ${worktreeDir}/.claude | Out-Null; Set-Content -Path ${worktreeDir}/.claude/settings.json -Value '{"statusLine":{"type":"command","command":"powershell -NoProfile -File ./scripts/claude-statusline.ps1"},"hooks":{"UserPromptSubmit":[{"matcher":"*","hooks":[{"type":"command","command":"powershell -NoProfile -File ./scripts/check-role.ps1"}]}]}}'`;

const kickoffMarkerPosix = (worktreeDir: string) => `: > ${worktreeDir}/.bot-hive-kickoff`;

const kickoffMarkerWindows = (worktreeDir: string) =>
  `Set-Content -Path ${worktreeDir}/.bot-hive-kickoff -Value ''`;

export function step1Command(platform: Platform, handle: string, colony: string): StepCommand {
  const branch = `${handle}-work`;
  const worktreeDir = `worktrees/${handle}`;
  const tabTitle = `${colony}.${handle}`;
  if (platform === "windows") {
    return {
      command: `if (Test-Path ${worktreeDir}) { git worktree remove ${worktreeDir} --force }; git worktree add ${worktreeDir} -B ${branch}; Set-Content -Path ${worktreeDir}/.bot-hive-identity -Value "colony=${colony}\`nhandle=${handle}"; ${kickoffMarkerWindows(worktreeDir)}; ${claudeSettingsWindows(worktreeDir)}; wt.exe new-tab --title "${tabTitle}" -d "${worktreeDir}"`,
      runIn: "your main bot-hive terminal",
    };
  }
  if (platform === "mac") {
    return {
      command: `if [ -d ${worktreeDir} ]; then git worktree remove ${worktreeDir} --force; fi && git worktree add ${worktreeDir} -B ${branch} && printf 'colony=${colony}\\nhandle=${handle}\\n' > ${worktreeDir}/.bot-hive-identity && ${kickoffMarkerPosix(worktreeDir)} && ${claudeSettingsPosix(worktreeDir)} && osascript -e 'tell application "Terminal" to do script "cd ${worktreeDir} && echo -e \\"\\\\033]0;${tabTitle}\\\\007\\""'`,
      runIn: "your main bot-hive terminal",
    };
  }
  return {
    command: `if [ -d ${worktreeDir} ]; then git worktree remove ${worktreeDir} --force; fi && git worktree add ${worktreeDir} -B ${branch} && printf 'colony=${colony}\\nhandle=${handle}\\n' > ${worktreeDir}/.bot-hive-identity && ${kickoffMarkerPosix(worktreeDir)} && ${claudeSettingsPosix(worktreeDir)}\n# Then open a new terminal manually in ${worktreeDir} (set tab title to ${tabTitle} if your terminal supports it)`,
    runIn: "your main bot-hive terminal",
  };
}

export function step2Command(_platform: Platform, _handle: string): StepCommand {
  // ADR-003: identity file is already in the worktree from Step 1, so no
  // env var to set. Just run claude.
  return {
    command: "claude",
    runIn: "the new terminal that just opened",
  };
}
