import { useEffect, useState } from "react";
import { Link } from "react-router";
import { MAP_PATH } from "../../utils/map-url";
import { ThemeToggle } from "../layout/ThemeToggle";
import { BrandMark } from "../shared/BrandMark";
import { buttonClassName } from "../shared/Button";
import { Icon } from "../shared/Icon";

/** The landing page's sections, linked from the header and footer on every public page. */
export const LANDING_SECTIONS = [
  { to: "/#check", label: "Check your area" },
  { to: "/#features", label: "What you can do" },
  { to: "/#coverage", label: "Coverage" },
  { to: "/#sources", label: "Data sources" },
] as const;

const HEADER_LINKS = [
  { to: "/#check", label: "Check your area" },
  { to: "/#features", label: "Platform" },
  { to: "/#sources", label: "Data" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
] as const;

interface LandingHeaderProps {
  /** "loading" while the session is checked, so no wrong button flashes up first. */
  session: "loading" | "signed-in" | "signed-out";
}

/**
 * The public site's sticky top bar: the brand, the main links, the theme switch
 * and the way in (sign in and create an account, or straight to the map once signed in). On a
 * phone the section links fold into a menu.
 */
export function LandingHeader({ session }: LandingHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header className="landing-header">
      <div className="landing-header__inner">
        <Link to="/" className="landing-header__brand" aria-label="GeoClime Intelligence, home">
          <BrandMark />
        </Link>

        <nav className={`landing-nav${menuOpen ? " landing-nav--open" : ""}`} id="landing-nav" aria-label="Main">
          {HEADER_LINKS.map((link) => (
            <Link key={link.to} to={link.to} className="landing-nav__link" onClick={() => setMenuOpen(false)}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="landing-header__actions">
          <ThemeToggle />
          {session === "signed-in" && (
            <Link to={MAP_PATH} className={buttonClassName({ variant: "primary", size: "sm" })} data-cy="landing-open-map">
              Open the map
            </Link>
          )}
          {session === "signed-out" && (
            <>
              <Link to="/sign-in" className={buttonClassName({ variant: "ghost", size: "sm", className: "landing-header__sign-in" })} data-cy="landing-sign-in">
                Sign in
              </Link>
              <Link to="/sign-up" className={buttonClassName({ variant: "primary", size: "sm" })} data-cy="landing-sign-up">
                Create account
              </Link>
            </>
          )}
          <button
            type="button"
            className="landing-header__menu"
            aria-expanded={menuOpen}
            aria-controls="landing-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon name={menuOpen ? "close" : "menu"} size={20} />
            <span className="visually-hidden">{menuOpen ? "Close menu" : "Open menu"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
