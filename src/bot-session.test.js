import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots = [];

async function loadModule() {
  return import("../scripts/bot-session.mjs");
}

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-session-test-"));
  tempRoots.push(dir);
  return dir;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    fs.rmSync(tempRoots.pop(), { force: true, recursive: true });
  }
});

describe("bot-session helper", () => {
  it("stores and resolves session records from the shared root", async () => {
    const mod = await loadModule();
    const sharedRoot = makeTempDir();
    const stateDir = path.join(sharedRoot, "worktrees", "buzz");
    fs.mkdirSync(stateDir, { recursive: true });

    mod.writeSessionRecord(sharedRoot, "client-1", {
      stateDir,
      streamPid: 1234,
    });

    expect(mod.readSessionRecord(sharedRoot, "client-1")).toMatchObject({
      stateDir,
      streamPid: 1234,
    });
    expect(
      mod.resolveStateDir({
        cwd: sharedRoot,
        clientSessionId: "client-1",
        execImpl: () => `${path.join(sharedRoot, ".git")}\n`,
      }),
    ).toBe(stateDir);
  });

  it("falls back to cwd when no session record exists", async () => {
    const mod = await loadModule();
    const sharedRoot = makeTempDir();
    expect(
      mod.resolveStateDir({
        cwd: sharedRoot,
        clientSessionId: "missing",
        execImpl: () => `${path.join(sharedRoot, ".git")}\n`,
      }),
    ).toBe(sharedRoot);
  });

  it("derives a stable posix session id from terminal env when present", async () => {
    const mod = await loadModule();
    const cwd = makeTempDir();
    const id = mod.deriveClientSessionId({
      cwd,
      platform: "linux",
      env: { TMUX_PANE: "%42" },
      execImpl: () => {
        throw new Error("tty should not be consulted when env anchor exists");
      },
    });
    expect(id).toBe(`termenv:%42:${cwd}`);
  });
});
