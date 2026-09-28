/**
 * Decorative topographic contour lines for the sign-in brand panel. Generated once from a few
 * sine waves (deterministic, no randomness), so it renders identically on every visit.
 */

function contourRing(cx: number, cy: number, radius: number, phase: number): string {
  const steps = 72;
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const wobble = 1 + 0.09 * Math.sin(3 * angle + phase) + 0.05 * Math.sin(5 * angle - phase * 0.7);
    const x = cx + radius * wobble * Math.cos(angle);
    const y = cy + radius * 0.78 * wobble * Math.sin(angle);
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `M${points.join("L")}Z`;
}

function contourField(cx: number, cy: number, rings: number, gap: number, seed: number): string[] {
  return Array.from({ length: rings }, (_, i) => contourRing(cx, cy, 26 + i * gap, seed + i * 0.35));
}

const RINGS = [...contourField(470, 160, 11, 30, 0.4), ...contourField(90, 640, 9, 34, 2.1)];

// A meandering river across the lower third, echoing the Niger Delta's creeks.
const RIVER =
  "M-20,520 C60,500 110,560 190,540 S300,470 380,500 S500,590 600,560 S700,500 760,520";

export function ContourBackdrop() {
  return (
    <svg
      className="contour-backdrop"
      viewBox="0 0 640 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      {RINGS.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="currentColor" strokeOpacity={i % 4 === 0 ? 0.22 : 0.1} />
      ))}
      <path d={RIVER} fill="none" stroke="#5CC6C9" strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" />
      <path d={RIVER} fill="none" stroke="#5CC6C9" strokeOpacity="0.15" strokeWidth="14" strokeLinecap="round" />
    </svg>
  );
}
