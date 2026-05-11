import { describe, expect, it } from "vitest";
import {
  KEEP_AFTER_TRIM,
  MAX_LINES_BEFORE_TRIM,
  MAX_MESSAGE_CHARS,
  actorSlug,
  appendAndTrim,
  validateMessage,
} from "./notes";

describe("actorSlug", () => {
  it("lowercases and keeps alphanumerics + dashes", () => {
    expect(actorSlug("Allavallc")).toBe("allavallc");
    expect(actorSlug("allavallc-cc1")).toBe("allavallc-cc1");
  });

  it("collapses any other character run to a single dash", () => {
    expect(actorSlug("First Last")).toBe("first-last");
    expect(actorSlug("user@example.com")).toBe("user-example-com");
    expect(actorSlug("a___b...c")).toBe("a-b-c");
  });

  it("strips leading and trailing dashes", () => {
    expect(actorSlug("---weird---")).toBe("weird");
    expect(actorSlug(".:.")).toBe("anon");
  });

  it("falls back to 'anon' for empty / unicode-only input", () => {
    expect(actorSlug("")).toBe("anon");
    expect(actorSlug("   ")).toBe("anon");
    expect(actorSlug("👋")).toBe("anon");
  });

  it("caps length at 64 chars", () => {
    const long = "a".repeat(100);
    expect(actorSlug(long)).toHaveLength(64);
  });
});

describe("appendAndTrim", () => {
  it("appends to an empty file with a trailing newline", () => {
    expect(appendAndTrim("", "first")).toBe("first\n");
  });

  it("appends to an existing file preserving prior lines", () => {
    expect(appendAndTrim("a\nb\n", "c")).toBe("a\nb\nc\n");
  });

  it("normalizes existing trailing whitespace before appending", () => {
    expect(appendAndTrim("a\n\n\n", "b")).toBe("a\nb\n");
  });

  it("does not trim while under the rotation threshold", () => {
    const existing = Array.from({ length: MAX_LINES_BEFORE_TRIM - 1 }, (_, i) => `L${i}`).join(
      "\n",
    );
    const result = appendAndTrim(existing, "newest");
    const lines = result.trimEnd().split("\n");
    expect(lines).toHaveLength(MAX_LINES_BEFORE_TRIM);
    expect(lines[lines.length - 1]).toBe("newest");
    expect(lines[0]).toBe("L0");
  });

  it("drops oldest lines when crossing the rotation threshold", () => {
    const existing = Array.from({ length: MAX_LINES_BEFORE_TRIM }, (_, i) => `L${i}`).join("\n");
    const result = appendAndTrim(existing, "newest");
    const lines = result.trimEnd().split("\n");
    expect(lines).toHaveLength(KEEP_AFTER_TRIM);
    expect(lines[lines.length - 1]).toBe("newest");
    // Oldest L0 dropped; first kept line is somewhere in the middle.
    expect(lines[0]).not.toBe("L0");
    expect(lines[0]).toBe(`L${MAX_LINES_BEFORE_TRIM - KEEP_AFTER_TRIM + 1}`);
  });
});

describe("validateMessage", () => {
  it("accepts a normal message", () => {
    const result = validateMessage("@cc2 try the WSL path next");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message).toBe("@cc2 try the WSL path next");
  });

  it("rejects non-string input", () => {
    expect(validateMessage(undefined).ok).toBe(false);
    expect(validateMessage(null).ok).toBe(false);
    expect(validateMessage(42).ok).toBe(false);
    expect(validateMessage({ foo: "bar" }).ok).toBe(false);
  });

  it("rejects empty / whitespace-only input", () => {
    expect(validateMessage("").ok).toBe(false);
    expect(validateMessage("   ").ok).toBe(false);
    expect(validateMessage("\t\n").ok).toBe(false);
  });

  it("strips tabs and newlines so the TSV format isn't corrupted", () => {
    const result = validateMessage("a\tb\nc");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message).toBe("a b c");
  });

  it("rejects messages over MAX_MESSAGE_CHARS", () => {
    const longMsg = "x".repeat(MAX_MESSAGE_CHARS + 1);
    const result = validateMessage(longMsg);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(`${MAX_MESSAGE_CHARS}`);
  });

  it("accepts exactly MAX_MESSAGE_CHARS", () => {
    const exact = "x".repeat(MAX_MESSAGE_CHARS);
    const result = validateMessage(exact);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message).toHaveLength(MAX_MESSAGE_CHARS);
  });
});
