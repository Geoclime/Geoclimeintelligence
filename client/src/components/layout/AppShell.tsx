import { Suspense } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { hasAnyRole } from "../../utils/roles";
import { BrandMark } from "../shared/BrandMark";
import { Icon, type IconName } from "../shared/Icon";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import { OfflineBanner } from "./OfflineBanner";
import { UserMenu } from "./UserMenu";
import "./layout.css";

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  adminOnly?: boolean;
}

// Only screens that exist are listed. The map and data pages join this list once their backend
// endpoints ship, never before (standard sections 10 and 17.1).
const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Overview", icon: "layers" },
  { to: "/admin/users", label: "Users", icon: "users", adminOnly: true },
];

/** The signed-in frame: header, navigation, offline notice, and the current page. */
export function AppShell() {
  const { user, signOut } = useAuth();
  const { showToast } = useToast();
  // RequireAuth only renders this once the user is resolved.
  if (!user) return null;

  const items = NAV_ITEMS.filter((item) => !item.adminOnly || hasAnyRole(user.role, ["administrator"]));

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
      <header className="app-header">
        <div className="app-header__inner">
          <Link to="/" className="app-header__brand" aria-label="GeoClime Intelligence, overview">
            <BrandMark />
          </Link>
          <nav className="app-nav" aria-label="Main">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className="app-nav__link"
                data-cy={`nav-${item.label.toLowerCase()}`}
              >
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
          <UserMenu user={user} onSignOut={() => void handleSignOut()} />
        </div>
      </header>
      <OfflineBanner />
      <main id="main" className="app-main" tabIndex={-1}>
        <Suspense fallback={<LoadingSpinner />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="app-footer">
        <span>GeoClime Intelligence</span>
        <span aria-hidden="true">·</span>
        <span>Rivers State, Nigeria</span>
      </footer>
    </div>
  );
}
