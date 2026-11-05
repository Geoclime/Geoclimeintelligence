import { useId, useState } from "react";
import { useDebounce } from "../../hooks/useDebounce";
import { useGeolocation } from "../../hooks/useGeolocation";
import { useLocatePoint } from "../../hooks/useLocatePoint";
import { MIN_SEARCH_LENGTH, usePublicSearch } from "../../hooks/usePublicSearch";
import type { LocateResult, LonLat } from "../../types/admin-unit.types";
import { Button } from "../shared/Button";
import { Icon, type IconName } from "../shared/Icon";
import { Spinner } from "../shared/Spinner";
import { PlaceSummary } from "./PlaceSummary";

/** What the finder is showing: an area, why (a community or location inside it), and where to pin. */
export interface PlaceSelection {
  areaId: string;
  note: string | null;
  marker: LonLat | null;
}

interface Option {
  key: string;
  icon: IconName;
  title: string;
  detail: string;
  choose: () => void;
}

interface PlaceFinderProps {
  selection: PlaceSelection | null;
  onSelect: (selection: PlaceSelection) => void;
  signedIn: boolean;
}

/** "Rumuche is in Emohua LGA, Ward 4." from a located point; null when no LGA contains it. */
function describe(subject: string, result: LocateResult): { lgaId: string; note: string } | null {
  const lga = result.units.find((u) => u.level === 2);
  if (!lga) return null;
  const ward = result.units.find((u) => u.level === 3);
  return { lgaId: lga.id, note: `${subject} is in ${lga.unitName} ${lga.levelName}${ward ? `, ${ward.unitName} ${ward.levelName.toLowerCase()}` : ""}.` };
}

/**
 * "Check your area": search an LGA, ward or community by name, or use the device's location,
 * and see that area's summary. Works without an account. The search box is a combobox: arrow
 * keys move through the results, Enter chooses, Esc closes.
 */
export function PlaceFinder({ selection, onSelect, signedIn }: PlaceFinderProps) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = useDebounce(query.trim(), 250);
  const { results, loading, error } = usePublicSearch(q);
  const located = useLocatePoint("public");
  const geolocation = useGeolocation();
  const [locateError, setLocateError] = useState<string | null>(null);

  const placePoint = async (subject: string, point: LonLat) => {
    setLocateError(null);
    const result = await located.locate(point);
    const where = result ? describe(subject, result) : null;
    if (where) onSelect({ areaId: where.lgaId, note: where.note, marker: point });
    else setLocateError(result ? `${subject} is outside every mapped LGA.` : "That spot is outside the areas the platform covers so far.");
  };

  const options: Option[] = [
    ...(results?.areas ?? []).map((area) => ({
      key: `area:${area.id}`,
      icon: "pin" as IconName,
      title: area.unitName,
      detail: [area.levelName, area.parentName].filter(Boolean).join(" · "),
      choose: () => onSelect({ areaId: area.id, note: null, marker: null }),
    })),
    ...(results?.communities ?? []).map((community) => ({
      key: `community:${community.id}`,
      icon: "users" as IconName,
      title: community.name,
      detail: "Community",
      choose: () => void placePoint(community.name, community.point),
    })),
  ];
  const showList = open && q.length >= MIN_SEARCH_LENGTH;
  const activeIndex = Math.min(active, Math.max(options.length - 1, 0));

  const choose = (option: Option | undefined) => {
    if (!option) return;
    setQuery(option.title);
    setOpen(false);
    option.choose();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && showList) {
      event.preventDefault();
      choose(options[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const locateMe = async () => {
    const point = await geolocation.request();
    if (point) await placePoint("Your location", point);
  };

  const busy = located.loading || geolocation.locating;
  const problem = geolocation.error ?? locateError;

  return (
    <div className="place-finder">
      <div className="place-finder__controls">
        <div className="place-finder__search">
          <label htmlFor={`${listId}-input`} className="visually-hidden">
            Search an LGA, ward or community
          </label>
          <Icon name="search" size={18} className="place-finder__search-icon" />
          <input
            id={`${listId}-input`}
            type="search"
            className="place-finder__input"
            placeholder="Search an LGA, ward or community, e.g. Bonny"
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={`${listId}-list`}
            aria-activedescendant={showList && options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            data-cy="place-finder-input"
          />
          {loading && (
            <span className="place-finder__spinner">
              <Spinner size="sm" label="Searching" />
            </span>
          )}
          {showList && (
            <ul id={`${listId}-list`} role="listbox" className="place-finder__list" aria-label="Matching places" data-cy="place-finder-results">
              {options.map((option, index) => (
                <li
                  key={option.key}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`place-finder__option${index === activeIndex ? " place-finder__option--active" : ""}`}
                  // mousedown, not click: it fires before the input's blur closes the list.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(option);
                  }}
                  onMouseEnter={() => setActive(index)}
                >
                  <Icon name={option.icon} size={16} />
                  <span className="place-finder__option-text">
                    <span className="place-finder__option-title">{option.title}</span>
                    <span className="place-finder__option-detail">{option.detail}</span>
                  </span>
                </li>
              ))}
              {!loading && options.length === 0 && (
                <li className="place-finder__none" role="presentation">
                  {error ?? `No LGA, ward or community matches “${q}”.`}
                </li>
              )}
            </ul>
          )}
        </div>
        <Button variant="secondary" icon={<Icon name="crosshair" size={16} />} onClick={locateMe} loading={busy} loadingLabel="Locating…" data-cy="place-finder-locate">
          Use my location
        </Button>
      </div>
      <p className="place-finder__privacy">Your location is used once to find your area. It is never stored.</p>

      {problem && (
        <p className="place-finder__problem" role="alert">
          <Icon name="alert" size={16} />
          {problem}
        </p>
      )}

      <div className="place-finder__result" aria-live="polite">
        {selection ? (
          <PlaceSummary key={selection.areaId} areaId={selection.areaId} note={selection.note} signedIn={signedIn} />
        ) : (
          <div className="place-finder__placeholder">
            <Icon name="pin" size={22} />
            <p>Choose a place to see where it sits and how its rainfall compares with the usual level.</p>
          </div>
        )}
      </div>
    </div>
  );
}
