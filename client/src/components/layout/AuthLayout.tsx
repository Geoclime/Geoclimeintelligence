import { Suspense } from "react";
import { Link, Outlet } from "react-router";
import { BrandMark } from "../shared/BrandMark";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import { ContourBackdrop } from "./ContourBackdrop";
import { OfflineBanner } from "./OfflineBanner";
import { ThemeToggle } from "./ThemeToggle";
import "./layout.css";

/** The signed-out frame: brand panel on the left (top on phones), the form on the right. */
export function AuthLayout() {
  return (
    <div className="auth-layout">
      <aside className="auth-brand">
        <ContourBackdrop />
        <div className="auth-brand__content">
          <Link to="/" className="auth-brand__home" aria-label="GeoClime Intelligence, home">
            <BrandMark variant="light" />
          </Link>
          <div className="auth-brand__copy">
            <h2 className="auth-brand__headline">Climate intelligence and disaster management for Nigeria.</h2>
            <p className="auth-brand__sub">
              One shared, sourced map of places, infrastructure and rainfall for responders, officials, researchers and residents.
            </p>
          </div>
          <p className="auth-brand__coords mono" aria-label="Centre of Nigeria: 9.08 degrees north, 8.68 degrees east">
            9.08° N · 8.68° E
          </p>
        </div>
      </aside>
      <div className="auth-main">
        <div className="auth-main__toolbar">
          <ThemeToggle />
        </div>
        <OfflineBanner />
        <main id="main" className="auth-main__content">
          <Suspense fallback={<LoadingSpinner />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
