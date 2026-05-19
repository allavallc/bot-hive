import { spawn } from "node:child_process";
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

export function readKeyValueFile(filePath) {
  const result = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    result[line.slice(0, idx)] = line.slice(idx + 1).trim();
  }
  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function startupId() {
  return `startup-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function rootStreamPidPath() {
  return path.join(sharedRoot, ".bot-hive-stream.pid");
}

function readRootPid() {
  try {
    return fs.readFileSync(rootStreamPidPath(), "utf8").trim();
  } catch {
    return "";
  }
}

export function chooseStartupMode({ existingRecord, rootPidAlive }) {
  if (existingRecord?.streamPid && pidIsAlive(existingRecord.streamPid)) {
    return "duplicate";
  }
  return rootPidAlive ? "secondary" : "primary";
}

function spawnStream(mode, id) {
  const isWin = process.platform === "win32";
  if (isWin) {
    const args = ["-NoProfile", "-WindowStyle", "Hidden", "-File", "./scripts/stream.ps1"];
    if (mode === "secondary") args.push("-StartupId", id);
    const child = spawn("powershell", args, {
      cwd: sharedRoot,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return child;
  }

  const args = ["./scripts/stream.sh"];
  if (mode === "secondary") args.push("--startup-id", id);
  const child = spawn("bash", args, {
    cwd: sharedRoot,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return child;
}

async function waitForPrimaryNotice(timeoutMs = 30000) {
  const noticePath = path.join(sharedRoot, ".bot-hive-role-notice");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(noticePath)) {
      return { stateDir: sharedRoot, noticePath };
    }
    await sleep(200);
  }
  throw new Error("No role notice appeared within startup timeout");
}

async function waitForSecondaryHandoff(id, timeoutMs = 30000) {
  const handoffPath = path.join(sharedRoot, ".bot-hive-startups", `${id}.json`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(handoffPath)) {
      const handoff = JSON.parse(fs.readFileSync(handoffPath, "utf8"));
      return {
        handoffPath,
        stateDir: handoff.stateDir,
        noticePath: handoff.noticePath,
        handoff,
      };
    }
    await sleep(200);
  }
  throw new Error(`No startup handoff appeared for ${id} within startup timeout`);
}

async function main() {
  const clientSessionId = deriveClientSessionId({ cwd: sharedRoot });
  log(`invoked cwd=${cwd} sharedRoot=${sharedRoot} clientSessionId=${clientSessionId}`);

  const existingRecord = readSessionRecord(sharedRoot, clientSessionId);
  if (chooseStartupMode({ existingRecord, rootPidAlive: false }) === "duplicate") {
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

  const rootPid = readRootPid();
  const rootAlive = pidIsAlive(rootPid);
  const mode = chooseStartupMode({ existingRecord: null, rootPidAlive: rootAlive });
  const id = mode === "secondary" ? startupId() : "";
  log(`startup mode=${mode} rootPid=${rootPid || ""} rootAlive=${rootAlive} startupId=${id}`);

  const child = spawnStream(mode, id);
  log(`spawned stream pid=${child.pid || ""} mode=${mode}`);

  const startup =
    mode === "secondary" ? await waitForSecondaryHandoff(id) : await waitForPrimaryNotice();
  const notice = readKeyValueFile(startup.noticePath);

  const record = {
    clientSessionId,
    stateDir: startup.stateDir,
    noticePath: startup.noticePath,
    startupId: id,
    mode,
    streamPid: child.pid || null,
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
}

main().catch((error) => {
  log(`FATAL: ${error?.message || error}`);
  process.stderr.write(`${error?.message || error}\n`);
  process.exit(1);
});
