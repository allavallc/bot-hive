// HV-113: pure helpers for the in-review column's grouping / sorting and the
// backlog+in-review blocked-by grey-out. Extracted from board.client.tsx so
// they can be unit-tested without the React client wrapper.

export type GroupingTicket = {
  hvId: string;
  frontmatter: Record<string, string>;
};

export type GroupingFeature = {
  fsId: string;
  title: string;
};

export type FsGroup<T extends GroupingTicket = GroupingTicket> = {
  fsKey: string;
  code: string;
  title: string | null;
  tickets: T[];
};

export const STANDALONE_KEY = "__standalone__";

const PRIORITY_RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export function priorityRank(p: string | undefined): number {
  return p && p in PRIORITY_RANK ? PRIORITY_RANK[p] : 99;
}

export function parseBlockedBy(value: string | undefined): string[] {
  if (!value) return [];
  return value.match(/HV-\d+/g) ?? [];
}

export function firstUnfinishedBlocker(
  ticket: GroupingTicket,
  doneSet: ReadonlySet<string>,
): string | null {
  for (const id of parseBlockedBy(ticket.frontmatter["Blocked by"])) {
    if (!doneSet.has(id)) return id;
  }
  return null;
}

export function groupByFs<T extends GroupingTicket>(
  items: T[],
  features: GroupingFeature[],
): FsGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const t of items) {
    const fs = t.frontmatter["Feature set"] || STANDALONE_KEY;
    let list = buckets.get(fs);
    if (!list) {
      list = [];
      buckets.set(fs, list);
    }
    list.push(t);
  }
  const numericHvId = (id: string) => Number.parseInt(id.replace(/^HV-/, ""), 10);
  for (const list of buckets.values()) {
    list.sort((a, b) => {
      const pr = priorityRank(a.frontmatter.Priority) - priorityRank(b.frontmatter.Priority);
      if (pr !== 0) return pr;
      return numericHvId(a.hvId) - numericHvId(b.hvId);
    });
  }
  const keys = Array.from(buckets.keys()).sort((a, b) => {
    if (a === STANDALONE_KEY) return 1;
    if (b === STANDALONE_KEY) return -1;
    return a.localeCompare(b);
  });
  return keys.map((fsKey) => {
    const feature = fsKey === STANDALONE_KEY ? undefined : features.find((f) => f.fsId === fsKey);
    return {
      fsKey,
      code: fsKey === STANDALONE_KEY ? "Standalone" : fsKey.replace(/^feature-set-/, "fs-"),
      title: feature?.title ?? null,
      tickets: buckets.get(fsKey) ?? [],
    };
  });
}
