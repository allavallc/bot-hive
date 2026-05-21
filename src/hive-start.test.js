import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots = [];

async function loadModule() {
  return import("../scripts/hive-start.mjs");
}

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hive-start-test-"));
  tempRoots.push(dir);
  return dir;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    fs.rmSync(tempRoots.pop(), { force: true, recursive: true });
  }
});

describe("hive-start helper", () => {
  it("classifies duplicate startup when the same session already owns a live stream", async () => {
    const mod = await loadModule();
    expect(mod.chooseStartupMode({ existingRecord: { streamPid: process.pid } })).toBe("duplicate");
  });

  it("treats a non-duplicate startup as fresh and leaves primary-vs-secondary to the stream handoff", async () => {
    const mod = await loadModule();
    expect(mod.chooseStartupMode({ existingRecord: null })).toBe("fresh");
  });

  it("infers primary vs secondary from the observed stateDir, not the wrapper pid probe", async () => {
    const mod = await loadModule();
    expect(mod.inferStartupMode({ sharedRoot: "/repo", stateDir: "/repo" })).toBe("primary");
    expect(mod.inferStartupMode({ sharedRoot: "/repo", stateDir: "/repo/worktrees/scout" })).toBe(
      "secondary",
    );
  });

  it("builds a human-readable startup success message", async () => {
    const mod = await loadModule();
    expect(
      mod.renderStartupSuccessMessage({
        mode: "primary",
        stateDir: "/repo",
        handle: "buzz",
        role: "PM + coder + tester",
        seat: "1",
        total: "1",
      }),
    ).toContain("Bot live: buzz is seat 1 of 1 (PM + coder + tester).");
  });

  it("parses wrapper notice key/value output", async () => {
    const mod = await loadModule();
    const dir = makeTempDir();
    const noticePath = path.join(dir, "notice");
    fs.writeFileSync(noticePath, "handle=buzz\nrole=PM + coder + tester\nseat=1\n", "utf8");
    expect(mod.readKeyValueFile(noticePath)).toEqual({
      handle: "buzz",
      role: "PM + coder + tester",
      seat: "1",
    });
  });

  it("uses startup handoff fields when the notice file is already gone", async () => {
    const mod = await loadModule();
    const logs = [];
    expect(
      mod.startupNoticeFields({
        handoff: {
          handle: "buzz",
          role: "PM",
          seat: 1,
          total: 7,
          skillFiles: ["hive/skills/pm.md"],
          sessionId: "session-1",
          at: "2026-05-21T20:19:28Z",
        },
        noticePath: path.join(makeTempDir(), ".bot-hive-role-notice"),
        logger: (message) => logs.push(message),
      }),
    ).toEqual({
      handle: "buzz",
      role: "PM",
      seat: "1",
      total: "7",
      skillFiles: "hive/skills/pm.md",
      session_id: "session-1",
      at: "2026-05-21T20:19:28Z",
      departed: "",
    });
    expect(logs[0]).toContain("startup notice unavailable; using handoff fields");
  });

  it("prefers live notice-file values when they are available", async () => {
    const mod = await loadModule();
    const dir = makeTempDir();
    const noticePath = path.join(dir, ".bot-hive-role-notice");
    fs.writeFileSync(
      noticePath,
      "handle=scout\nrole=coder (additional)\nseat=7\ntotal=7\nskillFiles=hive/skills/coder.md\nsession_id=session-7\nat=2026-05-21T20:27:44Z\ndeparted=\n",
      "utf8",
    );

    expect(
      mod.startupNoticeFields({
        handoff: {
          handle: "buzz",
          role: "PM",
          seat: 1,
          total: 6,
          skillFiles: ["hive/skills/pm.md"],
          sessionId: "session-1",
          at: "2026-05-21T20:19:28Z",
        },
        noticePath,
        logger: () => {},
      }),
    ).toMatchObject({
      handle: "scout",
      role: "coder (additional)",
      seat: "7",
      total: "7",
      skillFiles: "hive/skills/coder.md",
      session_id: "session-7",
      at: "2026-05-21T20:27:44Z",
      departed: "",
    });
  });

  it("parses key/value text from the Windows launcher stdout", async () => {
    const mod = await loadModule();
    expect(
      mod.parseKeyValueText(
        "stream_pid=123\nstate_dir=C:/repo\nnotice_path=C:/repo/.bot-hive-role-notice\n",
      ),
    ).toEqual({
      stream_pid: "123",
      state_dir: "C:/repo",
      notice_path: "C:/repo/.bot-hive-role-notice",
    });
  });

  it("builds the Windows launcher command with a startup id", async () => {
    const mod = await loadModule();
    expect(mod.buildWindowsLauncherArgs("startup-123")).toEqual([
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "./scripts/hive-start-windows.ps1",
      "-StartupId",
      "startup-123",
    ]);
  });

  it("treats a legacy handoff payload without state as live", async () => {
    const mod = await loadModule();
    const sharedRoot = makeTempDir();
    const resultPath = mod.startupResultPath(sharedRoot, "startup-legacy");
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    fs.writeFileSync(
      resultPath,
      `${JSON.stringify({ stateDir: "/repo", noticePath: "/repo/.bot-hive-role-notice" })}\n`,
      "utf8",
    );

    expect(mod.readStartupResultFile(resultPath)).toMatchObject({
      state: "live",
      stateDir: "/repo",
      noticePath: "/repo/.bot-hive-role-notice",
    });
  });

  it("waits for a single startup result to become live", async () => {
    const mod = await loadModule();
    const sharedRoot = makeTempDir();
    const resultPath = mod.startupResultPath(sharedRoot, "startup-123");
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    fs.writeFileSync(resultPath, `${JSON.stringify({ state: "pending" })}\n`, "utf8");

    const pending = mod.waitForStartupResult({
      sharedRoot,
      startupId: "startup-123",
      timeoutMs: 250,
      pollMs: 5,
    });

    setTimeout(() => {
      fs.writeFileSync(
        resultPath,
        `${JSON.stringify({
          state: "live",
          mode: "secondary",
          stateDir: path.join(sharedRoot, "worktrees", "scout"),
          handle: "scout",
          role: "coder",
          seat: "2",
          total: "2",
          sessionId: "session-2",
          streamPid: 4242,
        })}\n`,
        "utf8",
      );
    }, 20);

    await expect(pending).resolves.toMatchObject({
      state: "live",
      mode: "secondary",
      handle: "scout",
      streamPid: 4242,
    });
  });

  it("fails startup when the single startup result reaches failed", async () => {
    const mod = await loadModule();
    const sharedRoot = makeTempDir();
    const resultPath = mod.startupResultPath(sharedRoot, "startup-456");
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    fs.writeFileSync(
      resultPath,
      `${JSON.stringify({ state: "failed", reason: "api-base-unreachable" })}\n`,
      "utf8",
    );

    await expect(
      mod.waitForStartupResult({
        sharedRoot,
        startupId: "startup-456",
        timeoutMs: 50,
        pollMs: 5,
      }),
    ).rejects.toThrow("api-base-unreachable");
  });

  it("treats timeout as failure when the startup result never reaches live", async () => {
    const mod = await loadModule();
    const sharedRoot = makeTempDir();
    const resultPath = mod.startupResultPath(sharedRoot, "startup-789");
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    fs.writeFileSync(resultPath, `${JSON.stringify({ state: "pending" })}\n`, "utf8");

    await expect(
      mod.waitForStartupResult({
        sharedRoot,
        startupId: "startup-789",
        timeoutMs: 30,
        pollMs: 5,
      }),
    ).rejects.toThrow("startup-789");
  });
});
