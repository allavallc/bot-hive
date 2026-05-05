"use client";

import { RobotMascot, robotColor } from "@/components/robot-mascot";
import { Wordmark } from "@/components/wordmark";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [showNotDoing, setShowNotDoing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<Date>(new Date());
  const [animating, setAnimating] = useState<Map<string, "arrived" | "new" | "in-review">>(
    new Map(),
  );

  const openTriggerRef = useRef<HTMLElement | null>(null);
  const prevTicketsRef = useRef<Ticket[]>(initialTickets);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const filterPriority = params.get("priority") ?? "";
  const filterFeature = params.get("feature") ?? "";

  function setFilter(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  const computeAnimations = useCallback((prev: Ticket[], next: Ticket[]) => {
    const prevById = new Map(prev.map((t) => [t.id, t]));
    const result = new Map<string, "arrived" | "new" | "in-review">();
    for (const t of next) {
      const old = prevById.get(t.id);
      if (!old) {
        result.set(t.id, "new");
      } else if (old.state !== t.state) {
        result.set(t.id, t.state === "in-review" ? "in-review" : "arrived");
      }
    }
    return result;
  }, []);

  useEffect(() => {
    const es = new EventSource(`/api/projects/${project.id}/stream`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = async () => {
      const res = await fetch(`/api/projects/${project.id}/tickets`);
      if (res.ok) {
        const data = await res.json();
        const next: Ticket[] = data.tickets;
        const anims = computeAnimations(prevTicketsRef.current, next);
        prevTicketsRef.current = next;
        setTickets(next);
        setFeatures(data.features);
        setGeneratedAt(new Date());
        if (anims.size > 0) {
          clearTimeout(animTimerRef.current);
          setAnimating(anims);
          animTimerRef.current = setTimeout(() => setAnimating(new Map()), 2500);
        }
      }
    };
    return () => {
      es.close();
      clearTimeout(animTimerRef.current);
    };
  }, [project.id, computeAnimations]);

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

  const openTicket = openTicketId ? (tickets.find((t) => t.id === openTicketId) ?? null) : null;

  function handleCardOpen(ticketId: string, trigger: HTMLElement) {
    openTriggerRef.current = trigger;
    setOpenTicketId(ticketId);
  }

  function handleModalClose() {
    setOpenTicketId(null);
    openTriggerRef.current?.focus();
    openTriggerRef.current = null;
  }

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
                        animState={animating.get(t.id)}
                        onOpen={(trigger) => handleCardOpen(t.id, trigger)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </section>
      </main>

      <TicketModal ticket={openTicket} onClose={handleModalClose} />
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

const MODEL_ID_PREFIX_RE = /^(claude|gpt|gemini|llama|mistral|qwen|grok)\b/i;

function extractHandle(assignedTo?: string): string | undefined {
  if (!assignedTo) return undefined;
  const trimmed = assignedTo.split(/\s*\(/)[0].trim();
  if (trimmed.length === 0) return undefined;
  if (MODEL_ID_PREFIX_RE.test(trimmed)) return undefined;
  return trimmed;
}

function WalkingRobot({ name }: { name?: string }) {
  const delay = useMemo(() => -Math.random() * 12, []);
  return (
    <RobotMascot name={name} className={styles.botRobot} style={{ animationDelay: `${delay}s` }} />
  );
}

function Card({
  ticket,
  features,
  animState,
  onOpen,
}: {
  ticket: Ticket;
  features: Feature[];
  animState?: "arrived" | "new" | "in-review";
  onOpen: (trigger: HTMLElement) => void;
}) {
  const fm = ticket.frontmatter;
  const fsId = fm["Feature set"];
  const fs = fsId ? features.find((f) => f.fsId === fsId) : null;
  const assignee = fm["Assigned to"];
  const handle = extractHandle(assignee);

  return (
    <article className={styles.card} data-state={ticket.state} data-anim={animState}>
      {ticket.state === "in-progress" && <WalkingRobot name={assignee} />}
      {handle && (
        <span
          className={styles.cardBot}
          style={{ color: robotColor(handle), borderColor: robotColor(handle) }}
        >
          {handle}
        </span>
      )}
      <button type="button" className={styles.cardButton} onClick={(e) => onOpen(e.currentTarget)}>
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
    </article>
  );
}

function TicketModal({
  ticket,
  onClose,
}: {
  ticket: Ticket | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onCloseRef.current();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (ticket) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [ticket]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  const fm = ticket?.frontmatter ?? {};
  const metaEntries = Object.entries(fm).filter(([, v]) => v);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: <dialog> handles Escape via the cancel event listener above
    <dialog
      ref={dialogRef}
      className={styles.modal}
      onClick={handleBackdropClick}
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className={styles.modalInner}>
        <div className={styles.modalHeader}>
          <h2 id="modal-title" className={styles.modalTitle}>
            <span className={styles.modalHvId}>{ticket?.hvId}</span>
            {ticket?.title}
          </h2>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className={styles.modalBody}>
          {ticket && (
            <>
              <dl className={styles.modalMeta}>
                {metaEntries.map(([k, v]) => (
                  <div key={k} className={styles.modalMetaRow}>
                    <dt className={styles.modalMetaKey}>{k}</dt>
                    <dd className={styles.modalMetaVal}>{v}</dd>
                  </div>
                ))}
              </dl>
              <pre className={styles.bodyText}>{ticket.body}</pre>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
