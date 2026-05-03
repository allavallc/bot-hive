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
  const [generatedAt, setGeneratedAt] = useState<Date>(new Date());

  const filterPriority = params.get("priority") ?? "";
  const filterEffort = params.get("effort") ?? "";
  const filterFeature = params.get("feature") ?? "";
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
        setGeneratedAt(new Date());
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
        <div className={styles.brand}>
          <span className={styles.brandPrimary}>Bot</span>
          <span className={styles.brandAccent}>Hive</span>
        </div>
        <div className={styles.mastheadMeta}>
          <span className={styles.connState} data-on={connected}>
            {connected ? "● live" : "○ reconnecting"}
          </span>
          <span className={styles.generatedAt}>Generated {generatedAt.toLocaleString()}</span>
        </div>
      </header>

      <nav className={styles.subnav}>
        <a href={`/projects/${project.id}`} className={styles.subnavActive}>
          Board
        </a>
        <a href="/dashboard" className={styles.subnavLink}>
          ← Dashboard
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
          label="Effort"
          value={filterEffort}
          options={EFFORTS}
          onChange={(v) => setFilter("effort", v || null)}
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
        <FilterToggle
          label="Ready only"
          active={readyOnly}
          onChange={(v) => setFilter("ready", v ? "1" : null)}
        />
        <FilterToggle label="Show not-doing" active={showNotDoing} onChange={setShowNotDoing} />
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
    <article
      className={styles.card}
      data-expanded={expanded}
      data-priority={fm.Priority}
      data-state={ticket.state}
    >
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
        {fs && (
          <span className={styles.cardFsBadge}>{fs.fsId.replace(/^feature-set-/, "fs-")}</span>
        )}
        <span className={styles.cardIdRow}>
          <span className={styles.cardId}>{ticket.hvId}</span>
          {fm.Priority && (
            <span className={styles.cardBadge} data-priority={fm.Priority}>
              {fm.Priority}
            </span>
          )}
          {fm.Effort && <span className={styles.cardBadge}>{fm.Effort}</span>}
        </span>
        <span className={styles.cardTitle}>{ticket.title}</span>
        {assignee && (
          <span className={styles.cardAssignee}>
            <span className={styles.cardAssigneeDot} aria-hidden="true" />
            {assignee}
          </span>
        )}
      </button>
      {expanded && (
        <div className={styles.cardBody}>
          <pre className={styles.bodyText}>{ticket.body}</pre>
        </div>
      )}
    </article>
  );
}
