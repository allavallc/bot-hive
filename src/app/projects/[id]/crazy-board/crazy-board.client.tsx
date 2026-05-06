"use client";

import { HumanMascot } from "@/components/human-mascot";
import { RobotMascot, robotColor } from "@/components/robot-mascot";
import { Wordmark } from "@/components/wordmark";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import boardStyles from "../board.module.css";
import styles from "./crazy-board.module.css";

type Ticket = {
  id: string;
  hvId: string;
  state: string;
  title: string;
  body: string;
  frontmatter: Record<string, string>;
};

type Feature = { id: string; fsId: string; title: string };
type Project = { id: string; displayName: string; githubRepo: string };

// Outermost = backlog, innermost = done (near sun)
const RING: Record<string, { radius: number; baseDuration: number }> = {
  "not-doing": { radius: 430, baseDuration: 260 },
  backlog: { radius: 360, baseDuration: 90 },
  blocked: { radius: 285, baseDuration: 170 },
  "in-progress": { radius: 215, baseDuration: 52 },
  "in-review": { radius: 145, baseDuration: 30 },
  done: { radius: 75, baseDuration: 150 },
};

const SHIP_RADIUS = 215;
const SHIP_DURATION = 48;

const PRIORITY_SIZE: Record<string, number> = {
  Critical: 16,
  High: 12,
  Medium: 9,
  Low: 6,
};

const FS_PALETTE = [
  "#c4724a",
  "#4a9bc4",
  "#4ac47a",
  "#c44a9b",
  "#d4c44a",
  "#8a4ac4",
  "#c45a4a",
  "#4ac4c4",
];

function fsColor(fsId: string): string {
  let h = 0;
  for (const c of fsId) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return FS_PALETTE[Math.abs(h) % FS_PALETTE.length];
}

function strHash(s: string): number {
  let h = 0;
  for (const c of s) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

function generateStars(count: number) {
  let seed = 0xdeadbeef;
  const rand = () => {
    seed = ((seed * 1664525 + 1013904223) | 0) >>> 0;
    return seed / 0xffffffff;
  };
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: rand() * 100,
    y: rand() * 100,
    size: rand() < 0.78 ? 1 : rand() < 0.93 ? 1.5 : 2.5,
    opacity: 0.2 + rand() * 0.8,
  }));
}

function parseAssignee(raw: string): { name: string; isBot: boolean } | null {
  const t = raw.trim();
  if (!t) return null;
  return { name: t.split(" (")[0].trim(), isBot: t.includes("claude-") };
}

export function CrazyBoard({
  project,
  initialTickets,
  initialFeatures,
}: {
  project: Project;
  initialTickets: Ticket[];
  initialFeatures: Feature[];
}) {
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [actionState, setActionState] = useState<"idle" | "loading" | "done" | "error">("idle");

  const stars = useMemo(() => generateStars(220), []);

  const fsColorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of initialFeatures) m.set(f.fsId, fsColor(f.fsId));
    return m;
  }, [initialFeatures]);

  // Active crew: bots/humans with in-progress or in-review tickets
  const crew = useMemo(() => {
    const seen = new Map<string, { name: string; isBot: boolean; angle: number }>();
    for (const t of initialTickets) {
      if (t.state !== "in-progress" && t.state !== "in-review") continue;
      const a = parseAssignee(t.frontmatter["Assigned to"] ?? "");
      if (a && !seen.has(a.name)) {
        seen.set(a.name, { ...a, angle: strHash(a.name) % 360 });
      }
    }
    return [...seen.values()];
  }, [initialTickets]);

  // Set of tickets assigned to a known crew member in in-progress (travel with ship)
  const crewInProgressTickets = useMemo(() => {
    const crewNames = new Set(crew.map((w) => w.name));
    const s = new Set<string>();
    for (const t of initialTickets) {
      if (t.state !== "in-progress") continue;
      const a = parseAssignee(t.frontmatter["Assigned to"] ?? "");
      if (a && crewNames.has(a.name)) s.add(t.id);
    }
    return s;
  }, [initialTickets, crew]);

  const satellites = useMemo(() => {
    return initialTickets.map((t) => {
      const crewAssignee = crewInProgressTickets.has(t.id)
        ? parseAssignee(t.frontmatter["Assigned to"] ?? "")
        : null;

      let radius: number;
      let duration: number;
      let startAngle: number;

      if (crewAssignee) {
        // Orbit with the crew ship — same speed, tight cluster
        const shipAngle = strHash(crewAssignee.name) % 360;
        const ticketIndex = initialTickets
          .filter(
            (x) =>
              crewInProgressTickets.has(x.id) &&
              parseAssignee(x.frontmatter["Assigned to"] ?? "")?.name === crewAssignee.name,
          )
          .indexOf(t);
        radius = SHIP_RADIUS + (ticketIndex % 2 === 0 ? -22 : 22);
        duration = SHIP_DURATION;
        startAngle = (shipAngle + (ticketIndex - 1) * 12) % 360;
      } else {
        const cfg = RING[t.state] ?? RING.backlog;
        const hash = strHash(t.hvId);
        const factor = 0.8 + (hash % 100) / 250;
        duration = cfg.baseDuration * factor;
        startAngle = hash % 360;
        radius = cfg.radius;
      }

      const delay = -(startAngle / 360) * duration;
      const size = PRIORITY_SIZE[t.frontmatter.Priority ?? ""] ?? 8;
      const color = fsColorMap.get(t.frontmatter["Feature set"] ?? "") ?? "#666";
      return { ticket: t, radius, duration, delay, size, color };
    });
  }, [initialTickets, fsColorMap, crewInProgressTickets]);

  async function handleAccept() {
    if (!selected) return;
    setActionState("loading");
    const res = await fetch(`/api/projects/${project.id}/tickets/${selected.hvId}/accept`, {
      method: "POST",
    });
    setActionState(res.ok ? "done" : "error");
  }

  async function handleReject() {
    if (!selected || !rejectReason.trim()) return;
    setActionState("loading");
    const res = await fetch(`/api/projects/${project.id}/tickets/${selected.hvId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: rejectReason }),
    });
    setActionState(res.ok ? "done" : "error");
  }

  function handleSelectTicket(t: Ticket) {
    setSelected(t);
    setRejecting(false);
    setRejectReason("");
    setActionState("idle");
  }

  return (
    <div className={boardStyles.root}>
      <header className={boardStyles.masthead}>
        <Link href="/" className={boardStyles.brand} aria-label="Bot Hive">
          <Wordmark height={28} />
        </Link>
      </header>

      <main className={boardStyles.main} style={{ padding: 0 } as CSSProperties}>
        <div className={styles.topBar}>
          <div
            className={boardStyles.crumbRow}
            style={{ padding: "0 32px", marginBottom: 0 } as CSSProperties}
          >
            <nav className={boardStyles.crumb}>
              <a href="/dashboard" className={boardStyles.crumbLink}>
                ← Dashboard
              </a>
            </nav>
          </div>
          <nav
            className={boardStyles.subnav}
            style={{ padding: "0 32px", marginBottom: 0 } as CSSProperties}
          >
            <a href={`/projects/${project.id}`} className={boardStyles.subnavLink}>
              Board
            </a>
            <a href={`/projects/${project.id}/fs-board`} className={boardStyles.subnavLink}>
              FS Board
            </a>
            <a href={`/projects/${project.id}/crazy-board`} className={boardStyles.subnavActive}>
              Crazy Space View
            </a>
            <a href={`/projects/${project.id}/dungeon-board`} className={boardStyles.subnavLink}>
              Crazy Dungeon View
            </a>
            <span className={boardStyles.subnavRepo}>{project.githubRepo}</span>
          </nav>
        </div>

        <div className={styles.scene}>
          {/* Stars */}
          {stars.map((s) => (
            <div
              key={s.id}
              className={styles.star}
              style={
                {
                  left: `${s.x}%`,
                  top: `${s.y}%`,
                  width: s.size,
                  height: s.size,
                  opacity: s.opacity,
                } as CSSProperties
              }
            />
          ))}

          {/* Orbit rings */}
          {Object.entries(RING)
            .filter(([state]) => state !== "not-doing" && state !== "done")
            .map(([state, cfg]) => (
              <div
                key={state}
                className={styles.ring}
                style={{ width: cfg.radius * 2, height: cfg.radius * 2 } as CSSProperties}
              />
            ))}

          {/* Ring labels */}
          {(["backlog", "in-progress", "in-review"] as const).map((state) => (
            <div
              key={`lbl-${state}`}
              className={styles.ringLabel}
              style={{ "--ring-r": `${RING[state].radius}px` } as CSSProperties}
              data-state={state}
            >
              {state.replace("-", " ")}
            </div>
          ))}

          {/* Sun */}
          <div className={styles.sun}>
            <div className={styles.sunCore} />
            <span className={styles.sunName}>{project.displayName}</span>
          </div>

          {/* Satellites */}
          {satellites.map(({ ticket, radius, duration, delay, size, color }) => (
            <div
              key={ticket.id}
              className={styles.orbitArm}
              style={{ "--duration": `${duration}s`, "--delay": `${delay}s` } as CSSProperties}
            >
              <button
                type="button"
                className={styles.satellite}
                data-state={ticket.state}
                data-selected={selected?.id === ticket.id}
                style={
                  {
                    "--r": `${radius}px`,
                    "--size": `${size}px`,
                    "--color": color,
                    width: size,
                    height: size,
                  } as CSSProperties
                }
                onClick={() => handleSelectTicket(ticket)}
              />
            </div>
          ))}

          {/* Crew ships */}
          {crew.map((w, i) => {
            const angle = w.angle;
            const duration = SHIP_DURATION + i * 3;
            const delay = -(angle / 360) * duration;
            return (
              <div
                key={w.name}
                className={styles.orbitArm}
                style={{ "--duration": `${duration}s`, "--delay": `${delay}s` } as CSSProperties}
              >
                <div
                  className={styles.ship}
                  style={
                    {
                      "--r": `${SHIP_RADIUS}px`,
                      "--color": w.isBot ? robotColor(w.name) : "var(--accent)",
                    } as CSSProperties
                  }
                >
                  {w.isBot ? (
                    <RobotMascot name={w.name} style={{ width: 20, height: 20 }} />
                  ) : (
                    <HumanMascot style={{ width: 20, height: 20 }} />
                  )}
                  <span className={styles.shipName}>{w.name}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Ticket panel */}
        {selected && (
          <div className={styles.panel}>
            <button type="button" className={styles.panelClose} onClick={() => setSelected(null)}>
              ✕
            </button>
            <div className={styles.panelId}>{selected.hvId}</div>
            <div className={styles.panelTitle}>{selected.title}</div>
            <div className={styles.panelMeta}>
              <span className={styles.panelState} data-state={selected.state}>
                {selected.state}
              </span>
              {selected.frontmatter.Priority && (
                <span className={styles.panelMetaItem}>{selected.frontmatter.Priority}</span>
              )}
              {selected.frontmatter["Assigned to"] && (
                <span className={styles.panelMetaItem}>{selected.frontmatter["Assigned to"]}</span>
              )}
            </div>
            {selected.frontmatter["Feature set"] && (
              <div className={styles.panelFs}>
                {selected.frontmatter["Feature set"].replace("feature-set-", "FS-")}
              </div>
            )}
            <div className={styles.panelBody}>
              {selected.body.slice(0, 600)}
              {selected.body.length > 600 ? "…" : ""}
            </div>

            {selected.state === "in-review" && actionState === "idle" && !rejecting && (
              <div className={styles.panelActions}>
                <button type="button" className={styles.btnAccept} onClick={handleAccept}>
                  ✓ Approve
                </button>
                <button
                  type="button"
                  className={styles.btnReject}
                  onClick={() => setRejecting(true)}
                >
                  ✗ Reject
                </button>
              </div>
            )}
            {selected.state === "in-review" && rejecting && actionState === "idle" && (
              <div className={styles.panelReject}>
                <textarea
                  className={styles.rejectInput}
                  placeholder="Reason for rejection…"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                />
                <div className={styles.panelActions}>
                  <button
                    type="button"
                    className={styles.btnReject}
                    onClick={handleReject}
                    disabled={!rejectReason.trim()}
                  >
                    Confirm Reject
                  </button>
                  <button
                    type="button"
                    className={styles.btnCancel}
                    onClick={() => setRejecting(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {actionState === "loading" && <div className={styles.panelStatus}>Working…</div>}
            {actionState === "done" && (
              <div className={styles.panelStatus} data-ok="true">
                Done — deploy in progress
              </div>
            )}
            {actionState === "error" && (
              <div className={styles.panelStatus} data-ok="false">
                Something went wrong
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        <div className={styles.legend}>
          {[
            { state: "backlog", label: "backlog", color: "#555" },
            { state: "in-progress", label: "in progress", color: "#c4724a" },
            { state: "in-review", label: "in review", color: "#4a9bc4" },
            { state: "done", label: "done", color: "#ffd060" },
            { state: "blocked", label: "blocked", color: "#ff4444" },
          ].map((item) => (
            <div key={item.state} className={styles.legendRow}>
              <span
                className={styles.legendDot}
                style={
                  {
                    background: item.color,
                    boxShadow: `0 0 5px 1px ${item.color}`,
                  } as CSSProperties
                }
              />
              <span className={styles.legendLabel}>{item.label}</span>
            </div>
          ))}
          <div className={styles.legendDivider} />
          <div className={styles.legendHint}>size = priority · color = feature set</div>
        </div>
      </main>
    </div>
  );
}
