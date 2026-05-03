import { RobotMascot } from "@/components/robot-mascot";
import styles from "./hero-swarm.module.css";

const SWARM = [
  { name: "claude", floatClass: "float1" },
  { name: "sarah", floatClass: "float2" },
  { name: "alex", floatClass: "float3" },
  { name: "rin", floatClass: "float4" },
  { name: "kim", floatClass: "float5" },
] as const;

export function HeroSwarm() {
  return (
    <div className={styles.swarm} aria-hidden="true">
      {SWARM.map((bot) => (
        <RobotMascot
          key={bot.name}
          name={bot.name}
          className={`${styles.bot} ${styles[bot.floatClass]}`}
        />
      ))}
      <div className={styles.crosserTrack}>
        <div className={styles.crosserBot}>
          <RobotMascot name="jess" className={styles.crosserMascot} />
          <span className={styles.crate} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
