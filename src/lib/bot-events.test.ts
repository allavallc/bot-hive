import { describe, expect, it } from "vitest";
import {
  MAX_BOT_EVENT_DATA_CHARS,
  MAX_BOT_EVENT_MESSAGE_CHARS,
  roleMatches,
  validateBotEventInput,
} from "./bot-events";

describe("validateBotEventInput", () => {
  it("accepts a valid bot event and normalizes one-line strings", () => {
    const result = validateBotEventInput({
      repoFullName: "allavallc/bot-hive",
      colony: " allavallc ",
      handle: "wren",
      kind: "question",
      message: "Need\tclarity\non HV-147",
      targetRole: "PM",
      data: { hvId: "HV-147" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.message).toBe("Need clarity on HV-147");
      expect(result.value.targetRole).toBe("PM");
      expect(result.value.data).toEqual({ hvId: "HV-147" });
    }
  });

  it("rejects missing actor identity", () => {
    expect(validateBotEventInput({ handle: "wren", kind: "status", message: "ok" }).ok).toBe(false);
    expect(validateBotEventInput({ colony: "allavallc", kind: "status", message: "ok" }).ok).toBe(
      false,
    );
  });

  it("rejects invalid event kinds", () => {
    const result = validateBotEventInput({
      colony: "allavallc",
      handle: "wren",
      kind: "chatty",
      message: "hello",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("kind must be one of");
  });

  it("rejects empty and oversized messages", () => {
    expect(
      validateBotEventInput({
        colony: "allavallc",
        handle: "wren",
        kind: "status",
        message: " ",
      }).ok,
    ).toBe(false);

    const oversized = validateBotEventInput({
      colony: "allavallc",
      handle: "wren",
      kind: "status",
      message: "x".repeat(MAX_BOT_EVENT_MESSAGE_CHARS + 1),
    });
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) expect(oversized.error).toContain(`${MAX_BOT_EVENT_MESSAGE_CHARS}`);
  });

  it("rejects non-object and oversized data payloads", () => {
    expect(
      validateBotEventInput({
        colony: "allavallc",
        handle: "wren",
        kind: "status",
        message: "ok",
        data: ["bad"],
      }).ok,
    ).toBe(false);

    const oversized = validateBotEventInput({
      colony: "allavallc",
      handle: "wren",
      kind: "status",
      message: "ok",
      data: { text: "x".repeat(MAX_BOT_EVENT_DATA_CHARS + 1) },
    });
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) expect(oversized.error).toContain(`${MAX_BOT_EVENT_DATA_CHARS}`);
  });
});

describe("roleMatches", () => {
  it("matches consolidated roles by component", () => {
    expect(roleMatches("PM + tester", "tester")).toBe(true);
    expect(roleMatches("PM + coder + tester", "coder")).toBe(true);
    expect(roleMatches("coder (additional)", "coder")).toBe(true);
    expect(roleMatches("coder", "PM")).toBe(false);
  });
});
