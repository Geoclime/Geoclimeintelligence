import "./BrandMark.css";

interface BrandMarkProps {
  /** "light" for use on the deep-teal brand panel. */
  variant?: "default" | "light";
  showName?: boolean;
}

/** Logo: two contour lines (terrain, water level) and a survey point. Mirrors public/favicon.svg. */
export function BrandMark({ variant = "default", showName = true }: BrandMarkProps) {
  return (
    <span className={`brand-mark brand-mark--${variant}`}>
      <svg className="brand-mark__logo" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <rect width="32" height="32" rx="8" fill="#063C3E" />
        <path
          d="M6 20c3-1 5-4 8-4s4 3 7 3 4-2 5-3"
          fill="none"
          stroke="#5CC6C9"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M6 14c3-1 5-4 8-4s4 3 7 3 4-2 5-3"
          fill="none"
          stroke="#fff"
          strokeOpacity=".55"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="21" cy="24" r="2.2" fill="#fff" />
      </svg>
      {showName ? (
        <span className="brand-mark__name">
          GeoClime <span className="brand-mark__name-accent">Intelligence</span>
        </span>
      ) : (
        <span className="visually-hidden">GeoClime Intelligence</span>
      )}
    </span>
  );
}
