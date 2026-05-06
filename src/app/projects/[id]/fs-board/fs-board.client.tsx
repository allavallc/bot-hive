"use client";

import { HumanMascot } from "@/components/human-mascot";
import { RobotMascot, robotColor } from "@/components/robot-mascot";
import { Wordmark } from "@/components/wordmark";
import Link from "next/link";
import { useMemo, useState } from "react";
import boardStyles from "../board.module.css";
import styles from "./fs-board.module.css";

type Ticket = {
  id: string;
  hvId: string;
  state: string;
  title: string;
  frontmatter: Record<string, string>;
};

type Feature = {
  id: string;
  fsId: string;
  title: string;
};

type Project = {
  id: string;
  displayName: string;
  githubRepo: string;
};

type Assignee = { name: string; isBot: boolean };

const STATE_ORDER = ["in-progress", "in-review", "backlog", "blocked", "done", "not-doing"];

const STATE_LABEL: Record<string, string> = {
  "in-progress": "in progress",
  "in-review": "in review",
  backlog: "backlog",
  blocked: "blocked",
  done: "done",
  "not-doing": "not doing",
};

function sortTickets(a: Ticket, b: Ticket) {
  const ai = STATE_ORDER.indexOf(a.state);
  const bi = STATE_ORDER.indexOf(b.state);
  return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
}

function parseAssignee(raw: string): Assignee | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const name = trimmed.split(" (")[0].trim();
  const isBot = trimmed.includes("claude-");
  return { name, isBot };
}

function groupByAssignee(tickets: Ticket[]): { assignee: Assignee | null; tickets: Ticket[] }[] {
  const map = new Map<string, { assignee: Assignee | null; tickets: Ticket[] }>();
  const UNASSIGNED = "\x00";

  for (const t of tickets) {
    const raw = t.frontmatter["Assigned to"] ?? "";
    const assignee = parseAssignee(raw);
    const key = assignee?.name ?? UNASSIGNED;
    if (!map.has(key)) map.set(key, { assignee, tickets: [] });
    map.get(key)?.tickets.push(t);
  }

  return [...map.values()].sort((a, b) => {
    if (!a.assignee && b.assignee) return 1;
    if (a.assignee && !b.assignee) return -1;
    if (a.assignee?.isBot && !b.assignee?.isBot) return -1;
    if (!a.assignee?.isBot && b.assignee?.isBot) return 1;
    return (a.assignee?.name ?? "").localeCompare(b.assignee?.name ?? "");
  });
}

export function FsBoard({
  project,
  initialTickets,
  initialFeatures,
}: {
  project: Project;
  initialTickets: Ticket[];
  initialFeatures: Feature[];
}) {
  const generatedAt = new Date();

  const ticketsByFs = useMemo(() => {
    const map = new Map<string, Ticket[]>();
    for (const t of initialTickets) {
      const fsId = t.frontmatter["Feature set"];
      if (fsId) {
        if (!map.has(fsId)) map.set(fsId, []);
        map.get(fsId)?.push(t);
      }
    }
    return map;
  }, [initialTickets]);

  const uncategorized = useMemo(
    () => initialTickets.filter((t) => !t.frontmatter["Feature set"]),
    [initialTickets],
  );

  const activeWorkers = useMemo(() => {
    const map = new Map<string, { name: string; isBot: boolean; count: number }>();
    for (const t of initialTickets) {
      if (t.state !== "in-progress" && t.state !== "in-review") continue;
      const raw = t.frontmatter["Assigned to"] ?? "";
      const assignee = parseAssignee(raw);
      if (!assignee) continue;
      const existing = map.get(assignee.name);
      if (existing) {
        existing.count++;
      } else {
        map.set(assignee.name, { ...assignee, count: 1 });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [initialTickets]);

  return (
    <div className={boardStyles.root}>
      <header className={boardStyles.masthead}>
        <Link href="/" className={boardStyles.brand} aria-label="Bot Hive">
          <Wordmark height={28} />
        </Link>
      </header>

      <main className={boardStyles.main}>
        <div className={boardStyles.crumbRow}>
          <nav className={boardStyles.crumb}>
            <a href="/dashboard" className={boardStyles.crumbLink}>
              ← Dashboard
            </a>
          </nav>
          <span className={boardStyles.generatedAt}>Generated {generatedAt.toLocaleString()}</span>
        </div>

        <nav className={boardStyles.subnav}>
          <a href={`/projects/${project.id}`} className={boardStyles.subnavLink}>
            Board
          </a>
          <a href={`/projects/${project.id}/fs-board`} className={boardStyles.subnavActive}>
            FS Board
          </a>
          <span className={boardStyles.subnavRepo}>{project.githubRepo}</span>
        </nav>

        {activeWorkers.length > 0 && (
          <div className={styles.presenceStrip}>
            {activeWorkers.map((w) => (
              <span key={w.name} className={styles.presenceItem}>
                {w.isBot ? (
                  <RobotMascot
                    name={w.name}
                    style={{ width: 14, height: 14, color: robotColor(w.name) }}
                  />
                ) : (
                  <HumanMascot style={{ width: 14, height: 14 }} />
                )}
                <span className={styles.presenceName}>{w.name}</span>
                <span className={styles.presenceCount}>{w.count}</span>
              </span>
            ))}
          </div>
        )}

        <div className={styles.sections}>
          {initialFeatures.map((fs) => {
            const tickets = (ticketsByFs.get(fs.fsId) ?? []).sort(sortTickets);
            const label = `${fs.fsId.replace("feature-set-", "FS-")} — ${fs.title}`;
            return <FsSection key={fs.id} label={label} tickets={tickets} />;
          })}
          {uncategorized.length > 0 && (
            <FsSection label="Uncategorized" tickets={uncategorized.sort(sortTickets)} />
          )}
        </div>
      </main>
    </div>
  );
}

function FsSection({ label, tickets }: { label: string; tickets: Ticket[] }) {
  const [open, setOpen] = useState(false);

  const activeCount = tickets.filter((t) => t.state !== "done" && t.state !== "not-doing").length;

  const groups = groupByAssignee(tickets);

  return (
    <div className={styles.section}>
      <button
        type="button"
        className={styles.sectionHeader}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={styles.toggle}>{open ? "▾" : "▸"}</span>
        <span className={styles.sectionLabel}>{label}</span>
        <span className={styles.countBadge}>{tickets.length}</span>
        {activeCount > 0 && <span className={styles.activeBadge}>{activeCount} active</span>}
      </button>
      {open && (
        <div className={styles.laneList}>
          {groups.map((g) => (
            <AssigneeLane
              key={g.assignee?.name ?? "__unassigned__"}
              assignee={g.assignee}
              tickets={g.tickets}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AssigneeLane({
  assignee,
  tickets,
}: {
  assignee: Assignee | null;
  tickets: Ticket[];
}) {
  const activeCount = tickets.filter((t) => t.state !== "done" && t.state !== "not-doing").length;

  return (
    <div className={styles.lane}>
      <div className={styles.laneHeader}>
        {assignee ? (
          assignee.isBot ? (
            <RobotMascot
              name={assignee.name}
              style={{ width: 13, height: 13, color: robotColor(assignee.name) }}
            />
          ) : (
            <HumanMascot style={{ width: 13, height: 13 }} />
          )
        ) : null}
        <span className={styles.laneName}>{assignee?.name ?? "unassigned"}</span>
        {activeCount > 0 && <span className={styles.laneActive}>{activeCount} active</span>}
        <span className={styles.laneCount}>{tickets.length}</span>
      </div>
      <ul className={styles.ticketList}>
        {tickets.map((t) => (
          <li key={t.id} className={styles.ticketRow}>
            <span className={styles.statePill} data-state={t.state}>
              {STATE_LABEL[t.state] ?? t.state}
            </span>
            <span className={styles.ticketId}>{t.hvId}</span>
            <span className={styles.ticketTitle}>{t.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
