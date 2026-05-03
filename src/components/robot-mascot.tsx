import type { CSSProperties } from "react";

export const ROBOT_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export function robotColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  }
  return ROBOT_COLORS[Math.abs(h) % ROBOT_COLORS.length];
}

export function RobotMascot({
  name,
  className,
  style,
}: {
  name?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const color = name ? robotColor(name) : "#22c55e";
  return (
    <svg
      className={className}
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{
        color,
        filter: `drop-shadow(0 0 3px ${color}99)`,
        ...style,
      }}
    >
      <title>{name ?? "bot"}</title>
      <circle cx="9" cy="1" r="1" fill="currentColor" />
      <line
        x1="9"
        y1="1.5"
        x2="9"
        y2="3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <rect x="3" y="3.5" width="12" height="10.5" rx="2" fill="currentColor" />
      <circle cx="6.5" cy="8" r="1.3" fill="var(--bg)" />
      <circle cx="11.5" cy="8" r="1.3" fill="var(--bg)" />
      <rect x="5" y="14" width="2" height="3" fill="currentColor" />
      <rect x="11" y="14" width="2" height="3" fill="currentColor" />
    </svg>
  );
}
