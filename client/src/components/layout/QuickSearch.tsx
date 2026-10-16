import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useAdminUnits } from "../../hooks/useAdminUnits";
import { useDebounce } from "../../hooks/useDebounce";
import type { UserRole } from "../../types/auth.types";
import type { AdminUnitSummary } from "../../types/admin-unit.types";
import { hasAnyRole } from "../../utils/roles";
import { Icon, type IconName } from "../shared/Icon";
import { NAV_GROUPS } from "./nav-items";

interface Result {
  key: string;
  to: string;
  icon: IconName;
  title: string;
  detail: string;
  group: "Pages" | "Places";
}

/** Where an area's own page lives: the state goes to the directory, LGAs and wards to their profile. */
function placeLink(unit: AdminUnitSummary): string {
  if (unit.level >= 3 && unit.parentId) return `/places/${unit.parentId}/wards/${unit.id}`;
  if (unit.level === 2) return `/places/${unit.id}`;
  return "/places";
}

const EXTRA_PAGES = [
  { to: "/account", label: "Your profile", icon: "user" as IconName, description: "Name, contact details and access" },
  { to: "/help", label: "Help and guides", icon: "info" as IconName, description: "How the platform works" },
];

/**
 * The top bar's search: jump to any page, LGA or ward by typing part of its name. Opens with
 * the button, "/" or Ctrl/Cmd+K; arrow keys move, Enter opens, Esc closes. Place names are
 * searched on the server (name contains, debounced 250 ms).
 */
export function QuickSearch({ role }: { role: UserRole }) {
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const q = useDebounce(query.trim(), 250);

  const { units, loading } = useAdminUnits({ q, pageSize: 8, enabled: open && q.length >= 2 });

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
      .filter((item) => item.roles.length === 0 || hasAnyRole(role, item.roles))
      .map((item) => ({ to: item.to, label: item.label, icon: item.icon, description: item.description }));
    return [...items, ...EXTRA_PAGES.filter((extra) => !items.some((item) => item.to === extra.to))];
  }, [role]);

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
    ...(q.length >= 2
      ? units.map((unit) => ({
          key: `unit:${unit.id}`,
          to: placeLink(unit),
          icon: "pin" as IconName,
          title: unit.unitName,
          detail: [unit.levelName, unit.unitCode].filter(Boolean).join(" · "),
          group: "Places" as const,
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
    navigate(result.to);
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
                placeholder="Type an LGA, ward or page name…"
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
              {q.length >= 2 && loading
                ? "Searching places…"
                : results.length === 0
                  ? `Nothing matches "${query.trim()}". Try part of the name, e.g. "Obio".`
                  : q.length < 2
                    ? "Type two or more letters to search LGAs and wards."
                    : `${results.length} result${results.length === 1 ? "" : "s"}. Use ↑ ↓ and Enter.`}
            </p>
          </div>
        )}
      </dialog>
    </>
  );
}
