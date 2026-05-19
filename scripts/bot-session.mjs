import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SESSION_DIR_NAME = ".bot-hive-sessions";

function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function getSharedHiveRoot(cwd = process.cwd(), execImpl = execFileSync) {
  try {
    const commonDir = safeTrim(
      execImpl("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
    if (commonDir) {
      return path.dirname(commonDir);
    }
  } catch {}
  return cwd;
}

export function getSessionDir(sharedRoot) {
  return path.join(sharedRoot, SESSION_DIR_NAME);
}

export function sessionRecordBasename(clientSessionId) {
  const digest = crypto.createHash("sha256").update(clientSessionId).digest("hex");
  return `${digest}.json`;
}

export function getSessionRecordPath(sharedRoot, clientSessionId) {
  return path.join(getSessionDir(sharedRoot), sessionRecordBasename(clientSessionId));
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function readSessionRecord(sharedRoot, clientSessionId) {
  return readJson(getSessionRecordPath(sharedRoot, clientSessionId));
}

export function writeSessionRecord(sharedRoot, clientSessionId, record) {
  fs.mkdirSync(getSessionDir(sharedRoot), { recursive: true });
  fs.writeFileSync(
    getSessionRecordPath(sharedRoot, clientSessionId),
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8",
  );
}

export function clearSessionRecord(sharedRoot, clientSessionId) {
  try {
    fs.rmSync(getSessionRecordPath(sharedRoot, clientSessionId), { force: true });
  } catch {}
}

export function pidIsAlive(pid) {
  const n = Number.parseInt(`${pid ?? ""}`, 10);
  if (!Number.isFinite(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch {
    return false;
  }
}

function readPosixTty(cwd, execImpl = execFileSync) {
  try {
    const tty = safeTrim(
      execImpl("tty", [], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
    if (tty && tty !== "not a tty") return tty;
  } catch {}
  return "";
}

function readWindowsProcessChain(startPid, cwd, execImpl = execFileSync) {
  const script = [
    "$pidToInspect = [int]$args[0]",
    "$rows = @()",
    "while ($pidToInspect -gt 0) {",
    '  try { $p = Get-CimInstance Win32_Process -Filter "ProcessId=$pidToInspect" -ErrorAction Stop } catch { break }',
    "  if (-not $p) { break }",
    "  $rows += [pscustomobject]@{ pid = [int]$p.ProcessId; ppid = [int]$p.ParentProcessId; name = [string]$p.Name }",
    "  if ([int]$p.ParentProcessId -eq $pidToInspect) { break }",
    "  $pidToInspect = [int]$p.ParentProcessId",
    "}",
    "$rows | ConvertTo-Json -Compress",
  ].join(" ");
  try {
    const raw = safeTrim(
      execImpl("powershell", ["-NoProfile", "-Command", script, String(startPid)], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function selectWindowsAnchor(chain) {
  const preferred = [
    /claude/i,
    /codex/i,
    /cursor/i,
    /aider/i,
    /gemini/i,
    /opencode/i,
    /code\.exe/i,
    /powershell/i,
    /^pwsh/i,
    /cmd\.exe/i,
    /windowsterminal/i,
    /bash/i,
    /wsl/i,
  ];
  for (const matcher of preferred) {
    const found = chain.find((entry) => matcher.test(entry?.name ?? ""));
    if (found) return found;
  }
  return chain[0] ?? { pid: process.ppid, name: "unknown" };
}

export function deriveClientSessionId({
  cwd = process.cwd(),
  platform = process.platform,
  env = process.env,
  ppid = process.ppid,
  execImpl = execFileSync,
} = {}) {
  const normalizedCwd = path.resolve(cwd);
  if (platform === "win32") {
    const chain = readWindowsProcessChain(ppid, cwd, execImpl);
    const anchor = selectWindowsAnchor(chain);
    const name = safeTrim(anchor.name || "unknown")
      .replace(/\s+/g, "_")
      .toLowerCase();
    return `winproc:${anchor.pid}:${name}:${normalizedCwd}`;
  }

  const envAnchor = safeTrim(
    env.TMUX_PANE || env.TERM_SESSION_ID || env.KITTY_WINDOW_ID || env.WT_SESSION || "",
  );
  if (envAnchor) {
    return `termenv:${envAnchor}:${normalizedCwd}`;
  }

  const tty = readPosixTty(cwd, execImpl);
  if (tty) {
    return `tty:${tty}:${normalizedCwd}`;
  }

  return `ppid:${ppid}:${normalizedCwd}`;
}

export function resolveStateDir({
  cwd = process.cwd(),
  clientSessionId,
  execImpl = execFileSync,
} = {}) {
  const sharedRoot = getSharedHiveRoot(cwd, execImpl);
  const sessionId = clientSessionId || deriveClientSessionId({ cwd, execImpl });
  const record = readSessionRecord(sharedRoot, sessionId);
  if (record?.stateDir && fs.existsSync(record.stateDir)) {
    return path.resolve(record.stateDir);
  }
  return path.resolve(cwd);
}

function main(argv) {
  const command = argv[2] || "state-dir";
  const cwd = process.cwd();
  const sharedRoot = getSharedHiveRoot(cwd);
  const clientSessionId = deriveClientSessionId({ cwd });
  if (command === "shared-root") {
    process.stdout.write(`${sharedRoot}\n`);
    return;
  }
  if (command === "state-dir") {
    process.stdout.write(`${resolveStateDir({ cwd })}\n`);
    return;
  }
  if (command === "client-session-id") {
    process.stdout.write(`${clientSessionId}\n`);
    return;
  }
  if (command === "clear-current") {
    clearSessionRecord(sharedRoot, clientSessionId);
    return;
  }
  throw new Error(`unknown command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv);
}
