import { describe, expect, it } from "vitest";
import { staggerSeconds } from "./board-stagger";

describe("staggerSeconds (HV-113 hydration fix)", () => {
  it("is deterministic — same seed yields identical output", () => {
    expect(staggerSeconds("HV-042", 12)).toBe(staggerSeconds("HV-042", 12));
    expect(staggerSeconds("allavallc.buzz", 14)).toBe(staggerSeconds("allavallc.buzz", 14));
  });

  it("returns 0 for an empty / missing seed (no hydration drift)", () => {
    expect(staggerSeconds(undefined, 12)).toBe(0);
    expect(staggerSeconds("", 12)).toBe(0);
  });

  it("stays inside the (-maxSeconds, 0] window", () => {
    for (const seed of ["a", "HV-001", "HV-200", "allavallc.buzz", "wren-2"]) {
      const result = staggerSeconds(seed, 12);
      expect(result).toBeGreaterThan(-12);
      expect(result).toBeLessThanOrEqual(0);
    }
  });

  it("produces different outputs for different seeds (mostly)", () => {
    const samples = new Set([
      staggerSeconds("HV-001", 12),
      staggerSeconds("HV-002", 12),
      staggerSeconds("HV-003", 12),
      staggerSeconds("HV-100", 12),
      staggerSeconds("HV-113", 12),
      staggerSeconds("HV-200", 12),
    ]);
    expect(samples.size).toBeGreaterThan(3);
  });
});
