/**
 * Inline SVG version of the Heizen mark — sourced verbatim from
 * dev-tools' /images/logo.svg. Embedding it as JSX means there's no
 * file-path/dev-server/cache failure mode; the SVG ships inside the
 * JS bundle and renders on first paint.
 *
 * Pass any className to style size + border-radius (the SVG fills its
 * box, so width/height come from CSS not from attributes).
 */
export function HeizenMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 999 1374"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      role="img"
      aria-label="Heizen"
      className={className}
    >
      <path
        d="M264.279 734.197L265.914 732.562V1092.53L264.279 1094.16V1108.97L0 1373.25V270.023H264.279V734.197ZM999.001 1094.55H740.008V752.004H740.075V258.926L999.001 0V1094.55ZM678.047 680.394L329.538 1028.9V668.938L678.047 320.43V680.394Z"
        fill="url(#heizenMarkGradient)"
      />
      <defs>
        <linearGradient
          id="heizenMarkGradient"
          x1="499.501"
          y1="35.6961"
          x2="499.501"
          y2="1623.12"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#D9D9D9" />
          <stop offset="1" stopColor="#737373" />
        </linearGradient>
      </defs>
    </svg>
  );
}
