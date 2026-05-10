// FS-022: swarm health invariant evaluator.
//
// Pure function, no IO. Takes a snapshot of the repo's hive/ state and
// returns the list of anomalies detected. The cron job (FS-022 live
// system PR) is responsible for fetching the snapshot via the GitHub
// App and persisting the returned anomalies.
//
// Each invariant is a function that returns AnomalyDetection[]. Adding
// a new invariant means writing one function and one test fixture.
// Severity scheme: 'critical' (data corruption, manual intervention
// likely needed) | 'warning' (drift / stale state, fix soon) | 'info'
// (transient or expected, eyeballs only).
//
// dedupKey is a stable string per (code, key parts of details) so the
// cron's upsert collapses recurring violations into one row instead of
// creating a fresh row every 5 minutes.

export type Ticket = {
  hvId: string;
  filename: string;
  // The "in-progress", "in-review", etc. column the file is sitting in.
  state: string;
  frontmatter: Record<string, string>;
};

export type FeatureSet = {
  fsId: string;
  // Frontmatter-style fields parsed out of the FS file body.
  status: string;
  owner: string;
};

export type EventEntry = {
  timestamp: string; // ISO 8601
  hvId: string | null; // some events aren't ticket-bound (e.g. "presence")
  action: string;
  actor: string; // either "<colony>.<handle>" or legacy "<handle>"
};

export type EventLog = {
  // Filename without .log extension. Either "<colony>.<handle>" or
  // legacy "<handle>".
  basename: string;
  entries: EventEntry[];
};

export type RepoState = {
  tickets: Ticket[]; // every ticket file across every state directory
  featureSets: FeatureSet[];
  eventLogs: EventLog[];
  now: Date; // injected so staleness checks are testable
};

export type Severity = "critical" | "warning" | "info";

export type AnomalyDetection = {
  code: string;
  severity: Severity;
  message: string;
  details: Record<string, unknown>;
  dedupKey: string;
};

// Parse one line from a hive/events/*.log file.
// Format: "<ISO ts> <HV-XXX|other> <action> <actor>"
// Some lines have only "<ISO ts> presence <actor> online" — handle that.
export function parseEventLine(line: string): EventEntry | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 3) return null;
  const [timestamp, second, ...rest] = parts;
  if (!timestamp.match(/^\d{4}-\d{2}-\d{2}T/)) return null;
  // Detect ticket-bound vs other (e.g. presence)
  if (second.match(/^HV-\d+$/) || second.match(/^HV-\d+(?:,HV-\d+)+$/)) {
    const action = rest[0] ?? "";
    const actor = rest.slice(1).join(" ") || "";
    return { timestamp, hvId: second, action, actor };
  }
  // Non-ticket events like "presence <actor> online"
  return { timestamp, hvId: null, action: second, actor: rest.join(" ") };
}

const QUALIFIED_ACTOR = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.[a-z][a-z0-9-]*$/i;
const GITHUB_LOGIN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;

// 1. Every Assigned to value on in-progress/ + in-review/ tickets is
// qualified <colony>.<handle>. Catches legacy bare-handle leakage.
export function checkAssignedToQualified(state: RepoState): AnomalyDetection[] {
  const out: AnomalyDetection[] = [];
  for (const t of state.tickets) {
    if (t.state !== "in-progress" && t.state !== "in-review") continue;
    const assigned = (t.frontmatter["Assigned to"] || "").trim();
    if (!assigned) continue; // empty is allowed for backlog/done; n/a here
    // Ignore parenthetical model/version notes after the actor.
    const actor = assigned.split(/\s/)[0];
    if (!QUALIFIED_ACTOR.test(actor)) {
      out.push({
        code: "ASSIGNED_TO_UNQUALIFIED",
        severity: "warning",
        message: `${t.hvId}: 'Assigned to' is '${actor}', not qualified <colony>.<handle>`,
        details: { hvId: t.hvId, assigned: actor, state: t.state },
        dedupKey: `ASSIGNED_TO_UNQUALIFIED:${t.hvId}`,
      });
    }
  }
  return out;
}

// 2. Every event log filename matches <colony>.<handle>.log. Legacy
// bare <handle>.log files are flagged as informational so the migration
// can be tracked, not blocking.
export function checkEventLogFilenameFormat(state: RepoState): AnomalyDetection[] {
  const out: AnomalyDetection[] = [];
  for (const log of state.eventLogs) {
    if (!QUALIFIED_ACTOR.test(log.basename)) {
      out.push({
        code: "EVENT_LOG_BARE_HANDLE",
        severity: "info",
        message: `event log 'hive/events/${log.basename}.log' uses bare handle, not <colony>.<handle>`,
        details: { basename: log.basename },
        dedupKey: `EVENT_LOG_BARE_HANDLE:${log.basename}`,
      });
    }
  }
  return out;
}

// 3. Every FS Owner: matches a GitHub login pattern (no bare bot handles
// that look like 'kestrel' or 'allavallc-cc1'). The 'looks like a bot
// handle' heuristic: contains '-cc' suffix or matches a known bot handle.
export function checkFsOwnerIsLogin(state: RepoState): AnomalyDetection[] {
  const out: AnomalyDetection[] = [];
  for (const fs of state.featureSets) {
    const owner = fs.owner.trim();
    if (!owner) continue;
    if (!GITHUB_LOGIN.test(owner)) {
      out.push({
        code: "FS_OWNER_INVALID_FORMAT",
        severity: "critical",
        message: `${fs.fsId}: Owner '${owner}' is not a valid GitHub-login-shaped value`,
        details: { fsId: fs.fsId, owner },
        dedupKey: `FS_OWNER_INVALID_FORMAT:${fs.fsId}`,
      });
    } else if (owner.includes("-cc")) {
      // Heuristic: ADR-003 migration moved Owners from "<login>-cc<n>" to
      // bare "<login>". Anything still containing "-cc" is a stale value.
      out.push({
        code: "FS_OWNER_LEGACY_BOT_HANDLE",
        severity: "warning",
        message: `${fs.fsId}: Owner '${owner}' looks like a legacy bot handle, not a colony login`,
        details: { fsId: fs.fsId, owner },
        dedupKey: `FS_OWNER_LEGACY_BOT_HANDLE:${fs.fsId}`,
      });
    }
  }
  return out;
}

// 5. Every in-progress/ ticket has Last touched within 2h. Stale ticket
// = orphaned bot session. Severity: warning (might be a real long-running
// task; human can investigate).
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;
export function checkInProgressFreshness(state: RepoState): AnomalyDetection[] {
  const out: AnomalyDetection[] = [];
  for (const t of state.tickets) {
    if (t.state !== "in-progress") continue;
    const lastTouched = (t.frontmatter["Last touched"] || "").trim();
    if (!lastTouched) {
      out.push({
        code: "IN_PROGRESS_NO_LAST_TOUCHED",
        severity: "warning",
        message: `${t.hvId}: in-progress with no 'Last touched' value`,
        details: { hvId: t.hvId },
        dedupKey: `IN_PROGRESS_NO_LAST_TOUCHED:${t.hvId}`,
      });
      continue;
    }
    const ts = Date.parse(lastTouched);
    if (Number.isNaN(ts)) continue; // Malformed timestamp: separate concern, don't double-flag.
    const ageMs = state.now.getTime() - ts;
    if (ageMs > STALE_THRESHOLD_MS) {
      const ageHours = Math.round(ageMs / (60 * 60 * 1000));
      out.push({
        code: "IN_PROGRESS_STALE",
        severity: "warning",
        message: `${t.hvId}: in-progress for ${ageHours}h with no activity (>2h threshold)`,
        details: { hvId: t.hvId, lastTouched, ageHours },
        dedupKey: `IN_PROGRESS_STALE:${t.hvId}`,
      });
    }
  }
  return out;
}

// 6. Every owned FS has activity from that colony within 48h dormancy.
// We approximate "colony activity" by scanning event logs for entries
// whose actor matches "<colony>.*".
const DORMANCY_THRESHOLD_MS = 48 * 60 * 60 * 1000;
export function checkFsColonyDormancy(state: RepoState): AnomalyDetection[] {
  const out: AnomalyDetection[] = [];
  // Build last-event-by-colony index.
  const lastByColony = new Map<string, number>();
  for (const log of state.eventLogs) {
    for (const entry of log.entries) {
      const colony = entry.actor.split(".")[0];
      if (!colony) continue;
      const ts = Date.parse(entry.timestamp);
      if (Number.isNaN(ts)) continue;
      const prev = lastByColony.get(colony) ?? 0;
      if (ts > prev) lastByColony.set(colony, ts);
    }
  }
  for (const fs of state.featureSets) {
    const owner = fs.owner.trim();
    if (!owner) continue;
    const last = lastByColony.get(owner);
    if (!last) {
      out.push({
        code: "FS_COLONY_NEVER_ACTIVE",
        severity: "info",
        message: `${fs.fsId}: owned by colony '${owner}' but no events from that colony exist`,
        details: { fsId: fs.fsId, owner },
        dedupKey: `FS_COLONY_NEVER_ACTIVE:${fs.fsId}`,
      });
      continue;
    }
    const ageMs = state.now.getTime() - last;
    if (ageMs > DORMANCY_THRESHOLD_MS) {
      const ageHours = Math.round(ageMs / (60 * 60 * 1000));
      out.push({
        code: "FS_COLONY_DORMANT",
        severity: "info",
        message: `${fs.fsId}: owned by colony '${owner}' but no events from that colony in ${ageHours}h (>48h dormancy)`,
        details: { fsId: fs.fsId, owner, ageHours },
        dedupKey: `FS_COLONY_DORMANT:${fs.fsId}`,
      });
    }
  }
  return out;
}

// 7. Every claim event in the events log corresponds to a ticket file in
// in-progress/, in-review/, or done/. A claim with the ticket still in
// backlog/ means the claim was somehow rolled back without the bot
// noticing; a claim with the ticket missing entirely is data corruption.
//
// 8. (Companion) Every in-review event corresponds to a file in
// in-review/ or done/. THIS IS THE ONE THAT WOULD HAVE CAUGHT BUZZ'S
// dropped-in-review-move bug on 2026-05-09.
export function checkEventVsFileLocation(state: RepoState): AnomalyDetection[] {
  const out: AnomalyDetection[] = [];
  // Build an index of hvId -> current file state.
  const stateByHv = new Map<string, string>();
  for (const t of state.tickets) {
    stateByHv.set(t.hvId, t.state);
  }
  // Walk event entries; for each claim/in-review action, verify the
  // file is at or past the corresponding state.
  const claimedSeen = new Set<string>();
  const inReviewSeen = new Set<string>();
  for (const log of state.eventLogs) {
    for (const entry of log.entries) {
      if (!entry.hvId) continue;
      if (entry.action === "claim") claimedSeen.add(entry.hvId);
      if (entry.action === "in-review") inReviewSeen.add(entry.hvId);
    }
  }
  const reviewableStates = new Set(["in-review", "done"]);
  const claimableStates = new Set(["in-progress", "in-review", "done", "blocked"]);
  for (const hvId of claimedSeen) {
    const cur = stateByHv.get(hvId);
    if (!cur) {
      out.push({
        code: "CLAIM_EVENT_TICKET_MISSING",
        severity: "critical",
        message: `event log says ${hvId} was claimed but no ticket file exists`,
        details: { hvId },
        dedupKey: `CLAIM_EVENT_TICKET_MISSING:${hvId}`,
      });
    } else if (!claimableStates.has(cur)) {
      out.push({
        code: "CLAIM_EVENT_FILE_REVERTED",
        severity: "warning",
        message: `event log says ${hvId} was claimed but file is in '${cur}/' (expected in-progress or later)`,
        details: { hvId, currentState: cur },
        dedupKey: `CLAIM_EVENT_FILE_REVERTED:${hvId}`,
      });
    }
  }
  for (const hvId of inReviewSeen) {
    const cur = stateByHv.get(hvId);
    if (!cur) {
      out.push({
        code: "IN_REVIEW_EVENT_TICKET_MISSING",
        severity: "critical",
        message: `event log says ${hvId} was shipped to in-review but no ticket file exists`,
        details: { hvId },
        dedupKey: `IN_REVIEW_EVENT_TICKET_MISSING:${hvId}`,
      });
    } else if (!reviewableStates.has(cur)) {
      out.push({
        code: "IN_REVIEW_EVENT_FILE_NOT_MOVED",
        severity: "critical",
        message: `event log says ${hvId} was shipped to in-review but file is in '${cur}/' (the buzz-cherry-pick bug class)`,
        details: { hvId, currentState: cur },
        dedupKey: `IN_REVIEW_EVENT_FILE_NOT_MOVED:${hvId}`,
      });
    }
  }
  return out;
}

// FS-023: role consolidation invariants. Reads the colony's active bots
// (sorted by tenure — first event-log timestamp ascending), maps each
// bot's role per the consolidation table from hive/roles.md, and flags
// any bot whose in-progress claims contradict its role:
//
// - 1 bot: PM + coder + tester. No constraints.
// - 2 bots: bot 1 (older) = PM + tester; bot 2 = coder. The PM bot
//   should NOT have in-progress claims at this size.
// - 3+ bots: bot 1 = PM, bot 2 = coder, bot 3 = tester, 4+ = coders.
//   The PM should NOT claim. The tester should NOT claim. Coders do.
//
// Mid-session role drift (bot N takes a claim that doesn't fit its
// current role) shows up here on the next cron tick.
const STALE_BOT_MS = 2 * 60 * 60 * 1000;
export function checkRoleConsolidation(state: RepoState): AnomalyDetection[] {
  // Build active-bots-per-colony from event logs.
  const colonyBots = new Map<string, { handle: string; firstSeen: number }[]>();
  for (const log of state.eventLogs) {
    const m = log.basename.match(/^([^.]+)\.(.+)$/);
    if (!m) continue;
    const [, colony, handle] = m;
    let firstSeen = Number.POSITIVE_INFINITY;
    let lastSeen = 0;
    for (const e of log.entries) {
      const ts = Date.parse(e.timestamp);
      if (Number.isNaN(ts)) continue;
      if (ts < firstSeen) firstSeen = ts;
      if (ts > lastSeen) lastSeen = ts;
    }
    if (lastSeen === 0) continue;
    if (state.now.getTime() - lastSeen > STALE_BOT_MS) continue;
    const list = colonyBots.get(colony) ?? [];
    list.push({ handle, firstSeen });
    colonyBots.set(colony, list);
  }
  for (const [, list] of colonyBots) {
    list.sort((a, b) => a.firstSeen - b.firstSeen);
  }

  // Build per-actor in-progress claim list.
  const claimsByActor = new Map<string, string[]>();
  for (const t of state.tickets) {
    if (t.state !== "in-progress") continue;
    const actor = (t.frontmatter["Assigned to"] || "").split(/\s/)[0];
    if (!actor) continue;
    const list = claimsByActor.get(actor) ?? [];
    list.push(t.hvId);
    claimsByActor.set(actor, list);
  }

  const out: AnomalyDetection[] = [];
  for (const [colony, bots] of colonyBots) {
    if (bots.length < 2) continue; // Single-bot colony has no role constraints.

    const pmActor = `${colony}.${bots[0].handle}`;
    const pmClaims = claimsByActor.get(pmActor) ?? [];

    if (bots.length === 2) {
      if (pmClaims.length > 0) {
        out.push({
          code: "ROLE_PM_CLAIMING_2BOT",
          severity: "warning",
          message: `colony of 2: PM/tester bot '${pmActor}' has in-progress claim(s) ${pmClaims.join(", ")}; coder owns claiming at this size`,
          details: { colony, pmActor, claims: pmClaims, colonySize: 2 },
          dedupKey: `ROLE_PM_CLAIMING_2BOT:${pmActor}`,
        });
      }
    } else {
      // 3+ bots
      if (pmClaims.length > 0) {
        out.push({
          code: "ROLE_PM_CLAIMING_3PLUS",
          severity: "warning",
          message: `colony of ${bots.length}: PM bot '${pmActor}' has in-progress claim(s) ${pmClaims.join(", ")}; PM coordinates only at this size`,
          details: { colony, pmActor, claims: pmClaims, colonySize: bots.length },
          dedupKey: `ROLE_PM_CLAIMING_3PLUS:${pmActor}`,
        });
      }
      const testerActor = `${colony}.${bots[2].handle}`;
      const testerClaims = claimsByActor.get(testerActor) ?? [];
      if (testerClaims.length > 0) {
        out.push({
          code: "ROLE_TESTER_CLAIMING",
          severity: "warning",
          message: `colony of ${bots.length}: tester bot '${testerActor}' has in-progress claim(s) ${testerClaims.join(", ")}; tester reviews, doesn't claim`,
          details: { colony, testerActor, claims: testerClaims, colonySize: bots.length },
          dedupKey: `ROLE_TESTER_CLAIMING:${testerActor}`,
        });
      }
    }
  }
  return out;
}

// Top-level evaluator: runs every invariant and concatenates the results.
export function evaluate(state: RepoState): AnomalyDetection[] {
  return [
    ...checkAssignedToQualified(state),
    ...checkEventLogFilenameFormat(state),
    ...checkFsOwnerIsLogin(state),
    ...checkInProgressFreshness(state),
    ...checkFsColonyDormancy(state),
    ...checkEventVsFileLocation(state),
    ...checkRoleConsolidation(state),
  ];
}
