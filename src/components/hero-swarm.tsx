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

      <div className={styles.dock}>
        <span className={styles.dockPile} />
      </div>

      {SWARM.map((bot) => (
        <div key={bot.name} className={`${styles.carrier} ${styles[bot.botClass]}`}>
          <RobotMascot name={bot.name} className={styles.carrierMascot} />
          <span className={`${styles.crate} ${styles[bot.crateClass]}`} aria-hidden="true" />
        </div>
      ))}

      <div className={styles.worker}>
        <RobotMascot name="boss" className={styles.workerMascot} />
        <span className={styles.workerCrate} aria-hidden="true" />
      </div>
    </div>
  );
}
