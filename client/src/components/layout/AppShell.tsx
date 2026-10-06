import { Suspense, useCallback, useRef, useState } from "react";
import { Link, Outlet, useLocation, useMatches } from "react-router";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { BrandMark } from "../shared/BrandMark";
import { Icon } from "../shared/Icon";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import { activeNavItem } from "./nav-items";
import { OfflineBanner } from "./OfflineBanner";
import { Sidebar } from "./Sidebar";
import { UserMenu } from "./UserMenu";
import "./layout.css";

/** Route `handle` flags read by the shell. The map sets fullBleed: it fills the whole content area. */
export interface RouteHandle {
  fullBleed?: boolean;
}

/**
 * The signed-in dashboard frame: sidebar navigation, a top bar with the current section and the
 * account menu, the offline notice, and the current page.
 */
export function AppShell() {
  const { user, signOut } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const matches = useMatches();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  // Every sidebar link calls this; it only does anything when the phone drawer is open, and then
  // hands focus back to the button that opened it.
  const closeDrawer = useCallback(() => {
    if (!drawerOpen) return;
    setDrawerOpen(false);
    menuButton.current?.focus();
  }, [drawerOpen]);

  // RequireAuth only renders this once the user is resolved.
  if (!user) return null;

  const fullBleed = matches.some((match) => (match.handle as RouteHandle | undefined)?.fullBleed);
  const section = activeNavItem(location.pathname);

  const handleSignOut = async () => {
    try {
      await signOut();
      showToast({ type: "info", message: "You've been signed out." });
    } catch (error) {
      showToast({ type: "error", message: error instanceof Error ? error.message : "Couldn't sign out." });
    }
  };

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Sidebar role={user.role} open={drawerOpen} onClose={closeDrawer} />

      <div className={`app-body${fullBleed ? " app-body--full" : ""}`}>
        <header className="app-topbar">
          <button
            ref={menuButton}
            type="button"
            className="app-topbar__menu"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-controls="app-sidebar"
            aria-expanded={drawerOpen}
            data-cy="open-menu"
          >
            <Icon name="menu" size={22} />
          </button>
          <Link to="/" className="app-topbar__brand" aria-label="GeoClime Intelligence, map">
            <BrandMark showName={false} />
          </Link>
          <div className="app-topbar__title">
            <p className="app-topbar__section">{section?.label ?? "Account"}</p>
            <p className="app-topbar__description">{section?.description ?? "Your profile and access"}</p>
          </div>
          <UserMenu user={user} onSignOut={() => void handleSignOut()} />
        </header>
        <OfflineBanner />
        <main id="main" className={`app-main${fullBleed ? " app-main--full" : ""}`} tabIndex={-1}>
          <Suspense fallback={<LoadingSpinner />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
