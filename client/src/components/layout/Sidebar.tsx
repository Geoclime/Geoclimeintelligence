import { useEffect, useRef } from "react";
import { Link, NavLink } from "react-router";
import type { UserRole } from "../../types/auth.types";
import { hasAnyRole } from "../../utils/roles";
import { BrandMark } from "../shared/BrandMark";
import { Icon } from "../shared/Icon";
import { NAV_GROUPS } from "./nav-items";

interface SidebarProps {
  role: UserRole;
  /** Phones and tablets: whether the drawer is showing. Ignored on wide screens. */
  open: boolean;
  onClose: () => void;
}

/**
 * The main navigation. A fixed column on wide screens; below 1024px a drawer that slides in from
 * the left, closes on Esc, a backdrop tap or any link, and returns focus to the menu button.
 * Links a role can't use aren't shown (the backend refuses them anyway).
 */
export function Sidebar({ role, open, onClose }: SidebarProps) {
  const firstLink = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    firstLink.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.length === 0 || hasAnyRole(role, item.roles)),
  })).filter((group) => group.items.length > 0);

  const firstTo = groups[0]?.items[0]?.to;
  return (
    <>
      <div className={`app-sidebar-backdrop${open ? " is-open" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside id="app-sidebar" className={`app-sidebar${open ? " is-open" : ""}`} aria-label="Main navigation" data-cy="sidebar">
        <div className="app-sidebar__brand">
          <Link to="/" className="app-sidebar__home" aria-label="GeoClime Intelligence, map" onClick={onClose}>
            <BrandMark variant="light" />
          </Link>
          <button type="button" className="app-sidebar__close" onClick={onClose} aria-label="Close menu">
            <Icon name="close" size={20} />
          </button>
        </div>

        <nav className="app-sidebar__nav" aria-label="Main">
          {groups.map((group) => (
            <div key={group.label} className="app-sidebar__group">
              <p className="app-sidebar__group-label">{group.label}</p>
              <ul className="app-sidebar__list">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      ref={item.to === firstTo ? firstLink : undefined}
                      to={item.to}
                      end={item.to === "/"}
                      className="app-sidebar__link"
                      onClick={onClose}
                      data-cy={`nav-${item.label.toLowerCase()}`}
                    >
                      <Icon name={item.icon} size={18} />
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="app-sidebar__footer">
          <Icon name="pin" size={16} />
          <div>
            <p className="app-sidebar__region">Rivers State, Nigeria</p>
            <p className="app-sidebar__credit">Boundaries: geoBoundaries, GRID3 (CC BY 4.0)</p>
          </div>
        </div>
      </aside>
    </>
  );
}
