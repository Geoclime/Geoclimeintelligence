import { Suspense } from "react";
import { Outlet } from "react-router";
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
          <BrandMark variant="light" />
          <div className="auth-brand__copy">
            <h2 className="auth-brand__headline">Climate intelligence and disaster management for Rivers State.</h2>
            <p className="auth-brand__sub">
              One place for responders, officials and researchers to see flood risk, rainfall and disaster events.
            </p>
          </div>
          <p className="auth-brand__coords mono" aria-label="Map centre: 4.85 degrees north, 7.00 degrees east">
            4.85° N · 7.00° E
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
