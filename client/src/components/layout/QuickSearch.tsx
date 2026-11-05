import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useDebounce } from "../../hooks/useDebounce";
import { useFacilitySearch } from "../../hooks/useFacilitySearch";
import { MIN_SEARCH_LENGTH, usePublicSearch } from "../../hooks/usePublicSearch";
import type { UserRole } from "../../types/auth.types";
import { describeKind } from "../../utils/facility-kinds";
import { areaFocusLink, communityFocusLink, facilityFocusLink, type MapFocusLink } from "../../utils/map-focus";
import { MAP_PATH } from "../../utils/map-url";
import { hasAnyRole } from "../../utils/roles";
import { can } from "../../utils/permissions";
import { useAuth } from "../../hooks/useAuth";
import { Icon, type IconName } from "../shared/Icon";
import { NAV_GROUPS } from "./nav-items";

interface Result {
  key: string;
  /** Where choosing it goes. A place goes to the map, which is told to bring it into view. */
  to: string;
  state?: MapFocusLink["state"];
  icon: IconName;
  title: string;
  detail: string;
  group: "Pages" | "Places" | "Communities" | "Facilities";
}

const EXTRA_PAGES = [
  { to: "/account", label: "Your profile", icon: "user" as IconName, description: "Name, contact details and access" },
  { to: "/help", label: "Help and guides", icon: "info" as IconName, description: "How the platform works" },
];

/**
 * The top bar's search: jump to any page, or to any LGA, ward, community or facility on the map, by
 * typing part of its name. Opens with the button, "/" or Ctrl/Cmd+K; arrow keys move, Enter opens,
 * Esc closes. Choosing a place takes you to the map, zoomed to it. Names are searched on the server
 * (name contains, debounced 250 ms): areas and communities through the public search, facilities
 * (which are behind sign-in, like the map's other layers) through their own route.
 */
export function QuickSearch({ role }: { role: UserRole }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const q = useDebounce(query.trim(), 250);

  const searching = q.length >= MIN_SEARCH_LENGTH;
  const places = usePublicSearch(open ? q : "");
  const facilities = useFacilitySearch(open ? q : "");
  const found = places.results;
  const loading = places.loading || facilities.loading;
  const problem = places.error ?? facilities.error;

  // Global shortcuts. "/" is ignored while typing in a field, so it never steals a keystroke.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, select, [contenteditable='true']");
      if ((event.key === "k" && (event.ctrlKey || event.metaKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const pages = useMemo(() => {
    const items = NAV_GROUPS.flatMap((group) => group.items)
      .filter((item) => (item.permission ? can(user, item.permission) : item.roles.length === 0 || hasAnyRole(role, item.roles)))
      .map((item) => ({ to: item.to, label: item.label, icon: item.icon, description: item.description }));
    return [...items, ...EXTRA_PAGES.filter((extra) => !items.some((item) => item.to === extra.to))];
  }, [role, user]);

  // On the map already, the layers the viewer switched on stay as they are when a place is chosen.
  const mapParams = location.pathname === MAP_PATH ? new URLSearchParams(location.search) : undefined;
  const needle = query.trim().toLowerCase();
  const results: Result[] = [
    ...pages
      .filter((page) => !needle || `${page.label} ${page.description}`.toLowerCase().includes(needle))
      .map((page) => ({
        key: `page:${page.to}`,
        to: page.to,
        icon: page.icon,
        title: page.label,
        detail: page.description,
        group: "Pages" as const,
      })),
    ...(searching
      ? (found?.areas ?? []).map((area) => ({
          key: `area:${area.id}`,
          ...areaFocusLink(area, mapParams),
          icon: "pin" as IconName,
          title: area.unitName,
          detail: [area.levelName, area.parentName].filter(Boolean).join(" · "),
          group: "Places" as const,
        }))
      : []),
    ...(searching
      ? (found?.communities ?? []).map((community) => ({
          key: `community:${community.id}`,
          ...communityFocusLink(community, mapParams),
          icon: "users" as IconName,
          title: community.name,
          detail: "Community",
          group: "Communities" as const,
        }))
      : []),
    ...(searching
      ? facilities.facilities.map((facility) => ({
          key: `facility:${facility.id}`,
          ...facilityFocusLink(facility, mapParams),
          icon: "map" as IconName,
          title: facility.name,
          detail: [describeKind(facility.osmClass), facility.origin === "manual" ? "Saved place" : null].filter(Boolean).join(" · "),
          group: "Facilities" as const,
        }))
      : []),
  ];
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));

  const close = () => {
    setOpen(false);
    setQuery("");
    setActive(0);
  };

  const go = (result: Result | undefined) => {
    if (!result) return;
    close();
    navigate(result.to, { state: result.state });
  };

  const onInputKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[activeIndex]);
    }
  };

  const count = `${results.length} result${results.length === 1 ? "" : "s"}`;
  let status: string;
  if (searching && loading) status = "Searching places…";
  else if (searching && problem) status = results.length > 0 ? `${count}, but some places couldn't be searched.` : `Places couldn't be searched: ${problem}`;
  else if (results.length === 0) status = `Nothing matches "${query.trim()}". Try part of the name, e.g. "Obio".`;
  else if (!searching) status = "Type two or more letters to search LGAs, wards, communities and facilities.";
  else status = `${count}. Use ↑ ↓ and Enter.`;

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  let lastGroup: Result["group"] | null = null;

  return (
    <>
      <button type="button" className="quick-search__trigger" onClick={() => setOpen(true)} data-cy="quick-search">
        <Icon name="search" size={15} />
        <span className="quick-search__placeholder">Search places and pages</span>
        <kbd className="quick-search__kbd">{isMac ? "⌘K" : "Ctrl K"}</kbd>
        <span className="visually-hidden">Open search</span>
      </button>

      <dialog
        ref={dialogRef}
        className="quick-search"
        aria-label="Search"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        {open && (
          <div className="quick-search__panel">
            <div className="quick-search__field">
              <Icon name="search" size={18} />
              <input
                ref={inputRef}
                type="search"
                role="combobox"
                aria-expanded={results.length > 0}
                aria-controls={listId}
                aria-activedescendant={results[activeIndex] ? `${listId}-${activeIndex}` : undefined}
                aria-autocomplete="list"
                placeholder="Type an LGA, ward, community, facility or page name…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={onInputKey}
                data-cy="quick-search-input"
              />
              <button type="button" className="quick-search__esc" onClick={close}>
                Esc
              </button>
            </div>

            <ul id={listId} role="listbox" className="quick-search__results" aria-label="Results">
              {results.map((result, index) => {
                const heading = result.group !== lastGroup ? result.group : null;
                lastGroup = result.group;
                return (
                  <li key={result.key} role="presentation">
                    {heading && <p className="quick-search__group">{heading}</p>}
                    <div
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={index === activeIndex}
                      className={`quick-search__option${index === activeIndex ? " is-active" : ""}`}
                      onMouseMove={() => setActive(index)}
                      onClick={() => go(result)}
                      data-cy="quick-search-option"
                    >
                      <span className="quick-search__icon">
                        <Icon name={result.icon} size={15} />
                      </span>
                      <span className="quick-search__text">
                        <span className="quick-search__title">{result.title}</span>
                        <span className="quick-search__detail">{result.detail}</span>
                      </span>
                      <Icon name="chevronRight" size={14} />
                    </div>
                  </li>
                );
              })}
            </ul>

            <p className="quick-search__status" aria-live="polite">
              {status}
            </p>
          </div>
        )}
      </dialog>
    </>
  );
}
