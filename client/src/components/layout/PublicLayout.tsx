import { Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { useAuth } from "../../hooks/useAuth";
import { LandingFooter } from "../landing/LandingFooter";
import { LandingHeader } from "../landing/LandingHeader";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import { OfflineBanner } from "./OfflineBanner";
import { PwaUpdateBanner } from "./PwaUpdateBanner";
import "./layout.css";
import "../landing/landing.css";

/**
 * The frame of every public page (the landing page, About, Contact, Accessibility, Privacy and
 * Terms): open to everyone, signed in or not. A new page starts at the top; a link with a
 * section ("/#sources") scrolls to that section, also when it comes from another page.
 */
export function PublicLayout() {
  const { status } = useAuth();
  const session = status === "loading" ? "loading" : status === "signed-in" ? "signed-in" : "signed-out";
  const { pathname, hash } = useLocation();

  useEffect(() => {
    const target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    if (target) {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);

  return (
    <div className="public-site">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <LandingHeader session={session} />
      <OfflineBanner />
      <PwaUpdateBanner />
      <main id="main">
        <Suspense fallback={<LoadingSpinner />}>
          <Outlet />
        </Suspense>
      </main>
      <LandingFooter signedIn={session === "signed-in"} />
    </div>
  );
}
