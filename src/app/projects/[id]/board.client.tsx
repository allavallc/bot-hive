"use client";

import { HumanMascot } from "@/components/human-mascot";
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

function effectiveState(
  ticket: Ticket,
  pending: { kind: "approved" | "rejected" } | undefined,
): string {
  if (!pending) return ticket.state;
  if (ticket.state !== "in-review") return ticket.state;
  return pending.kind === "approved" ? "done" : "in-progress";
}

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
  // hvId → pending transition kind, set by signals from accept/reject. Cleared
  // when the ticket actually moves columns (SSE refresh) or after a timeout.
  const [pendingTransitions, setPendingTransitions] = useState<
    Map<string, { kind: "approved" | "rejected"; at: number }>
  >(new Map());

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
        // Clear pending-transition badges for any ticket that has actually
        // moved out of in-review — the underlying state change is now visible,
        // so the "pending merge" hint has served its purpose.
        setPendingTransitions((prev) => {
          if (prev.size === 0) return prev;
          let changed = false;
          const out = new Map(prev);
          for (const t of next) {
            if (out.has(t.hvId) && t.state !== "in-review") {
              out.delete(t.hvId);
              changed = true;
            }
          }
          return changed ? out : prev;
        });
      }
    };
    return () => {
      es.close();
      clearTimeout(animTimerRef.current);
    };
  }, [project.id, computeAnimations]);

  // Subscribe to the real-time signal stream for accept/reject signals so the
  // pending-merge badge appears within ~200ms of the click — well before CI +
  // deploy land the actual state change. (HV-055.)
  useEffect(() => {
    const es = new EventSource(`/api/projects/${project.id}/signals/stream`);
    es.onmessage = (ev) => {
      try {
        const sig = JSON.parse(ev.data) as {
          id: string;
          type: string;
          refs?: string[];
        };
        const hvId = sig.refs?.[0];
        if (!hvId) return;
        if (sig.type === "accepted" || sig.type === "rejected") {
          const kind = sig.type === "accepted" ? "approved" : "rejected";
          setPendingTransitions((prev) => {
            const out = new Map(prev);
            out.set(hvId, { kind, at: Date.now() });
            return out;
          });
        }
      } catch {
        // Malformed payload — ignore.
      }
    };
    return () => es.close();
  }, [project.id]);

  // Hard timeout: drop badges older than 10 minutes. Protects against a stuck
  // CI / deploy that never lands the underlying state change.
  useEffect(() => {
    if (pendingTransitions.size === 0) return;
    const tick = setInterval(() => {
      setPendingTransitions((prev) => {
        if (prev.size === 0) return prev;
        const now = Date.now();
        let changed = false;
        const out = new Map(prev);
        for (const [hvId, entry] of prev) {
          if (now - entry.at > 10 * 60 * 1000) {
            out.delete(hvId);
            changed = true;
          }
        }
        return changed ? out : prev;
      });
    }, 30_000);
    return () => clearInterval(tick);
  }, [pendingTransitions.size]);

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
  for (const t of visible) {
    const col = effectiveState(t, pendingTransitions.get(t.hvId));
    byColumn.get(col)?.push(t);
  }

  const openTicket = openTicketId ? (tickets.find((t) => t.id === openTicketId) ?? null) : null;

  function handleCardOpen(ticketId: string, trigger: HTMLElement) {
    openTriggerRef.current = trigger;
    setOpenTicketId(ticketId);
  }

  function handlePanelClose() {
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
                        pendingTransition={pendingTransitions.get(t.hvId)?.kind}
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

      <TicketPanel ticket={openTicket} projectId={project.id} onClose={handlePanelClose} />
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

function WalkingHuman() {
  const delay = useMemo(() => -Math.random() * 14, []);
  return <HumanMascot className={styles.cardHuman} style={{ animationDelay: `${delay}s` }} />;
}

function Card({
  ticket,
  features,
  animState,
  pendingTransition,
  onOpen,
}: {
  ticket: Ticket;
  features: Feature[];
  animState?: "arrived" | "new" | "in-review";
  pendingTransition?: "approved" | "rejected";
  onOpen: (trigger: HTMLElement) => void;
}) {
  const fm = ticket.frontmatter;
  const fsId = fm["Feature set"];
  const fs = fsId ? features.find((f) => f.fsId === fsId) : null;
  const assignee = fm["Assigned to"];
  const handle = extractHandle(assignee);

  return (
    <article className={styles.card} data-state={ticket.state} data-anim={animState}>
      {ticket.state === "in-progress" && !pendingTransition && <WalkingRobot name={assignee} />}
      {ticket.state === "in-review" && !pendingTransition && <WalkingHuman />}
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
        {pendingTransition && (
          <span className={styles.pendingBanner} data-kind={pendingTransition}>
            {pendingTransition === "approved" ? "✓ Approved" : "✗ Rejected"} — pending merge
          </span>
        )}
        {fs && <span className={styles.cardFs}>{fs.fsId.replace(/^feature-set-/, "fs-")}</span>}
        <span className={styles.cardTitle}>{ticket.title}</span>
      </button>
    </article>
  );
}

type ReviewState =
  | { phase: "idle" }
  | { phase: "rejecting"; reason: string }
  | { phase: "submitting" }
  | { phase: "done"; prUrl: string; prNumber: number; action: "accepted" | "rejected" };

function TicketPanel({
  ticket,
  projectId,
  onClose,
}: {
  ticket: Ticket | null;
  projectId: string;
  onClose: () => void;
}) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const [review, setReview] = useState<ReviewState>({ phase: "idle" });

  // Reset review state when a different ticket opens
  const prevTicketId = useRef<string | null>(null);
  useEffect(() => {
    if (ticket?.id !== prevTicketId.current) {
      prevTicketId.current = ticket?.id ?? null;
      setReview({ phase: "idle" });
    }
  }, [ticket?.id]);

  async function handleAccept() {
    if (!ticket) return;
    setReview({ phase: "submitting" });
    try {
      const res = await fetch(`/api/projects/${projectId}/tickets/${ticket.hvId}/accept`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "unknown error");
      setReview({ phase: "done", prUrl: data.prUrl, prNumber: data.prNumber, action: "accepted" });
    } catch (err) {
      setReview({ phase: "idle" });
      alert(`Accept failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleRejectConfirm() {
    if (!ticket || review.phase !== "rejecting") return;
    const reason = review.reason.trim();
    if (!reason) return;
    setReview({ phase: "submitting" });
    try {
      const res = await fetch(`/api/projects/${projectId}/tickets/${ticket.hvId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "unknown error");
      setReview({ phase: "done", prUrl: data.prUrl, prNumber: data.prNumber, action: "rejected" });
    } catch (err) {
      setReview({ phase: "idle" });
      alert(`Reject failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const isOpen = ticket !== null;
  const fm = ticket?.frontmatter ?? {};
  const metaEntries = Object.entries(fm).filter(([, v]) => v);
  const canReview = ticket?.state === "in-review";

  return (
    <section className={styles.panel} data-open={isOpen} aria-label="Ticket details">
      <div className={styles.panelHeader}>
        <div className={styles.panelTitleBlock}>
          <span className={styles.panelHvId}>{ticket?.hvId ?? ""}</span>
          <h2 className={styles.panelTitle}>{ticket?.title ?? ""}</h2>
        </div>
        <button type="button" className={styles.panelClose} onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className={styles.panelBody}>
        {ticket && (
          <>
            <dl className={styles.panelMeta}>
              {metaEntries.map(([k, v]) => (
                <div key={k} className={styles.panelMetaRow}>
                  <dt className={styles.panelMetaKey}>{k}</dt>
                  <dd className={styles.panelMetaVal}>{v}</dd>
                </div>
              ))}
            </dl>
            <pre className={styles.bodyText}>{ticket.body}</pre>

            {canReview && (
              <div className={styles.panelActions}>
                {review.phase === "idle" && (
                  <>
                    <button
                      type="button"
                      className={`${styles.panelActionBtn} ${styles.panelActionAccept}`}
                      onClick={handleAccept}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className={`${styles.panelActionBtn} ${styles.panelActionReject}`}
                      onClick={() => setReview({ phase: "rejecting", reason: "" })}
                    >
                      Reject
                    </button>
                  </>
                )}

                {review.phase === "rejecting" && (
                  <div className={styles.rejectForm}>
                    <label className={styles.rejectLabel} htmlFor="reject-reason">
                      Rejection reason
                    </label>
                    <textarea
                      id="reject-reason"
                      className={styles.rejectReason}
                      // biome-ignore lint/a11y/noAutofocus: intentional — user just clicked Reject
                      autoFocus
                      rows={3}
                      placeholder="What needs to change?"
                      value={review.reason}
                      onChange={(e) => setReview({ phase: "rejecting", reason: e.target.value })}
                    />
                    <div className={styles.rejectFormActions}>
                      <button
                        type="button"
                        className={`${styles.panelActionBtn} ${styles.panelActionReject}`}
                        disabled={review.reason.trim().length === 0}
                        onClick={handleRejectConfirm}
                      >
                        Confirm reject
                      </button>
                      <button
                        type="button"
                        className={styles.panelActionBtn}
                        onClick={() => setReview({ phase: "idle" })}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {review.phase === "submitting" && (
                  <span className={styles.reviewStatus}>Submitting…</span>
                )}

                {review.phase === "done" && (
                  <div className={styles.reviewResult}>
                    <span className={styles.reviewResultLabel}>
                      {review.action === "accepted" ? "Accepted" : "Rejected"} —{" "}
                    </span>
                    <a
                      href={review.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.reviewResultLink}
                    >
                      PR #{review.prNumber}
                    </a>
                    <span className={styles.reviewResultSub}> queued for merge</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
