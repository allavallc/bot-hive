"use client";

import { HumanMascot } from "@/components/human-mascot";
import { RobotMascot, robotColor } from "@/components/robot-mascot";
import { Wordmark } from "@/components/wordmark";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import boardStyles from "../board.module.css";
import styles from "./dungeon-board.module.css";

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

// Tile types for dungeon rendering
type TileType = "wall" | "floor" | "door" | "corridor" | "void";

type Room = {
  id: string;
  fsId: string | null;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tickets: Ticket[];
};

type Adventurer = {
  name: string;
  isBot: boolean;
  roomId: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
};

const TILE = 20; // px per grid cell
const GRID_W = 52;
const GRID_H = 36;

// Creature glyphs by state
const STATE_GLYPH: Record<string, string> = {
  backlog: "👾",
  "in-progress": "⚔️",
  "in-review": "🔮",
  done: "💀",
  blocked: "🔒",
  "not-doing": "💨",
};

const STATE_COLOR: Record<string, string> = {
  backlog: "#6b7fa3",
  "in-progress": "#c4724a",
  "in-review": "#4a9bc4",
  done: "#ffd060",
  blocked: "#ff4444",
  "not-doing": "#444",
};

function seededRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = ((s * 1664525 + 1013904223) | 0) >>> 0;
    return s / 0xffffffff;
  };
}

function strHash(str: string): number {
  let h = 0;
  for (const c of str) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

function parseAssignee(raw: string): { name: string; isBot: boolean } | null {
  const t = raw.trim();
  if (!t) return null;
  return { name: t.split(" (")[0].trim(), isBot: t.includes("claude-") };
}

function buildDungeon(
  features: Feature[],
  tickets: Ticket[],
): {
  grid: TileType[][];
  rooms: Room[];
} {
  const grid: TileType[][] = Array.from({ length: GRID_H }, () =>
    Array(GRID_W).fill("void" as TileType),
  );

  const rooms: Room[] = [];
  const rng = seededRng(0xcafebabe);

  // Special rooms
  const specialRooms: { id: string; fsId: null; label: string; minW: number; minH: number }[] = [
    { id: "entrance", fsId: null, label: "ENTRANCE", minW: 5, minH: 4 },
    { id: "throne", fsId: null, label: "THRONE ROOM", minW: 7, minH: 5 },
  ];

  // Layout: place rooms on a grid of slots
  const COLS = 4;
  const slotW = Math.floor((GRID_W - 2) / COLS);
  const allRooms = [
    ...features.map((f) => ({
      id: f.id,
      fsId: f.fsId,
      label: f.fsId.replace("feature-set-", "FS-").toUpperCase(),
      minW: 8,
      minH: 6,
    })),
    ...specialRooms,
  ];

  const rows = Math.ceil(allRooms.length / COLS);
  const slotH = Math.floor((GRID_H - 2) / rows);

  const placedRooms: Room[] = [];

  allRooms.forEach((def, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const slotX = 1 + col * slotW;
    const slotY = 1 + row * slotH;
    const padding = 2;
    const w = Math.min(def.minW + Math.floor(rng() * 3), slotW - padding * 2);
    const h = Math.min(def.minH + Math.floor(rng() * 2), slotH - padding * 2);
    const x = slotX + padding + Math.floor(rng() * Math.max(0, slotW - padding * 2 - w));
    const y = slotY + padding + Math.floor(rng() * Math.max(0, slotH - padding * 2 - h));

    const roomTickets = tickets.filter((t) => t.frontmatter["Feature set"] === def.fsId);

    placedRooms.push({
      id: def.id,
      fsId: def.fsId,
      label: def.label,
      x,
      y,
      w,
      h,
      tickets: roomTickets,
    });

    // Carve floor
    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        if (ry >= 0 && ry < GRID_H && rx >= 0 && rx < GRID_W) {
          grid[ry][rx] = "floor";
        }
      }
    }

    // Walls around room
    for (let ry = y - 1; ry <= y + h; ry++) {
      for (let rx = x - 1; rx <= x + w; rx++) {
        if (ry >= 0 && ry < GRID_H && rx >= 0 && rx < GRID_W) {
          if (grid[ry][rx] === "void") grid[ry][rx] = "wall";
        }
      }
    }
  });

  // Connect adjacent rooms with corridors
  for (let i = 0; i < placedRooms.length - 1; i++) {
    const a = placedRooms[i];
    const b = placedRooms[i + 1];
    const ax = Math.floor(a.x + a.w / 2);
    const ay = Math.floor(a.y + a.h / 2);
    const bx = Math.floor(b.x + b.w / 2);
    const by = Math.floor(b.y + b.h / 2);

    // L-shaped corridor
    for (let cx = Math.min(ax, bx); cx <= Math.max(ax, bx); cx++) {
      if (cx >= 0 && cx < GRID_W && ay >= 0 && ay < GRID_H) {
        if (grid[ay][cx] === "void") grid[ay][cx] = "corridor";
        if (grid[ay][cx] === "wall") grid[ay][cx] = "door";
      }
    }
    for (let cy = Math.min(ay, by); cy <= Math.max(ay, by); cy++) {
      if (bx >= 0 && bx < GRID_W && cy >= 0 && cy < GRID_H) {
        if (grid[cy][bx] === "void") grid[cy][bx] = "corridor";
        if (grid[cy][bx] === "wall") grid[cy][bx] = "door";
      }
    }
  }

  rooms.push(...placedRooms);

  return { grid, rooms };
}

export function DungeonBoard({
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
  const [tick, setTick] = useState(0);
  const mapRef = useRef<HTMLDivElement>(null);

  // Animate adventurers
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1200);
    return () => clearInterval(id);
  }, []);

  const { grid, rooms } = useMemo(() => {
    // Replace throne room label with project name
    const features = [...initialFeatures];
    const result = buildDungeon(features, initialTickets);
    // patch throne label
    const throne = result.rooms.find((r) => r.id === "throne");
    if (throne) throne.label = project.displayName.toUpperCase();
    return result;
  }, [initialFeatures, initialTickets, project.displayName]);

  const adventurers = useMemo((): Adventurer[] => {
    const seen = new Map<string, Adventurer>();
    for (const t of initialTickets) {
      if (t.state !== "in-progress" && t.state !== "in-review") continue;
      const a = parseAssignee(t.frontmatter["Assigned to"] ?? "");
      if (!a || seen.has(a.name)) continue;
      const fsId = t.frontmatter["Feature set"];
      const room = rooms.find((r) => r.fsId === fsId) ?? rooms[0];
      if (!room) continue;
      const rng = seededRng(strHash(a.name + tick));
      const x = room.x + 1 + Math.floor(rng() * Math.max(1, room.w - 2));
      const y = room.y + 1 + Math.floor(rng() * Math.max(1, room.h - 2));
      const tx = room.x + 1 + Math.floor(rng() * Math.max(1, room.w - 2));
      const ty = room.y + 1 + Math.floor(rng() * Math.max(1, room.h - 2));
      seen.set(a.name, {
        name: a.name,
        isBot: a.isBot,
        roomId: room.id,
        x,
        y,
        targetX: tx,
        targetY: ty,
      });
    }
    return [...seen.values()];
  }, [initialTickets, rooms, tick]);

  // Creature positions: one per ticket, inside its feature set's room
  const creatures = useMemo(() => {
    return initialTickets
      .map((t, i) => {
        const fsId = t.frontmatter["Feature set"];
        const room = rooms.find((r) => r.fsId === fsId);
        if (!room) return null;
        const rng = seededRng(strHash(t.hvId) * 31 + i);
        // spread inside the room, avoid edges
        const cx = room.x + 1 + Math.floor(rng() * Math.max(1, room.w - 2));
        const cy = room.y + 1 + Math.floor(rng() * Math.max(1, room.h - 2));
        return { ticket: t, cx, cy };
      })
      .filter(Boolean) as { ticket: Ticket; cx: number; cy: number }[];
  }, [initialTickets, rooms]);

  function handleSelectTicket(t: Ticket) {
    setSelected(t);
    setRejecting(false);
    setRejectReason("");
    setActionState("idle");
  }

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

  const TILE_PX = TILE;
  const mapW = GRID_W * TILE_PX;
  const mapH = GRID_H * TILE_PX;

  return (
    <div className={boardStyles.root}>
      <header className={boardStyles.masthead}>
        <Link href="/" className={boardStyles.brand} aria-label="Bot Hive">
          <Wordmark height={28} />
        </Link>
      </header>

      <main className={boardStyles.main} style={{ padding: 0 } as CSSProperties}>
        {/* Top bar */}
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
            <a href={`/projects/${project.id}/crazy-board`} className={boardStyles.subnavLink}>
              Crazy Space View
            </a>
            <a href={`/projects/${project.id}/dungeon-board`} className={boardStyles.subnavActive}>
              Crazy Dungeon View
            </a>
            <span className={boardStyles.subnavRepo}>{project.githubRepo}</span>
          </nav>
        </div>

        <div className={styles.dungeonWrap}>
          {/* Scrollable dungeon map */}
          <div className={styles.mapScroll}>
            <div
              ref={mapRef}
              className={styles.map}
              style={{ width: mapW, height: mapH } as CSSProperties}
            >
              {/* Tile grid — key uses coordinate string, not array index */}
              {grid.flatMap((row, gy) =>
                row.map((tile, gx) => {
                  if (tile === "void") return null;
                  const tileKey = `t${gx}x${gy}`;
                  return (
                    <div
                      key={tileKey}
                      className={styles.tile}
                      data-type={tile}
                      style={
                        {
                          left: gx * TILE_PX,
                          top: gy * TILE_PX,
                          width: TILE_PX,
                          height: TILE_PX,
                        } as CSSProperties
                      }
                    />
                  );
                }),
              )}

              {/* Room labels */}
              {rooms.map((room) => (
                <div
                  key={`lbl-${room.id}`}
                  className={styles.roomLabel}
                  style={
                    {
                      left: room.x * TILE_PX,
                      top: room.y * TILE_PX,
                      width: room.w * TILE_PX,
                    } as CSSProperties
                  }
                >
                  {room.label}
                </div>
              ))}

              {/* Creatures (tickets) */}
              {creatures.map(({ ticket, cx, cy }) => {
                const glyph = STATE_GLYPH[ticket.state] ?? "❓";
                const color = STATE_COLOR[ticket.state] ?? "#888";
                const isSelected = selected?.id === ticket.id;
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    className={styles.creature}
                    data-state={ticket.state}
                    data-selected={isSelected}
                    style={
                      {
                        left: cx * TILE_PX + TILE_PX / 2,
                        top: cy * TILE_PX + TILE_PX / 2,
                        "--creature-color": color,
                      } as CSSProperties
                    }
                    onClick={() => handleSelectTicket(ticket)}
                    title={`${ticket.hvId}: ${ticket.title}`}
                  >
                    {glyph}
                  </button>
                );
              })}

              {/* Adventurers */}
              {adventurers.map((adv) => (
                <div
                  key={adv.name}
                  className={styles.adventurer}
                  style={
                    {
                      left: adv.x * TILE_PX + TILE_PX / 2,
                      top: adv.y * TILE_PX + TILE_PX / 2,
                      "--adv-color": adv.isBot ? robotColor(adv.name) : "var(--accent)",
                    } as CSSProperties
                  }
                >
                  <div className={styles.advSprite}>
                    {adv.isBot ? (
                      <RobotMascot name={adv.name} style={{ width: 16, height: 16 }} />
                    ) : (
                      <HumanMascot style={{ width: 16, height: 16 }} />
                    )}
                  </div>
                  <span className={styles.advName}>{adv.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Side panel */}
          {selected && (
            <div className={styles.panel}>
              <button type="button" className={styles.panelClose} onClick={() => setSelected(null)}>
                ✕
              </button>
              <div className={styles.panelId}>{selected.hvId}</div>
              <div className={styles.panelGlyph}>{STATE_GLYPH[selected.state] ?? "❓"}</div>
              <div className={styles.panelTitle}>{selected.title}</div>
              <div className={styles.panelMeta}>
                <span className={styles.panelState} data-state={selected.state}>
                  {selected.state}
                </span>
                {selected.frontmatter.Priority && (
                  <span className={styles.panelMetaItem}>{selected.frontmatter.Priority}</span>
                )}
                {selected.frontmatter["Assigned to"] && (
                  <span className={styles.panelMetaItem}>
                    {selected.frontmatter["Assigned to"]}
                  </span>
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
        </div>

        {/* Legend */}
        <div className={styles.legend}>
          {Object.entries(STATE_GLYPH).map(([state, glyph]) => (
            <div key={state} className={styles.legendRow}>
              <span className={styles.legendGlyph}>{glyph}</span>
              <span
                className={styles.legendLabel}
                style={{ color: STATE_COLOR[state] } as CSSProperties}
              >
                {state.replace("-", " ")}
              </span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
