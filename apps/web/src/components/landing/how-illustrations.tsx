/**
 * Small inline drawings of the real editor for "how it works": the prompt
 * box with dropped clips, the live preview with cuts and captions, and the
 * timeline being trimmed before a 1080p export. Pure SVG + CSS (no JS);
 * the gentle loops stop under prefers-reduced-motion (landing.css).
 */
const frame = {
  viewBox: '0 0 320 200',
  role: 'img' as const,
  className: 'how-art',
};

export function SayItArt() {
  return (
    <svg {...frame} aria-label="a prompt box with three clips dropped in">
      <rect
        className="how-panel"
        x="24"
        y="34"
        width="272"
        height="132"
        rx="14"
      />
      <g className="how-drop">
        <rect
          className="how-chip"
          x="40"
          y="48"
          width="58"
          height="34"
          rx="6"
        />
        <rect
          className="how-chip-art how-tone-a"
          x="44"
          y="52"
          width="22"
          height="26"
          rx="3"
        />
        <rect
          className="how-line-soft"
          x="70"
          y="58"
          width="22"
          height="4"
          rx="2"
        />
        <rect
          className="how-line-faint"
          x="70"
          y="67"
          width="14"
          height="4"
          rx="2"
        />
      </g>
      <g className="how-drop how-drop-2">
        <rect
          className="how-chip"
          x="104"
          y="48"
          width="58"
          height="34"
          rx="6"
        />
        <rect
          className="how-chip-art how-tone-b"
          x="108"
          y="52"
          width="22"
          height="26"
          rx="3"
        />
        <rect
          className="how-line-soft"
          x="134"
          y="58"
          width="22"
          height="4"
          rx="2"
        />
        <rect
          className="how-line-faint"
          x="134"
          y="67"
          width="14"
          height="4"
          rx="2"
        />
      </g>
      <g className="how-drop how-drop-3">
        <rect
          className="how-chip"
          x="168"
          y="48"
          width="58"
          height="34"
          rx="6"
        />
        <rect
          className="how-chip-art how-tone-c"
          x="172"
          y="52"
          width="22"
          height="26"
          rx="3"
        />
        <rect
          className="how-line-soft"
          x="198"
          y="58"
          width="22"
          height="4"
          rx="2"
        />
        <rect
          className="how-line-faint"
          x="198"
          y="67"
          width="14"
          height="4"
          rx="2"
        />
      </g>
      <text className="how-text" x="40" y="108">
        a 30 second reel of my trip,
      </text>
      <text className="how-text" x="40" y="124">
        upbeat, with captions
        <tspan className="how-caret">|</tspan>
      </text>
      <rect
        className="how-line-faint"
        x="40"
        y="144"
        width="40"
        height="10"
        rx="5"
      />
      <rect
        className="how-line-faint"
        x="86"
        y="144"
        width="28"
        height="10"
        rx="5"
      />
      <circle className="how-accent" cx="272" cy="149" r="11" />
      <path className="how-on-accent" d="M268 149h8m-3.5-4 4 4-4 4" />
    </svg>
  );
}

export function WatchItArt() {
  return (
    <svg
      {...frame}
      aria-label="the live preview with a cut and captions appearing"
    >
      <rect
        className="how-panel"
        x="24"
        y="18"
        width="272"
        height="122"
        rx="12"
      />
      <g className="how-scene">
        <rect
          className="how-sky"
          x="32"
          y="26"
          width="256"
          height="106"
          rx="6"
        />
        <path className="how-tone-a" d="M32 132 98 70l44 40 36-30 110 52Z" />
        <circle className="how-sun" cx="236" cy="56" r="12" />
      </g>
      <rect
        className="how-cut-flash"
        x="32"
        y="26"
        width="256"
        height="106"
        rx="6"
      />
      <g className="how-caption">
        <rect
          className="how-caption-box"
          x="98"
          y="104"
          width="124"
          height="20"
          rx="4"
        />
        <text className="how-caption-text" x="160" y="118" textAnchor="middle">
          <tspan className="how-word how-word-1">the </tspan>
          <tspan className="how-word how-word-2">view </tspan>
          <tspan className="how-word how-word-3">up here</tspan>
        </text>
      </g>
      <rect
        className="how-track"
        x="24"
        y="152"
        width="272"
        height="26"
        rx="6"
      />
      <rect
        className="how-clip how-tone-a"
        x="28"
        y="156"
        width="84"
        height="18"
        rx="4"
      />
      <rect
        className="how-clip how-tone-b"
        x="114"
        y="156"
        width="70"
        height="18"
        rx="4"
      />
      <rect
        className="how-clip how-tone-c"
        x="186"
        y="156"
        width="106"
        height="18"
        rx="4"
      />
      <g className="how-playhead">
        <rect className="how-accent" x="0" y="148" width="2" height="34" />
        <path className="how-accent" d="M-4 146h10l-5 5Z" />
      </g>
    </svg>
  );
}

export function SteerItArt() {
  return (
    <svg
      {...frame}
      aria-label="the timeline being trimmed, then a 1080p export"
    >
      <rect
        className="how-panel"
        x="16"
        y="22"
        width="288"
        height="112"
        rx="12"
      />
      <rect className="how-line-faint" x="28" y="34" width="264" height="1" />
      <text className="how-mono" x="30" y="48">
        00:00
      </text>
      <text className="how-mono" x="150" y="48">
        00:10
      </text>
      <text className="how-mono" x="262" y="48">
        00:20
      </text>
      <rect
        className="how-clip how-tone-d"
        x="28"
        y="56"
        width="120"
        height="16"
        rx="4"
      />
      <rect
        className="how-clip how-tone-a"
        x="28"
        y="78"
        width="96"
        height="22"
        rx="4"
      />
      <rect
        className="how-clip how-tone-b how-trim"
        x="126"
        y="78"
        width="88"
        height="22"
        rx="4"
      />
      <rect
        className="how-clip how-tone-c"
        x="28"
        y="106"
        width="232"
        height="16"
        rx="4"
      />
      <rect
        className="how-handle how-trim-handle"
        x="210"
        y="76"
        width="4"
        height="26"
        rx="2"
      />
      <g className="how-playhead-static">
        <rect className="how-accent" x="96" y="52" width="2" height="74" />
      </g>
      <g className="how-export">
        <rect
          className="how-button"
          x="168"
          y="148"
          width="128"
          height="32"
          rx="8"
        />
        <text className="how-text" x="186" y="168">
          export 1080p
        </text>
        <path className="how-check" d="M272 163l4 4 8-9" />
      </g>
      <rect
        className="how-progress"
        x="24"
        y="162"
        width="128"
        height="4"
        rx="2"
      />
      <rect
        className="how-progress-fill"
        x="24"
        y="162"
        width="128"
        height="4"
        rx="2"
      />
    </svg>
  );
}
