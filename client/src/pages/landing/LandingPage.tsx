import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { CoverageStats } from "../../components/landing/CoverageStats";
import { SITE } from "../../config/site";
import { PlaceFinder, type PlaceSelection } from "../../components/landing/PlaceFinder";
import { StateOutline } from "../../components/landing/StateOutline";
import { ContourBackdrop } from "../../components/layout/ContourBackdrop";
import { buttonClassName } from "../../components/shared/Button";
import { Icon, type IconName } from "../../components/shared/Icon";
import { useAuth } from "../../hooks/useAuth";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { usePublicOutline } from "../../hooks/usePublicOutline";
import { usePublicOverview } from "../../hooks/usePublicOverview";
import type { PublicOverview } from "../../types/public.types";
import { isMapLink, MAP_PATH } from "../../utils/map-url";
import { areaTitle, listAreas } from "../../utils/area-title";
import { formatYearMonth } from "../../utils/rainfall-summary";

const FEATURES: { icon: IconName; title: string; text: string; to: string; cta: string }[] = [
  {
    icon: "map",
    title: "Explore the map",
    text: "The state, its LGAs and wards, with roads, rivers and creeks, communities, facilities and buildings you can switch on and off.",
    to: MAP_PATH,
    cta: "Open the map",
  },
  {
    icon: "pin",
    title: "Look up any place",
    text: "Every LGA has a profile with its wards and rainfall. Search by name, or let the map work out which LGA and ward you are in.",
    to: "/places",
    cta: "Browse places",
  },
  {
    icon: "cloudRain",
    title: "Follow the rainfall",
    text: "Monthly rainfall for every LGA, each month against its usual level and each year against an average year.",
    to: "/#check",
    cta: "Check your LGA",
  },
];

const AUDIENCES: { icon: IconName; title: string; text: string }[] = [
  { icon: "alert", title: "Emergency responders", text: "Find a community fast, see the roads, rivers and facilities around it, and know which LGA and ward it falls in." },
  { icon: "shield", title: "Government officials", text: "Compare LGAs and wards from one shared map, with every boundary and figure traceable to its source." },
  { icon: "database", title: "Researchers", text: "A month-by-month rainfall record for every LGA, with the dataset and licence behind every layer." },
  { icon: "users", title: "Residents", text: "Look up your community and see how this year's rainfall compares with an average year." },
];

/** "Live in Rivers State · 23 LGAs · 317 Wards · Rainfall since January 2016", from whatever is loaded. */
function heroFacts(overview: PublicOverview | null): string[] {
  if (!overview) return [];
  const states = overview.states.map((s) => areaTitle(s.unitName, s.levelName));
  const coverage = states.length > 0 ? [`Live in ${listAreas(states)}`] : [];
  const areas = overview.areas.filter((a) => a.level >= 2).map((a) => `${a.count.toLocaleString("en")} ${a.levelName}s`);
  const rainfall = overview.rainfall ? [`Rainfall since ${formatYearMonth(overview.rainfall.firstMonth)}`] : [];
  return [...coverage, ...areas, ...rainfall];
}

function scrollToSection(id: string) {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

/**
 * The public front door at "/": what the platform is, a place finder that works without an
 * account, live figures and data credits. Map links from before the map moved to /map carry map
 * parameters, so they are forwarded there instead (utils/map-url.ts).
 */
export function LandingPage() {
  const [params] = useSearchParams();
  if (isMapLink(params)) return <Navigate to={`${MAP_PATH}?${params.toString()}`} replace />;
  return <Landing />;
}

function Landing() {
  useDocumentTitle("Climate intelligence for Nigeria");
  const signedIn = useAuth().status === "signed-in";
  const { overview, loading: overviewLoading, error: overviewError, refetch } = usePublicOverview();
  const { outline, loading: outlineLoading } = usePublicOutline();
  const [selection, setSelection] = useState<PlaceSelection | null>(null);
  const facts = heroFacts(overview);

  return (
    <>
      <section className="landing-hero" aria-labelledby="landing-title">
        <ContourBackdrop />
        <div className="landing-hero__inner">
          <div className="landing-hero__copy">
            <p className="landing-hero__eyebrow">Nigeria</p>
            <h1 id="landing-title" className="landing-hero__title">
              Climate and disaster intelligence for Nigeria.
            </h1>
            <p className="landing-hero__lead">
              One shared map of Nigeria's states, LGAs and wards, built from open, sourced data. Look up any community, see the roads, rivers and
              facilities around it, and how its rainfall compares with the usual level. Coverage grows state by state.
            </p>
            <div className="landing-hero__actions">
              <a href="#check" className={buttonClassName({ variant: "primary", size: "lg", className: "landing-hero__primary" })}>
                <Icon name="search" size={18} />
                Check your area
              </a>
              {signedIn ? (
                <Link to={MAP_PATH} className={buttonClassName({ variant: "secondary", size: "lg", className: "landing-hero__secondary" })}>
                  Open the map
                </Link>
              ) : (
                <Link to="/sign-up" className={buttonClassName({ variant: "secondary", size: "lg", className: "landing-hero__secondary" })}>
                  Create a free account
                </Link>
              )}
            </div>
            {facts.length > 0 && (
              <ul className="landing-hero__facts" data-cy="landing-facts">
                {facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="landing-hero__visual">
            <StateOutline
              outline={outline}
              loading={outlineLoading}
              selectedId={selection?.areaId ?? null}
              marker={selection?.marker ?? null}
              onSelect={(areaId) => {
                setSelection({ areaId, note: null, marker: null });
                scrollToSection("check");
              }}
            />
            <p className="landing-hero__coords mono" aria-hidden="true">
              9.08° N · 8.68° E
            </p>
          </div>
        </div>
      </section>

      <section id="check" className="landing-section landing-section--raised" aria-labelledby="check-title">
        <div className="landing-section__inner">
          <header className="landing-section__header">
            <p className="landing-eyebrow">No account needed</p>
            <h2 id="check-title" className="landing-section__title">
              Check your area
            </h2>
            <p className="landing-section__lead">
              Search an LGA, ward or community, use your location, or click an LGA on the outline above. You'll see where it sits and how its recent
              rainfall compares with the usual level.
            </p>
          </header>
          <div className="landing-card landing-card--finder">
            <PlaceFinder selection={selection} onSelect={setSelection} signedIn={signedIn} />
          </div>
          <p className="landing-emergency">
            <Icon name="phone" size={16} />
            <span>
              In an emergency, call <a href={`tel:${SITE.emergencyNumber}`}>{SITE.emergencyNumber}</a>. This platform is for information and planning, not for reporting emergencies.
            </span>
          </p>
        </div>
      </section>

      <section id="features" className="landing-section" aria-labelledby="features-title">
        <div className="landing-section__inner">
          <header className="landing-section__header">
            <p className="landing-eyebrow">The platform</p>
            <h2 id="features-title" className="landing-section__title">
              What you can do
            </h2>
          </header>
          <ul className="landing-features">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="landing-card landing-feature">
                <span className="landing-feature__icon">
                  <Icon name={feature.icon} size={22} />
                </span>
                <h3 className="landing-feature__title">{feature.title}</h3>
                <p className="landing-feature__text">{feature.text}</p>
                <Link to={feature.to} className="landing-feature__link">
                  {feature.cta}
                  <Icon name="arrowRight" size={16} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="coverage" className="landing-section landing-section--raised" aria-labelledby="coverage-title">
        <div className="landing-section__inner">
          <header className="landing-section__header">
            <p className="landing-eyebrow">Live from the platform</p>
            <h2 id="coverage-title" className="landing-section__title">
              What's on the map today
            </h2>
            <p className="landing-section__lead">Read from the platform's database, so these figures grow as each new state and dataset is loaded.</p>
          </header>
          <CoverageStats overview={overview} loading={overviewLoading} error={overviewError} onRetry={refetch} />
        </div>
      </section>

      <section className="landing-section" aria-labelledby="audiences-title">
        <div className="landing-section__inner">
          <header className="landing-section__header">
            <p className="landing-eyebrow">Who it's for</p>
            <h2 id="audiences-title" className="landing-section__title">
              One map for everyone who plans and responds
            </h2>
          </header>
          <ul className="landing-audiences">
            {AUDIENCES.map((audience) => (
              <li key={audience.title} className="landing-audience">
                <Icon name={audience.icon} size={20} />
                <div>
                  <h3 className="landing-audience__title">{audience.title}</h3>
                  <p className="landing-audience__text">{audience.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="sources" className="landing-section landing-section--raised" aria-labelledby="sources-title">
        <div className="landing-section__inner">
          <header className="landing-section__header">
            <p className="landing-eyebrow">Open data</p>
            <h2 id="sources-title" className="landing-section__title">
              Data sources
            </h2>
            <p className="landing-section__lead">
              Every boundary, layer and rainfall figure on the platform is shown with where it came from and its licence, so a placeholder is never mistaken
              for an authoritative dataset.
            </p>
          </header>
          {overview && overview.sources.length > 0 ? (
            <ul className="landing-sources" data-cy="landing-sources">
              {overview.sources.map((source) => (
                <li key={source.id} className="landing-source">
                  <a href={source.url} target="_blank" rel="noreferrer" className="landing-source__provider">
                    {source.provider}
                    <Icon name="externalLink" size={14} />
                  </a>
                  <span className="landing-source__dataset">{source.datasetName}</span>
                  <span className="landing-source__license">{source.license}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="landing-section__lead">{overviewError ? "The sources couldn't be loaded right now." : "Loading the sources…"}</p>
          )}
        </div>
      </section>

      <section className="landing-cta" aria-labelledby="cta-title">
        <div className="landing-cta__inner">
          <div>
            <h2 id="cta-title" className="landing-cta__title">
              {signedIn ? "Pick up where you left off." : "See the full platform."}
            </h2>
            <p className="landing-cta__text">
              {signedIn
                ? "Open the map, or go straight to an LGA's profile."
                : "A free account opens the full map, every LGA and ward profile, and the rainfall record."}
            </p>
          </div>
          <div className="landing-cta__actions">
            {signedIn ? (
              <Link to={MAP_PATH} className={buttonClassName({ variant: "primary", size: "lg", className: "landing-hero__primary" })}>
                Open the map
              </Link>
            ) : (
              <>
                <Link to="/sign-up" className={buttonClassName({ variant: "primary", size: "lg", className: "landing-hero__primary" })}>
                  Create a free account
                </Link>
                <Link to="/sign-in" className={buttonClassName({ variant: "secondary", size: "lg", className: "landing-hero__secondary" })}>
                  Sign in
                </Link>
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
