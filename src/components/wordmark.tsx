export function Wordmark({ height = 36 }: { height?: number }) {
  return (
    <svg
      width={(height * 760) / 220}
      height={height}
      viewBox="0 0 760 220"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Bot Hive"
    >
      <title>Bot Hive</title>
      <defs>
        <g id="bee">
          <path
            d="M -13,-15 L 0,-7 L -9,-3 Z"
            fill="#FFFFFF"
            stroke="#1A1F2E"
            strokeWidth="1.5"
            strokeLinejoin="round"
            opacity="0.95"
          />
          <path
            d="M 11,-15 L -2,-7 L 7,-3 Z"
            fill="#FFFFFF"
            stroke="#1A1F2E"
            strokeWidth="1.5"
            strokeLinejoin="round"
            opacity="0.95"
          />
          <rect x="-19" y="-7" width="34" height="14" rx="3" fill="#1A1F2E" />
          <rect x="-12" y="-7" width="3" height="14" fill="#F4B941" />
          <rect x="-5" y="-7" width="3" height="14" fill="#F4B941" />
          <rect x="2" y="-7" width="3" height="14" fill="#F4B941" />
          <rect x="13" y="-5" width="6" height="10" rx="2" fill="#1A1F2E" />
          <circle cx="16" cy="0" r="2.5" fill="#0FA3B1" />
          <line
            x1="14"
            y1="-5"
            x2="12"
            y2="-13"
            stroke="#1A1F2E"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <line
            x1="18"
            y1="-5"
            x2="19"
            y2="-13"
            stroke="#1A1F2E"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="12" cy="-13" r="1.8" fill="#0FA3B1" />
          <circle cx="19" cy="-13" r="1.8" fill="#0FA3B1" />
        </g>
      </defs>

      {/* B */}
      <g transform="translate(30 30)" fill="currentColor">
        <path
          d="M 0 0 L 50 0 C 70 0 84 14 84 35 C 84 56 70 70 50 70 C 70 70 92 84 92 105 C 92 126 76 140 50 140 L 0 140 Z M 22 22 L 46 22 C 54 22 62 28 62 36 C 62 46 54 54 46 54 L 22 54 Z M 22 86 L 50 86 C 60 86 70 94 70 106 C 70 118 60 122 50 122 L 22 122 Z"
          fillRule="evenodd"
        />
      </g>

      {/* O = hive with bees */}
      <g transform="translate(195 100)">
        <polygon
          points="0,-80 69.3,-40 69.3,40 0,80 -69.3,40 -69.3,-40"
          fill="#F4B941"
          stroke="#1A1F2E"
          strokeWidth="6"
          strokeLinejoin="round"
        />
        <use href="#bee" transform="translate(0 -40)" />
        <use href="#bee" transform="translate(-25 25)" />
        <use href="#bee" transform="translate(25 25)" />
      </g>

      {/* T */}
      <g transform="translate(280 30)" fill="currentColor">
        <rect x="0" y="0" width="86" height="24" />
        <rect x="31" y="0" width="24" height="140" />
      </g>

      {/* H */}
      <g transform="translate(405 30)" fill="currentColor">
        <rect x="0" y="0" width="24" height="140" />
        <rect x="68" y="0" width="24" height="140" />
        <rect x="0" y="58" width="92" height="24" />
      </g>

      {/* I */}
      <g transform="translate(510 30)" fill="currentColor">
        <rect x="0" y="0" width="24" height="140" />
      </g>

      {/* V */}
      <g transform="translate(545 30)" fill="currentColor">
        <path d="M 0 0 L 24 0 L 45 105 L 66 0 L 90 0 L 57 140 L 33 140 Z" />
      </g>

      {/* E */}
      <g transform="translate(645 30)" fill="currentColor">
        <rect x="0" y="0" width="24" height="140" />
        <rect x="0" y="0" width="78" height="24" />
        <rect x="0" y="58" width="64" height="24" />
        <rect x="0" y="116" width="78" height="24" />
      </g>
    </svg>
  );
}
