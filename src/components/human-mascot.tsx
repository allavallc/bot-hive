import type { CSSProperties } from "react";

// Walking-human mascot — used on in-review cards to signal "this needs your
// attention." Mirrors the WalkingRobot pattern, but in a single accent color
// (humans aren't differentiated by handle the way bots are).
export function HumanMascot({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  const color = "var(--accent)";
  return (
    <svg
      className={className}
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{
        color,
        filter: "drop-shadow(0 0 3px rgba(196, 114, 74, 0.6))",
        ...style,
      }}
    >
      <title>human attention needed</title>
      <circle cx="9" cy="3" r="2" fill="currentColor" />
      <line
        x1="9"
        y1="5.5"
        x2="9"
        y2="11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="9"
        y1="7"
        x2="5.5"
        y2="9.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <line
        x1="9"
        y1="7"
        x2="12.5"
        y2="9.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <line
        x1="9"
        y1="11"
        x2="6.5"
        y2="16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="9"
        y1="11"
        x2="11.5"
        y2="16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
