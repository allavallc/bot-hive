import { RobotMascot } from "@/components/robot-mascot";
import styles from "./hero-swarm.module.css";

const SWARM = [
  { name: "claude", botClass: "bot1", crateClass: "crate1" },
  { name: "sarah", botClass: "bot2", crateClass: "crate2" },
  { name: "alex", botClass: "bot3", crateClass: "crate3" },
  { name: "rin", botClass: "bot4", crateClass: "crate4" },
  { name: "kim", botClass: "bot5", crateClass: "crate5" },
  { name: "jess", botClass: "bot6", crateClass: "crate6" },
] as const;

const BACKLOG_CRATES = [
  { top: "8%", left: "6%" },
  { top: "18%", left: "22%" },
  { top: "32%", left: "10%" },
  { top: "44%", left: "20%" },
  { top: "56%", left: "8%" },
  { top: "68%", left: "24%" },
  { top: "82%", left: "14%" },
  { top: "92%", left: "4%" },
] as const;

const DONE_SHELF = [
  { row: 0, col: 0, delayClass: "shelf1" },
  { row: 0, col: 1, delayClass: "shelf2" },
  { row: 0, col: 2, delayClass: "shelf3" },
  { row: 1, col: 0, delayClass: "shelf4" },
  { row: 1, col: 1, delayClass: "shelf5" },
  { row: 1, col: 2, delayClass: "shelf6" },
] as const;

export function HeroSwarm() {
  return (
    <div className={styles.swarm} aria-hidden="true">
      <div className={styles.columns}>
        <div className={styles.column}>
          <span className={styles.columnLabel}>Backlog</span>
        </div>
        <div className={styles.column}>
          <span className={styles.columnLabel}>In progress</span>
        </div>
        <div className={styles.column}>
          <span className={styles.columnLabel}>Done</span>
        </div>
      </div>

      {/* Backlog supply — static crates waiting to be picked up */}
      {BACKLOG_CRATES.map((c) => (
        <span
          key={`${c.top}-${c.left}`}
          className={styles.backlogCrate}
          style={{ top: c.top, left: c.left }}
        />
      ))}

      {/* Done shelf — crates accumulate here */}
      <div className={styles.doneShelf}>
        {DONE_SHELF.map((c) => (
          <span
            key={`done-${c.row}-${c.col}`}
            className={`${styles.shelfCrate} ${styles[c.delayClass]}`}
            style={{
              gridRow: c.row + 1,
              gridColumn: c.col + 1,
            }}
          />
        ))}
      </div>

      {/* In-progress carriers — bots traversing left to right with crates */}
      {SWARM.map((bot) => (
        <div key={bot.name} className={`${styles.carrier} ${styles[bot.botClass]}`}>
          <RobotMascot name={bot.name} className={styles.carrierMascot} />
          <span className={`${styles.crate} ${styles[bot.crateClass]}`} aria-hidden="true" />
        </div>
      ))}

      {/* Worker — comes from off-page right, takes a crate, leaves off-page right */}
      <div className={styles.worker}>
        <RobotMascot name="boss" className={styles.workerMascot} />
        <span className={styles.workerCrate} aria-hidden="true" />
      </div>
    </div>
  );
}
