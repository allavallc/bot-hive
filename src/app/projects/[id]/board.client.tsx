"use client";

import { Wordmark } from "@/components/wordmark";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import styles from "./board.module.css";

type Ticket = {
  id: string;
  hvId: string;
  state: string;
  title: string;
  frontmatter: Record<string, string>;
  body: string;
};

type Feature = {
  id: string;
  fsId: string;
  title: string;
  body: string;
};

type Project = {
  id: string;
  displayName: string;
  githubRepo: string;
};

const COLUMNS = [
  { state: "backlog", label: "Backlog" },
  { state: "in-progress", label: "In progress" },
  { state: "in-review", label: "In review" },
  { state: "done", label: "Done" },
  { state: "blocked", label: "Blocked" },
] as const;

const NOT_DOING = { state: "not-doing", label: "Not doing" } as const;

const PRIORITIES = ["Critical", "High", "Medium", "Low"];

export function Board({
  project,
  initialTickets,
  initialFeatures,
}: {
  project: Project;
  initialTickets: Ticket[];
  initialFeatures: Feature[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  const [tickets, setTickets] = useState<Ticket[]>(initialTickets);
  const [features, setFeatures] = useState<Feature[]>(initialFeatures);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showNotDoing, setShowNotDoing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<Date>(new Date());

  const filterPriority = params.get("priority") ?? "";
  const filterFeature = params.get("feature") ?? "";

  function setFilter(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  useEffect(() => {
    const es = new EventSource(`/api/projects/${project.id}/stream`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = async () => {
      const res = await fetch(`/api/projects/${project.id}/tickets`);
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets);
        setFeatures(data.features);
        setGeneratedAt(new Date());
      }
    };
    return () => es.close();
  }, [project.id]);

  const visible = useMemo(
    () =>
      tickets.filter((t) => {
        if (filterPriority && t.frontmatter.Priority !== filterPriority) return false;
        if (filterFeature && t.frontmatter["Feature set"] !== filterFeature) return false;
        return true;
      }),
    [tickets, filterPriority, filterFeature],
  );

  const cols = showNotDoing ? [...COLUMNS, NOT_DOING] : COLUMNS;
  const byColumn = new Map<string, Ticket[]>();
  for (const c of cols) byColumn.set(c.state, []);
  for (const t of visible) byColumn.get(t.state)?.push(t);

  return (
    <div className={styles.root}>
      <header className={styles.masthead}>
        <Link href="/" className={styles.brand} aria-label="Bot Hive">
          <Wordmark height={28} />
        </Link>
        <div className={styles.mastheadMeta}>
          <span className={styles.connState} data-on={connected}>
            {connected ? "● live" : "○ reconnecting"}
          </span>
          <span className={styles.generatedAt}>Generated {generatedAt.toLocaleString()}</span>
        </div>
      </header>

      <main className={styles.main}>
        <nav className={styles.crumb}>
          <a href="/dashboard" className={styles.crumbLink}>
            ← Dashboard
          </a>
        </nav>
        <nav className={styles.subnav}>
          <a href={`/projects/${project.id}`} className={styles.subnavActive}>
            Board
          </a>
          <span className={styles.subnavRepo}>{project.githubRepo}</span>
        </nav>

        <section className={styles.filters}>
          <FilterSelect
            label="Priority"
            value={filterPriority}
            options={PRIORITIES}
            onChange={(v) => setFilter("priority", v || null)}
          />
          <FilterSelect
            label="Feature set"
            value={filterFeature}
            options={features.map((f) => ({
              value: f.fsId,
              label: f.fsId.replace(/^feature-set-/, "fs-"),
            }))}
            onChange={(v) => setFilter("feature", v || null)}
          />
          <FilterToggle label="Show not-doing" active={showNotDoing} onChange={setShowNotDoing} />
        </section>

        <section
          className={styles.board}
          style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}
        >
          {cols.map((col) => {
            const items = byColumn.get(col.state) ?? [];
            return (
              <div key={col.state} className={styles.column}>
                <div className={styles.columnHeader}>
                  <span className={styles.columnLabel}>{col.label}</span>
                  <span className={styles.columnCount}>{items.length}</span>
                </div>
                <div className={styles.cards}>
                  {items.length === 0 ? (
                    <div className={styles.empty}>No tickets</div>
                  ) : (
                    items.map((t) => (
                      <Card
                        key={t.id}
                        ticket={t}
                        features={features}
                        expanded={expandedId === t.id}
                        onToggle={() => setExpandedId((curr) => (curr === t.id ? null : t.id))}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<string | { value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <label className={styles.filterField}>
      <span className={styles.filterLabel}>{label}</span>
      <select
        className={styles.filterSelect}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">All</option>
        {options.map((opt) => {
          const v = typeof opt === "string" ? opt : opt.value;
          const l = typeof opt === "string" ? opt : opt.label;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function FilterToggle({
  label,
  active,
  onChange,
}: {
  label: string;
  active: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className={styles.filterField}>
      <span className={styles.filterLabel}>&nbsp;</span>
      <button
        type="button"
        className={styles.filterToggle}
        data-active={active}
        onClick={() => onChange(!active)}
      >
        {label}
      </button>
    </div>
  );
}

const ROBOT_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

function robotColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  }
  return ROBOT_COLORS[Math.abs(h) % ROBOT_COLORS.length];
}

function BugIcon() {
  return (
    <svg
      className={styles.bugIcon}
      viewBox="0 0 16 16"
      width="14"
      height="14"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="bug"
      role="img"
    >
      <title>bug</title>
      <ellipse
        cx="8"
        cy="9"
        rx="3.5"
        ry="4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <line x1="8" y1="4.5" x2="8" y2="13.5" stroke="currentColor" strokeWidth="1" />
      <line
        x1="6"
        y1="3"
        x2="5"
        y2="1.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <line
        x1="10"
        y1="3"
        x2="11"
        y2="1.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <line
        x1="4.5"
        y1="7"
        x2="2"
        y2="6"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <line
        x1="11.5"
        y1="7"
        x2="14"
        y2="6"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <line
        x1="4"
        y1="9"
        x2="1.5"
        y2="9"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="9"
        x2="14.5"
        y2="9"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <line
        x1="4.5"
        y1="11"
        x2="2"
        y2="12"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <line
        x1="11.5"
        y1="11"
        x2="14"
        y2="12"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RobotMascot({ name }: { name?: string }) {
  const color = name ? robotColor(name) : "#22c55e";
  const delay = useMemo(() => -Math.random() * 12, []);
  return (
    <svg
      className={styles.botRobot}
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{
        color,
        filter: `drop-shadow(0 0 3px ${color}99)`,
        animationDelay: `${delay}s`,
      }}
    >
      <title>{name ?? "bot"}</title>
      <circle cx="9" cy="1" r="1" fill="currentColor" />
      <line
        x1="9"
        y1="1.5"
        x2="9"
        y2="3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <rect x="3" y="3.5" width="12" height="10.5" rx="2" fill="currentColor" />
      <circle cx="6.5" cy="8" r="1.3" fill="var(--bg)" />
      <circle cx="11.5" cy="8" r="1.3" fill="var(--bg)" />
      <rect x="5" y="14" width="2" height="3" fill="currentColor" />
      <rect x="11" y="14" width="2" height="3" fill="currentColor" />
    </svg>
  );
}

function Card({
  ticket,
  features,
  expanded,
  onToggle,
}: {
  ticket: Ticket;
  features: Feature[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const fm = ticket.frontmatter;
  const fsId = fm["Feature set"];
  const fs = fsId ? features.find((f) => f.fsId === fsId) : null;
  const assignee = fm["Assigned to"];

  return (
    <article className={styles.card} data-expanded={expanded} data-state={ticket.state}>
      {ticket.state === "in-progress" && <RobotMascot name={assignee} />}
      <button
        type="button"
        className={styles.cardButton}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Escape" && expanded) {
            onToggle();
          }
        }}
      >
        <span className={styles.cardTop}>
          {fm.Type === "bug" && <BugIcon />}
          <span className={styles.cardId}>{ticket.hvId}</span>
          <span className={styles.badges}>
            {fm.Priority && (
              <span className={styles.badge} data-priority={fm.Priority}>
                {fm.Priority}
              </span>
            )}
            {fm.Effort && <span className={styles.badge}>{fm.Effort}</span>}
          </span>
        </span>
        {fs && <span className={styles.cardFs}>{fs.fsId.replace(/^feature-set-/, "fs-")}</span>}
        <span className={styles.cardTitle}>{ticket.title}</span>
      </button>
      {expanded && (
        <div className={styles.cardBody}>
          <pre className={styles.bodyText}>{ticket.body}</pre>
        </div>
      )}
    </article>
  );
}
