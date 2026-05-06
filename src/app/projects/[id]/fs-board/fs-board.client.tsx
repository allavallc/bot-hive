"use client";

import { Wordmark } from "@/components/wordmark";
import Link from "next/link";
import { useState } from "react";
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

  const ticketsByFs = new Map<string, Ticket[]>();
  const uncategorized: Ticket[] = [];

  for (const t of initialTickets) {
    const fsId = t.frontmatter["Feature set"];
    if (!fsId) {
      uncategorized.push(t);
    } else {
      if (!ticketsByFs.has(fsId)) ticketsByFs.set(fsId, []);
      ticketsByFs.get(fsId)?.push(t);
    }
  }

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
  const [open, setOpen] = useState(true);

  const activeCount = tickets.filter((t) => t.state !== "done" && t.state !== "not-doing").length;

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
        <ul className={styles.ticketList}>
          {tickets.length === 0 ? (
            <li className={styles.emptyRow}>No tickets</li>
          ) : (
            tickets.map((t) => (
              <li key={t.id} className={styles.ticketRow}>
                <span className={styles.statePill} data-state={t.state}>
                  {STATE_LABEL[t.state] ?? t.state}
                </span>
                <span className={styles.ticketId}>{t.hvId}</span>
                <span className={styles.ticketTitle}>{t.title}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
