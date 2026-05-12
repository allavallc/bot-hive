import { describe, expect, it } from "vitest";
import { roleForSeat } from "./roles";

describe("roleForSeat", () => {
  it("1-bot colony consolidates all three roles into seat 1", () => {
    expect(roleForSeat(1, 1)).toEqual({
      role: "PM + coder + tester",
      skillFiles: ["hive/skills/pm.md", "hive/skills/coder.md", "hive/skills/tester.md"],
    });
  });

  it("2-bot colony: seat 1 is PM+tester, seat 2 is coder", () => {
    expect(roleForSeat(2, 1)).toEqual({
      role: "PM + tester",
      skillFiles: ["hive/skills/pm.md", "hive/skills/tester.md"],
    });
    expect(roleForSeat(2, 2)).toEqual({
      role: "coder",
      skillFiles: ["hive/skills/coder.md"],
    });
  });

  it("3-bot colony: PM / coder / tester", () => {
    expect(roleForSeat(3, 1).role).toBe("PM");
    expect(roleForSeat(3, 2).role).toBe("coder");
    expect(roleForSeat(3, 3).role).toBe("tester");
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
