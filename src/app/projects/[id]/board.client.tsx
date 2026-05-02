"use client";

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
const EFFORTS = ["XS", "S", "M", "L", "XL"];

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

  const filterPriority = params.get("priority");
  const filterEffort = params.get("effort");
  const filterFeature = params.get("feature");
  const readyOnly = params.get("ready") === "1";

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
      }
    };
    return () => es.close();
  }, [project.id]);

  const doneHvIds = useMemo(
    () => new Set(tickets.filter((t) => t.state === "done").map((t) => t.hvId)),
    [tickets],
  );

  const visible = useMemo(
    () =>
      tickets.filter((t) => {
        if (filterPriority && t.frontmatter.Priority !== filterPriority) return false;
        if (filterEffort && t.frontmatter.Effort !== filterEffort) return false;
        if (filterFeature && t.frontmatter["Feature set"] !== filterFeature) return false;
        if (readyOnly) {
          const blockers = (t.frontmatter["Blocked by"] ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (blockers.some((id) => !doneHvIds.has(id))) return false;
        }
        return true;
      }),
    [tickets, filterPriority, filterEffort, filterFeature, readyOnly, doneHvIds],
  );

  const cols = showNotDoing ? [...COLUMNS, NOT_DOING] : COLUMNS;
  const byColumn = new Map<string, Ticket[]>();
  for (const c of cols) byColumn.set(c.state, []);
  for (const t of visible) byColumn.get(t.state)?.push(t);

  return (
    <main className={styles.root}>
      <header className={styles.masthead}>
        <div className={styles.mastheadInner}>
          <a href="/dashboard" className={styles.crumb}>
            ← Dashboard
          </a>
          <div className={styles.titleBlock}>
            <span className={styles.kicker}>Project / {project.githubRepo}</span>
            <h1 className={styles.title}>{project.displayName}</h1>
          </div>
          <div className={styles.connState} data-on={connected}>
            {connected ? "● live" : "○ reconnecting"}
          </div>
        </div>
      </header>

      <section className={styles.filters}>
        <FilterGroup label="Priority">
          <FilterChip active={!filterPriority} onClick={() => setFilter("priority", null)}>
            All
          </FilterChip>
          {PRIORITIES.map((p) => (
            <FilterChip
              key={p}
              active={filterPriority === p}
              onClick={() => setFilter("priority", p)}
            >
              {p}
            </FilterChip>
          ))}
        </FilterGroup>

        <FilterGroup label="Effort">
          <FilterChip active={!filterEffort} onClick={() => setFilter("effort", null)}>
            All
          </FilterChip>
          {EFFORTS.map((e) => (
            <FilterChip key={e} active={filterEffort === e} onClick={() => setFilter("effort", e)}>
              {e}
            </FilterChip>
          ))}
        </FilterGroup>

        {features.length > 0 && (
          <FilterGroup label="Feature set">
            <FilterChip active={!filterFeature} onClick={() => setFilter("feature", null)}>
              All
            </FilterChip>
            {features.map((f) => (
              <FilterChip
                key={f.fsId}
                active={filterFeature === f.fsId}
                onClick={() => setFilter("feature", f.fsId)}
              >
                {f.fsId.replace(/^feature-set-/, "fs-")}
              </FilterChip>
            ))}
          </FilterGroup>
        )}

        <FilterGroup label="">
          <FilterChip active={readyOnly} onClick={() => setFilter("ready", readyOnly ? null : "1")}>
            Ready only
          </FilterChip>
          <FilterChip active={showNotDoing} onClick={() => setShowNotDoing((v) => !v)}>
            Show not-doing
          </FilterChip>
        </FilterGroup>
      </section>

      <section
        className={styles.board}
        style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}
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
                {items.map((t) => (
                  <Card
                    key={t.id}
                    ticket={t}
                    features={features}
                    expanded={expandedId === t.id}
                    onToggle={() => setExpandedId((curr) => (curr === t.id ? null : t.id))}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.filterGroup}>
      {label && <span className={styles.filterLabel}>{label}</span>}
      <div className={styles.filterChips}>{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={styles.chip} data-active={active} onClick={onClick}>
      {children}
    </button>
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

  return (
    <article className={styles.card} data-expanded={expanded} data-priority={fm.Priority}>
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
          <span className={styles.cardId}>{ticket.hvId}</span>
          <span className={styles.cardTitle}>{ticket.title}</span>
        </span>
        <span className={styles.cardMeta}>
          {fm.Priority && <span className={styles.metaBadge}>{fm.Priority}</span>}
          {fm.Effort && <span className={styles.metaBadge}>{fm.Effort}</span>}
          {fs && (
            <span className={styles.metaBadgeAccent}>
              {fs.fsId.replace(/^feature-set-/, "fs-")}
            </span>
          )}
        </span>
      </button>
      {expanded && (
        <div className={styles.cardBody}>
          <pre className={styles.bodyText}>{ticket.body}</pre>
        </div>
      )}
    </article>
  );
}
