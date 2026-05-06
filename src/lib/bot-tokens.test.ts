import { describe, expect, test } from "vitest";
import { generateRawToken, hashToken } from "./bot-tokens";

describe("bot-tokens — pure functions", () => {
  test("generateRawToken returns a bh_-prefixed token", () => {
    const t = generateRawToken();
    expect(t).toMatch(/^bh_[A-Za-z0-9_-]+$/);
  });

  test("generateRawToken returns ~43 base64url chars after the prefix (32 bytes)", () => {
    const t = generateRawToken();
    const body = t.slice(3);
    // 32 bytes → ceil(32 * 4 / 3) = 43 base64 chars; base64url drops padding.
    expect(body.length).toBeGreaterThanOrEqual(42);
    expect(body.length).toBeLessThanOrEqual(44);
  });

  test("generateRawToken produces unique tokens", () => {
    const a = generateRawToken();
    const b = generateRawToken();
    expect(a).not.toBe(b);
  });

  test("hashToken is deterministic", () => {
    expect(hashToken("bh_abc")).toBe(hashToken("bh_abc"));
  });

  test("hashToken differs across inputs", () => {
    expect(hashToken("bh_abc")).not.toBe(hashToken("bh_def"));
  });

  test("hashToken returns 64-char hex (sha256)", () => {
    const h = hashToken("bh_anything");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
