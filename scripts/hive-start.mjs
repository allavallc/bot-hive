import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  clearSessionRecord,
  deriveClientSessionId,
  getSharedHiveRoot,
  pidIsAlive,
  readSessionRecord,
  writeSessionRecord,
} from "./bot-session.mjs";

const cwd = process.cwd();
const sharedRoot = getSharedHiveRoot(cwd);
const logPath = path.join(sharedRoot, ".bot-hive.log");

function log(message) {
  try {
    const ts = new Date().toISOString();
    fs.appendFileSync(logPath, `${ts} [hive-start] ${message}\n`, "utf8");
  } catch {}
}

export function parseKeyValueText(text) {
  const result = {};
  for (const line of `${text ?? ""}`.split(/\r?\n/)) {
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    result[line.slice(0, idx)] = line.slice(idx + 1).trim();
  }
  return result;
}

export function readKeyValueFile(filePath) {
  return parseKeyValueText(fs.readFileSync(filePath, "utf8"));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function startupNoticeFields({ handoff = {}, noticePath, logger = log }) {
  const normalized = {
    handle: handoff.handle ?? "",
    role: handoff.role ?? "",
    seat: handoff.seat !== undefined && handoff.seat !== null ? String(handoff.seat) : "",
    total: handoff.total !== undefined && handoff.total !== null ? String(handoff.total) : "",
    skillFiles: Array.isArray(handoff.skillFiles)
      ? handoff.skillFiles.join(",")
      : (handoff.skillFiles ?? ""),
    session_id: handoff.sessionId ?? handoff.session_id ?? "",
    at: handoff.at ?? "",
    departed: handoff.departed ?? "",
  };

  if (!noticePath || !fs.existsSync(noticePath)) {
    logger(`startup notice unavailable; using handoff fields noticePath=${noticePath || ""}`);
    return normalized;
  }

  try {
    return {
      ...normalized,
      ...readKeyValueFile(noticePath),
    };
  } catch (error) {
    logger(
      `startup notice read failed; using handoff fields noticePath=${noticePath} error=${error?.message || error}`,
    );
    return normalized;
  }
}

export function startupId() {
  return `startup-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

export function chooseStartupMode({ existingRecord }) {
  if (existingRecord?.streamPid && pidIsAlive(existingRecord.streamPid)) {
    return "duplicate";
  }
  return "fresh";
}

export function inferStartupMode({ sharedRoot, stateDir }) {
  return path.resolve(stateDir) === path.resolve(sharedRoot) ? "primary" : "secondary";
}

export function buildWindowsLauncherArgs(id) {
  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "./scripts/hive-start-windows.ps1",
  ];
  if (id) args.push("-StartupId", id);
  return args;
}

export function renderStartupSuccessMessage({ mode, stateDir, handle, role, seat, total }) {
  const where = mode === "secondary" ? "Secondary bot live" : "Bot live";
  return [
    `${where}: ${handle || "(unassigned)"} is seat ${seat || "?"} of ${total || "?"} (${role || "unknown role"}).`,
    `Session root: ${stateDir}`,
    "Leave this window open. Use './scripts/hive.sh stop' or '.\\scripts\\hive.ps1 stop' before closing it.",
  ].join("\n");
}

export function startupResultPath(sharedRoot, id) {
  return path.join(sharedRoot, ".bot-hive-startups", `${id}.json`);
}

export function readStartupResultFile(resultPath) {
  const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  if (result?.state) return result;
  return {
    state: "live",
    ...result,
  };
}

export async function waitForStartupResult({
  sharedRoot,
  startupId,
  timeoutMs = 30000,
  pollMs = 200,
}) {
  const resultPath = startupResultPath(sharedRoot, startupId);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(resultPath)) {
      const result = readStartupResultFile(resultPath);
      if (result.state === "live") return result;
      if (result.state === "failed") {
        throw new Error(result.reason || `Startup ${startupId} failed`);
      }
    }
    await sleep(pollMs);
  }
  throw new Error(`Startup ${startupId} did not reach live within startup timeout`);
}

function readStartupHandoff(handoffPath) {
  const handoff = readStartupResultFile(handoffPath);
  return {
    handoffPath,
    stateDir: handoff.stateDir,
    noticePath: handoff.noticePath,
    handoff,
  };
}

function runWindowsStartup(id) {
  let stdout = "";
  try {
    stdout = execFileSync("powershell", buildWindowsLauncherArgs(id), {
      cwd: sharedRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (error) {
    const details = [error?.stderr, error?.stdout, error?.message]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(details || `Windows startup launcher failed for ${id}`);
  }

  const result = parseKeyValueText(stdout);
  if (!result.handoff_path || !result.notice_path || !result.state_dir) {
    throw new Error(`Windows startup launcher returned incomplete result for ${id}`);
  }

  return {
    ...readStartupHandoff(result.handoff_path),
    streamPid: result.stream_pid || null,
    launchPath: result.launch_path || "",
  };
}

function spawnPosixStream(id) {
  const args = ["./scripts/stream.sh"];
  if (id) args.push("--startup-id", id);
  const child = spawn("bash", args, {
    cwd: sharedRoot,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return child;
}

async function main() {
  const clientSessionId = deriveClientSessionId({ cwd: sharedRoot });
  log(`invoked cwd=${cwd} sharedRoot=${sharedRoot} clientSessionId=${clientSessionId}`);

  const existingRecord = readSessionRecord(sharedRoot, clientSessionId);
  if (chooseStartupMode({ existingRecord }) === "duplicate") {
    log(
      `duplicate start refused: existing streamPid=${existingRecord.streamPid} stateDir=${existingRecord.stateDir}`,
    );
    throw new Error(
      `This terminal already owns a live bot session (stream PID ${existingRecord.streamPid}). Use a fresh terminal to add another bot, or stop this one first.`,
    );
  }
  if (existingRecord) {
    log(`clearing stale session record for clientSessionId=${clientSessionId}`);
    clearSessionRecord(sharedRoot, clientSessionId);
  }

  const id = startupId();
  log(`startup handoff requested startupId=${id}`);

  const startup =
    process.platform === "win32"
      ? runWindowsStartup(id)
      : await (async () => {
          const child = spawnPosixStream(id);
          log(`spawned stream pid=${child.pid || ""} startupId=${id}`);
          const launched = await waitForStartupResult({
            sharedRoot,
            startupId: id,
          });
          return {
            ...launched,
            handoff: launched,
            handoffPath: startupResultPath(sharedRoot, id),
            streamPid: child.pid || null,
          };
        })();
  const notice = startupNoticeFields({
    handoff: startup.handoff || {},
    noticePath: startup.noticePath,
  });
  const mode = inferStartupMode({ sharedRoot, stateDir: startup.stateDir });

  const record = {
    clientSessionId,
    stateDir: startup.stateDir,
    noticePath: startup.noticePath,
    startupId: id,
    mode,
    streamPid: startup.streamPid,
    handle: notice.handle || startup.handoff?.handle || "",
    sessionId: notice.session_id || startup.handoff?.sessionId || "",
    createdAt: new Date().toISOString(),
    sourceCwd: cwd,
  };
  writeSessionRecord(sharedRoot, clientSessionId, record);
  log(
    `registered session stateDir=${record.stateDir} handle=${record.handle} noticePath=${record.noticePath}`,
  );

  const lines = [
    `client_session_id=${clientSessionId}`,
    `startup_mode=${mode}`,
    `session_root=${record.stateDir}`,
    `notice_path=${record.noticePath}`,
  ];
  if (id) lines.push(`startup_id=${id}`);
  for (const key of [
    "handle",
    "role",
    "seat",
    "total",
    "skillFiles",
    "session_id",
    "at",
    "departed",
  ]) {
    if (notice[key] !== undefined) lines.push(`${key}=${notice[key]}`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
  process.stderr.write(`${renderStartupSuccessMessage({
    mode,
    stateDir: record.stateDir,
    handle: record.handle,
    role: notice.role,
    seat: notice.seat,
    total: notice.total,
  })}\n`);
}

main().catch((error) => {
  log(`FATAL: ${error?.message || error}`);
  process.stderr.write(`${error?.message || error}\n`);
  process.exit(1);
});
