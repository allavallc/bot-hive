import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function loadModule() {
  return import("../scripts/hive-start.mjs");
}

describe("hive-start helper", () => {
  it("classifies duplicate startup when the same session already owns a live stream", async () => {
    const mod = await loadModule();
    expect(
      mod.chooseStartupMode({ existingRecord: { streamPid: process.pid }, rootPidAlive: true }),
    ).toBe("duplicate");
  });

  it("classifies a second terminal as secondary when the root stream is alive", async () => {
    const mod = await loadModule();
    expect(mod.chooseStartupMode({ existingRecord: null, rootPidAlive: true })).toBe("secondary");
  });

  it("classifies an empty repo root as primary", async () => {
    const mod = await loadModule();
    expect(mod.chooseStartupMode({ existingRecord: null, rootPidAlive: false })).toBe("primary");
  });

  it("parses wrapper notice key/value output", async () => {
    const mod = await loadModule();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hive-start-test-"));
    const noticePath = path.join(dir, "notice");
    fs.writeFileSync(noticePath, "handle=buzz\nrole=PM + coder + tester\nseat=1\n", "utf8");
    expect(mod.readKeyValueFile(noticePath)).toEqual({
      handle: "buzz",
      role: "PM + coder + tester",
      seat: "1",
    });
    fs.rmSync(dir, { force: true, recursive: true });
  });
});
