import type { Country } from "../../types/country.types";
import { Button } from "../shared/Button";
import { Icon } from "../shared/Icon";

/** A level can be imported once the level above it has live areas (level 1 has no parent). */
export function levelAvailable(country: Country, level: number): boolean {
  return level === 1 || (country.levels[level - 2]?.unitCount ?? 0) > 0;
}

/** The first level with nothing live that can be imported now, or null when every level has areas. */
export function nextLevel(country: Country): number | null {
  return country.levels.find((l) => l.unitCount === 0 && levelAvailable(country, l.level))?.level ?? null;
}

interface ImportGuideProps {
  country: Country | null;
  level: number;
  onPickLevel: (level: number) => void;
}

/**
 * "Where am I?": the whole flow in four steps before a country is chosen, then the country's
 * levels top-down (State, then LGA, then Ward) with what's live, what's next and what must wait.
 */
export function ImportGuide({ country, level, onPickLevel }: ImportGuideProps) {
  if (!country) {
    return (
      <section className="card card__body import-guide" aria-label="How importing works" data-cy="import-guide">
        <h2 className="import-guide__title">How importing works</h2>
        <ol className="import-guide__how">
          <li>Choose the country, the level and who published the data.</li>
          <li>Upload the file and tell us which columns hold the name, parent and shape.</li>
          <li>Check it: every row is checked, and nothing goes live yet.</li>
          <li>Review the results and the map, then press Promote to make the rows that passed live.</li>
        </ol>
        <p className="muted">Import levels from the top down: the largest areas first (e.g. States), then the areas inside them.</p>
      </section>
    );
  }

  const next = nextLevel(country);
  return (
    <section className="card card__body import-guide" aria-label={`Import progress for ${country.countryName}`} data-cy="import-guide">
      <h2 className="import-guide__title">{country.countryName}: import one level at a time, top down</h2>
      <ol className="import-guide__levels">
        {country.levels.map((l) => {
          const parent = country.levels[l.level - 2];
          const state = l.unitCount > 0 ? "done" : !levelAvailable(country, l.level) ? "locked" : "next";
          return (
            <li key={l.level} className={`import-guide__level import-guide__level--${state}`} aria-current={l.level === level ? "step" : undefined} data-cy={`guide-level-${l.level}`}>
              <span className="import-guide__marker" aria-hidden="true">
                {state === "done" ? <Icon name="check" size={14} /> : l.level}
              </span>
              <span className="import-guide__text">
                <strong>{l.name}</strong>
                <span className="muted">
                  {state === "done" && `${l.unitCount} live`}
                  {state === "next" && (l.level === next ? "Next to import" : "Ready to import")}
                  {state === "locked" && `Import the ${parent?.name ?? "level above"} areas first`}
                </span>
              </span>
              {state !== "locked" && l.level !== level && (
                <Button variant="ghost" size="sm" onClick={() => onPickLevel(l.level)}>
                  {state === "done" ? "Add more" : "Import"}
                </Button>
              )}
            </li>
          );
        })}
      </ol>
      {next === null && <p className="muted">Every level has live areas. Import again only to add areas that are missing.</p>}
    </section>
  );
}
