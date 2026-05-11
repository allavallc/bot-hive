import { describe, expect, it } from "vitest";
import {
  type GroupingFeature,
  type GroupingTicket,
  STANDALONE_KEY,
  firstUnfinishedBlocker,
  groupByFs,
  parseBlockedBy,
  priorityRank,
} from "./board-grouping";

function ticket(hvId: string, fm: Partial<Record<string, string>> = {}): GroupingTicket {
  return {
    hvId,
    frontmatter: fm as Record<string, string>,
  };
}

describe("priorityRank (HV-113)", () => {
  it("ranks Critical < High < Medium < Low", () => {
    expect(priorityRank("Critical")).toBeLessThan(priorityRank("High"));
    expect(priorityRank("High")).toBeLessThan(priorityRank("Medium"));
    expect(priorityRank("Medium")).toBeLessThan(priorityRank("Low"));
  });

  it("treats unknown / undefined as last", () => {
    expect(priorityRank(undefined)).toBeGreaterThan(priorityRank("Low"));
    expect(priorityRank("Nope")).toBeGreaterThan(priorityRank("Low"));
  });
});

describe("parseBlockedBy (HV-113)", () => {
  it("extracts comma-separated HV-ids", () => {
    expect(parseBlockedBy("HV-001, HV-042")).toEqual(["HV-001", "HV-042"]);
  });

  it("returns empty for blank / undefined", () => {
    expect(parseBlockedBy(undefined)).toEqual([]);
    expect(parseBlockedBy("")).toEqual([]);
  });

  it("ignores non-HV tokens", () => {
    expect(parseBlockedBy("see also XX-9, HV-7")).toEqual(["HV-7"]);
  });
});

describe("firstUnfinishedBlocker (HV-113)", () => {
  const done = new Set(["HV-001"]);

  it("returns the first blocker not in the done set", () => {
    const t = ticket("HV-010", { "Blocked by": "HV-001, HV-002" });
    expect(firstUnfinishedBlocker(t, done)).toBe("HV-002");
  });

  it("returns null when every blocker is done", () => {
    const t = ticket("HV-010", { "Blocked by": "HV-001" });
    expect(firstUnfinishedBlocker(t, done)).toBeNull();
  });

  it("returns null when there are no blockers", () => {
    expect(firstUnfinishedBlocker(ticket("HV-010"), done)).toBeNull();
  });
});

describe("groupByFs (HV-113)", () => {
  const features: GroupingFeature[] = [
    { fsId: "feature-set-022-swarm-health-core", title: "Swarm health core" },
    { fsId: "feature-set-027-board-ux-swarm-visible-state", title: "Board UX" },
  ];

  it("groups by Feature set and pushes standalone tickets last", () => {
    const items = [
      ticket("HV-100", { "Feature set": "feature-set-027-board-ux-swarm-visible-state" }),
      ticket("HV-050", {}),
      ticket("HV-200", { "Feature set": "feature-set-022-swarm-health-core" }),
    ];
    const groups = groupByFs(items, features);
    expect(groups.map((g) => g.fsKey)).toEqual([
      "feature-set-022-swarm-health-core",
      "feature-set-027-board-ux-swarm-visible-state",
      STANDALONE_KEY,
    ]);
    expect(groups.find((g) => g.fsKey === STANDALONE_KEY)?.code).toBe("Standalone");
  });

  it("sorts within a group by Priority then HV-id ascending", () => {
    const items = [
      ticket("HV-050", {
        "Feature set": "feature-set-022-swarm-health-core",
        Priority: "Low",
      }),
      ticket("HV-040", {
        "Feature set": "feature-set-022-swarm-health-core",
        Priority: "High",
      }),
      ticket("HV-030", {
        "Feature set": "feature-set-022-swarm-health-core",
        Priority: "High",
      }),
    ];
    const groups = groupByFs(items, features);
    expect(groups[0]?.tickets.map((t) => t.hvId)).toEqual(["HV-030", "HV-040", "HV-050"]);
  });

  it("attaches the feature title to the group", () => {
    const items = [ticket("HV-200", { "Feature set": "feature-set-022-swarm-health-core" })];
    const groups = groupByFs(items, features);
    expect(groups[0]?.title).toBe("Swarm health core");
    expect(groups[0]?.code).toBe("fs-022-swarm-health-core");
  });
});
