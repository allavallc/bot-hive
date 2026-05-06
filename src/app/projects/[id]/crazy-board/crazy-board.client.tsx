"use client";

import { HumanMascot } from "@/components/human-mascot";
import { RobotMascot, robotColor } from "@/components/robot-mascot";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import styles from "./crazy-board.module.css";

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

const ORBITS: Record<string, { radius: number; baseDuration: number }> = {
  "in-review": { radius: 130, baseDuration: 28 },
  "in-progress": { radius: 215, baseDuration: 50 },
  backlog: { radius: 310, baseDuration: 85 },
  blocked: { radius: 400, baseDuration: 160 },
  done: { radius: 72, baseDuration: 140 },
  "not-doing": { radius: 470, baseDuration: 240 },
};

const PRIORITY_SIZE: Record<string, number> = {
  Critical: 17,
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

function hvHash(hvId: string): number {
  let h = 0;
  for (const c of hvId) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
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
  const [hovered, setHovered] = useState<Ticket | null>(null);

  const stars = useMemo(() => generateStars(220), []);

  const fsColorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of initialFeatures) m.set(f.fsId, fsColor(f.fsId));
    return m;
  }, [initialFeatures]);

  const satellites = useMemo(
    () =>
      initialTickets.map((t) => {
        const cfg = ORBITS[t.state] ?? ORBITS.backlog;
        const hash = hvHash(t.hvId);
        const startAngle = hash % 360;
        const factor = 0.8 + (hash % 100) / 250;
        const duration = cfg.baseDuration * factor;
        const delay = -(startAngle / 360) * duration;
        const size = PRIORITY_SIZE[t.frontmatter.Priority ?? ""] ?? 8;
        const color = fsColorMap.get(t.frontmatter["Feature set"] ?? "") ?? "#666";
        return { ticket: t, radius: cfg.radius, duration, delay, size, color };
      }),
    [initialTickets, fsColorMap],
  );

  const crew = useMemo(() => {
    const seen = new Map<string, { name: string; isBot: boolean }>();
    for (const t of initialTickets) {
      if (t.state !== "in-progress" && t.state !== "in-review") continue;
      const a = parseAssignee(t.frontmatter["Assigned to"] ?? "");
      if (a && !seen.has(a.name)) seen.set(a.name, a);
    }
    return [...seen.values()];
  }, [initialTickets]);

  return (
    <div className={styles.root}>
      <nav className={styles.nav}>
        <a href="/dashboard" className={styles.navBack}>
          ← Dashboard
        </a>
        <div className={styles.navLinks}>
          <a href={`/projects/${project.id}`} className={styles.navLink}>
            Board
          </a>
          <a href={`/projects/${project.id}/fs-board`} className={styles.navLink}>
            FS Board
          </a>
          <a href={`/projects/${project.id}/crazy-board`} className={styles.navActive}>
            Crazy Creative View
          </a>
        </div>
        <span className={styles.navRepo}>{project.githubRepo}</span>
      </nav>

      <div className={styles.scene}>
        {/* Starfield */}
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
        {Object.entries(ORBITS)
          .filter(([state]) => state !== "done" && state !== "not-doing")
          .map(([state, cfg]) => (
            <div
              key={state}
              className={styles.ring}
              style={{ width: cfg.radius * 2, height: cfg.radius * 2 } as CSSProperties}
            />
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
              style={
                {
                  "--r": `${radius}px`,
                  "--size": `${size}px`,
                  "--color": color,
                  width: size,
                  height: size,
                } as CSSProperties
              }
              onMouseEnter={() => setHovered(ticket)}
              onMouseLeave={() => setHovered(null)}
            />
          </div>
        ))}

        {/* Crew ships in outer orbit */}
        {crew.map((w, i) => (
          <div
            key={w.name}
            className={styles.orbitArm}
            style={
              {
                "--duration": `${175 + i * 30}s`,
                "--delay": `${-i * 44}s`,
              } as CSSProperties
            }
          >
            <div
              className={styles.ship}
              style={
                {
                  "--r": "520px",
                  "--color": w.isBot ? robotColor(w.name) : "var(--accent)",
                } as CSSProperties
              }
            >
              {w.isBot ? (
                <RobotMascot name={w.name} style={{ width: 18, height: 18 }} />
              ) : (
                <HumanMascot style={{ width: 18, height: 18 }} />
              )}
              <span className={styles.shipName}>{w.name}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Hover HUD */}
      {hovered && (
        <div className={styles.hud}>
          <div className={styles.hudId}>{hovered.hvId}</div>
          <div className={styles.hudTitle}>{hovered.title}</div>
          <div className={styles.hudState} data-state={hovered.state}>
            {hovered.state}
          </div>
          {hovered.frontmatter["Assigned to"] && (
            <div className={styles.hudMeta}>{hovered.frontmatter["Assigned to"]}</div>
          )}
          {hovered.frontmatter.Priority && (
            <div className={styles.hudMeta}>{hovered.frontmatter.Priority} priority</div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className={styles.legend}>
        {[
          { state: "done", label: "done", color: "#ffd060" },
          { state: "in-review", label: "in review", color: "#4a9bc4" },
          { state: "in-progress", label: "in progress", color: "#c4724a" },
          { state: "backlog", label: "backlog", color: "#555" },
          { state: "blocked", label: "blocked", color: "#ff4444" },
        ].map((item) => (
          <div key={item.state} className={styles.legendRow}>
            <span
              className={styles.legendDot}
              style={
                { background: item.color, boxShadow: `0 0 5px 1px ${item.color}` } as CSSProperties
              }
            />
            <span className={styles.legendLabel}>{item.label}</span>
          </div>
        ))}
        <div className={styles.legendDivider} />
        <div className={styles.legendRow}>
          <span className={styles.legendHint}>dot size = priority</span>
        </div>
        <div className={styles.legendRow}>
          <span className={styles.legendHint}>dot color = feature set</span>
        </div>
      </div>
    </div>
  );
}
