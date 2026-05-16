import { describe, expect, it } from "vitest";
import { roleForSeat } from "./roles";

describe("roleForSeat", () => {
  it("1-bot colony consolidates all three roles into seat 1", () => {
    expect(roleForSeat(1, 1)).toEqual({
      role: "PM + coder + tester",
      skillFiles: ["hive/skills/pm.md", "hive/skills/coder.md", "hive/skills/tester.md"],
    });
  });

  it("2-bot colony: both bots code, no dedicated tester (HV-123)", () => {
    const seat1 = roleForSeat(2, 1);
    const seat2 = roleForSeat(2, 2);
    expect(seat1).toEqual({
      role: "PM + coder",
      skillFiles: ["hive/skills/pm.md", "hive/skills/coder.md"],
    });
    expect(seat2).toEqual({
      role: "coder",
      skillFiles: ["hive/skills/coder.md"],
    });
    // Neither seat includes tester — deadlock cannot occur (HV-123).
    expect(seat1.skillFiles).not.toContain("hive/skills/tester.md");
    expect(seat2.skillFiles).not.toContain("hive/skills/tester.md");
  });

  it("3-bot colony: PM / tester / coder", () => {
    expect(roleForSeat(3, 1).role).toBe("PM");
    expect(roleForSeat(3, 2).role).toBe("tester");
    expect(roleForSeat(3, 3).role).toBe("coder");
  });

  it("4+ bot colony: extras become 'coder (additional)'", () => {
    expect(roleForSeat(4, 4).role).toBe("coder (additional)");
    expect(roleForSeat(7, 5).role).toBe("coder (additional)");
    expect(roleForSeat(7, 7).role).toBe("coder (additional)");
  });

  it("rejects invalid seat/total combinations", () => {
    expect(() => roleForSeat(0, 1)).toThrow();
    expect(() => roleForSeat(1, 0)).toThrow();
    expect(() => roleForSeat(2, 3)).toThrow();
    expect(() => roleForSeat(-1, 1)).toThrow();
  });
});
