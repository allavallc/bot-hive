import { describe, expect, it } from "vitest";
import {
  type EventLog,
  type FeatureSet,
  type RepoState,
  type Ticket,
  checkAssignedToQualified,
  checkEventLogFilenameFormat,
  checkEventVsFileLocation,
  checkFsColonyDormancy,
  checkFsOwnerIsLogin,
  checkInProgressFreshness,
  evaluate,
  parseEventLine,
} from "./swarm-health";

// FS-022 invariant evaluator tests. Each invariant gets at least one
// fixture that triggers it and one that doesn't.

const NOW = new Date("2026-05-10T12:00:00Z");

function ticket(hvId: string, state: string, frontmatter: Record<string, string> = {}): Ticket {
  return { hvId, filename: `${hvId}-1.md`, state, frontmatter };
}

function fs(fsId: string, status: string, owner: string): FeatureSet {
  return { fsId, status, owner };
}

function eventLog(basename: string, lines: string[]): EventLog {
  const entries = lines
    .map((l) => parseEventLine(l))
    .filter((e): e is NonNullable<typeof e> => e !== null);
  return { basename, entries };
}

function makeState(partial: Partial<RepoState>): RepoState {
  return {
    tickets: [],
    featureSets: [],
    eventLogs: [],
    now: NOW,
    ...partial,
  };
}

describe("parseEventLine", () => {
  it("parses a ticket-bound event line", () => {
    const e = parseEventLine("2026-05-09T19:18:40Z HV-101 claim allavallc.buzz");
    expect(e).toEqual({
      timestamp: "2026-05-09T19:18:40Z",
      hvId: "HV-101",
      action: "claim",
      actor: "allavallc.buzz",
    });
  });

  it("parses a non-ticket-bound presence line", () => {
    const e = parseEventLine("2026-05-09T19:00:00Z presence allavallc.buzz online");
    expect(e?.hvId).toBeNull();
    expect(e?.action).toBe("presence");
  });

  it("handles HV ranges (HV-X,HV-Y)", () => {
    const e = parseEventLine("2026-05-07T15:55:00Z HV-075,HV-077 reclaim-from-wren allavallc-cc1");
    expect(e?.hvId).toBe("HV-075,HV-077");
  });

  it("returns null for blank or comment lines", () => {
    expect(parseEventLine("")).toBeNull();
    expect(parseEventLine("# header")).toBeNull();
    expect(parseEventLine("not a real line")).toBeNull();
  });
});

describe("checkAssignedToQualified", () => {
  it("flags a bare-handle Assigned to on an in-progress ticket", () => {
    const state = makeState({
      tickets: [ticket("HV-1", "in-progress", { "Assigned to": "buzz" })],
    });
    const out = checkAssignedToQualified(state);
    expect(out).toHaveLength(1);
    expect(out[0].code).toBe("ASSIGNED_TO_UNQUALIFIED");
  });

  it("accepts a qualified <colony>.<handle>", () => {
    const state = makeState({
      tickets: [ticket("HV-1", "in-progress", { "Assigned to": "allavallc.buzz" })],
    });
    expect(checkAssignedToQualified(state)).toHaveLength(0);
  });

  it("ignores parenthetical model notes after the actor", () => {
    const state = makeState({
      tickets: [
        ticket("HV-1", "in-progress", { "Assigned to": "allavallc.buzz (claude-opus-4-7)" }),
      ],
    });
    expect(checkAssignedToQualified(state)).toHaveLength(0);
  });

  it("doesn't check backlog tickets (Assigned to is meaningless there)", () => {
    const state = makeState({
      tickets: [ticket("HV-1", "backlog", { "Assigned to": "buzz" })],
    });
    expect(checkAssignedToQualified(state)).toHaveLength(0);
  });
});

describe("checkEventLogFilenameFormat", () => {
  it("flags a bare-handle event log file as info-level", () => {
    const state = makeState({ eventLogs: [eventLog("buzz", [])] });
    const out = checkEventLogFilenameFormat(state);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("info");
  });

  it("accepts a qualified event log filename", () => {
    const state = makeState({ eventLogs: [eventLog("allavallc.buzz", [])] });
    expect(checkEventLogFilenameFormat(state)).toHaveLength(0);
  });
});

describe("checkFsOwnerIsLogin", () => {
  it("flags an Owner that doesn't look like a GitHub login", () => {
    const state = makeState({ featureSets: [fs("FS-001", "active", "not!a!login!")] });
    const out = checkFsOwnerIsLogin(state);
    expect(out.some((a) => a.code === "FS_OWNER_INVALID_FORMAT")).toBe(true);
  });

  it("flags a legacy bot-handle Owner like allavallc-cc1 (warning)", () => {
    const state = makeState({ featureSets: [fs("FS-007", "active", "allavallc-cc1")] });
    const out = checkFsOwnerIsLogin(state);
    expect(out.some((a) => a.code === "FS_OWNER_LEGACY_BOT_HANDLE")).toBe(true);
  });

  it("accepts a clean GitHub login like allavallc", () => {
    const state = makeState({ featureSets: [fs("FS-007", "active", "allavallc")] });
    expect(checkFsOwnerIsLogin(state)).toHaveLength(0);
  });

  it("ignores empty Owner (free-for-all FS)", () => {
    const state = makeState({ featureSets: [fs("FS-007", "active", "")] });
    expect(checkFsOwnerIsLogin(state)).toHaveLength(0);
  });
});

describe("checkInProgressFreshness", () => {
  it("flags an in-progress ticket older than 2h", () => {
    const longAgo = new Date(NOW.getTime() - 5 * 60 * 60 * 1000).toISOString();
    const state = makeState({
      tickets: [ticket("HV-1", "in-progress", { "Last touched": longAgo })],
    });
    const out = checkInProgressFreshness(state);
    expect(out).toHaveLength(1);
    expect(out[0].code).toBe("IN_PROGRESS_STALE");
  });

  it("does not flag an in-progress ticket younger than 2h", () => {
    const recent = new Date(NOW.getTime() - 30 * 60 * 1000).toISOString();
    const state = makeState({
      tickets: [ticket("HV-1", "in-progress", { "Last touched": recent })],
    });
    expect(checkInProgressFreshness(state)).toHaveLength(0);
  });

  it("flags a missing Last touched", () => {
    const state = makeState({ tickets: [ticket("HV-1", "in-progress", {})] });
    const out = checkInProgressFreshness(state);
    expect(out[0].code).toBe("IN_PROGRESS_NO_LAST_TOUCHED");
  });
});

describe("checkFsColonyDormancy", () => {
  it("flags an owned FS with no recent colony activity (>48h)", () => {
    const longAgo = new Date(NOW.getTime() - 72 * 60 * 60 * 1000).toISOString();
    const state = makeState({
      featureSets: [fs("FS-1", "active", "allavallc")],
      eventLogs: [eventLog("allavallc.buzz", [`${longAgo} HV-1 claim allavallc.buzz`])],
    });
    const out = checkFsColonyDormancy(state);
    expect(out.some((a) => a.code === "FS_COLONY_DORMANT")).toBe(true);
  });

  it("does not flag an FS with recent colony activity", () => {
    const recent = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();
    const state = makeState({
      featureSets: [fs("FS-1", "active", "allavallc")],
      eventLogs: [eventLog("allavallc.buzz", [`${recent} HV-1 claim allavallc.buzz`])],
    });
    expect(checkFsColonyDormancy(state)).toHaveLength(0);
  });

  it("flags an FS owned by a colony with zero events ever", () => {
    const state = makeState({ featureSets: [fs("FS-1", "active", "tony")] });
    const out = checkFsColonyDormancy(state);
    expect(out.some((a) => a.code === "FS_COLONY_NEVER_ACTIVE")).toBe(true);
  });
});

describe("checkEventVsFileLocation (the buzz dropped-in-review-move bug class)", () => {
  it("flags an in-review event whose ticket file is still in in-progress", () => {
    // This is the exact pattern that broke on 2026-05-09: buzz emitted
    // an in-review event but its cherry-pick dropped the file move.
    const state = makeState({
      tickets: [ticket("HV-075", "in-progress", {})],
      eventLogs: [
        eventLog("allavallc.buzz", ["2026-05-10T02:00:00Z HV-075 in-review allavallc.buzz"]),
      ],
    });
    const out = checkEventVsFileLocation(state);
    const offender = out.find((a) => a.code === "IN_REVIEW_EVENT_FILE_NOT_MOVED");
    expect(offender).toBeDefined();
    expect(offender?.severity).toBe("critical");
  });

  it("does not flag when in-review event matches a ticket file actually in in-review", () => {
    const state = makeState({
      tickets: [ticket("HV-075", "in-review", {})],
      eventLogs: [
        eventLog("allavallc.buzz", ["2026-05-10T02:00:00Z HV-075 in-review allavallc.buzz"]),
      ],
    });
    expect(
      checkEventVsFileLocation(state).filter((a) => a.code === "IN_REVIEW_EVENT_FILE_NOT_MOVED"),
    ).toHaveLength(0);
  });

  it("flags a claim event with no corresponding ticket file (data corruption)", () => {
    const state = makeState({
      tickets: [],
      eventLogs: [eventLog("allavallc.buzz", ["2026-05-10T02:00:00Z HV-999 claim allavallc.buzz"])],
    });
    const out = checkEventVsFileLocation(state);
    expect(out.some((a) => a.code === "CLAIM_EVENT_TICKET_MISSING")).toBe(true);
  });

  it("does not flag a claim event whose ticket is in done (lifecycle continued past claim)", () => {
    const state = makeState({
      tickets: [ticket("HV-1", "done", {})],
      eventLogs: [eventLog("allavallc.buzz", ["2026-05-10T02:00:00Z HV-1 claim allavallc.buzz"])],
    });
    expect(checkEventVsFileLocation(state)).toHaveLength(0);
  });
});

describe("evaluate (top-level)", () => {
  it("returns the union of all invariants for a clean state", () => {
    const state = makeState({});
    expect(evaluate(state)).toHaveLength(0);
  });

  it("aggregates anomalies from multiple invariants", () => {
    const longAgo = new Date(NOW.getTime() - 5 * 60 * 60 * 1000).toISOString();
    const state = makeState({
      tickets: [
        ticket("HV-1", "in-progress", {
          "Assigned to": "buzz", // -> ASSIGNED_TO_UNQUALIFIED
          "Last touched": longAgo, // -> IN_PROGRESS_STALE
        }),
      ],
      featureSets: [fs("FS-001", "active", "allavallc-cc1")], // -> FS_OWNER_LEGACY_BOT_HANDLE
    });
    const codes = evaluate(state).map((a) => a.code);
    expect(codes).toContain("ASSIGNED_TO_UNQUALIFIED");
    expect(codes).toContain("IN_PROGRESS_STALE");
    expect(codes).toContain("FS_OWNER_LEGACY_BOT_HANDLE");
  });
});
