import { Link } from "react-router";
import { SITE } from "../../config/site";
import { MAP_PATH } from "../../utils/map-url";
import { BrandMark } from "../shared/BrandMark";
import { LANDING_SECTIONS } from "./LandingHeader";

const ORGANISATION_LINKS = [
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
  { to: "/accessibility", label: "Accessibility" },
  { to: "/privacy", label: "Privacy policy" },
  { to: "/terms", label: "Terms of use" },
] as const;

/** The public site's footer: what the platform is, where to go next, the policies and the emergency number. */
export function LandingFooter({ signedIn }: { signedIn: boolean }) {
  const year = new Date().getFullYear();
  return (
    <footer className="landing-footer">
      <div className="landing-footer__inner">
        <div className="landing-footer__about">
          <BrandMark variant="light" />
          <p>{SITE.tagline}, built on open, sourced data.</p>
          <p className="landing-footer__emergency">
            In an emergency, call <a href={`tel:${SITE.emergencyNumber}`}>{SITE.emergencyNumber}</a>, Nigeria's free national emergency number.
          </p>
        </div>

        <nav className="landing-footer__links" aria-label="Footer">
          <div>
            <h2 className="landing-footer__heading">Platform</h2>
            <ul>
              <li>
                <Link to={MAP_PATH}>Map</Link>
              </li>
              <li>
                <Link to="/places">Places</Link>
              </li>
              <li>
                <Link to="/help">Help and guides</Link>
              </li>
              {signedIn ? (
                <li>
                  <Link to="/account">Your profile</Link>
                </li>
              ) : (
                <>
                  <li>
                    <Link to="/sign-in">Sign in</Link>
                  </li>
                  <li>
                    <Link to="/sign-up">Create an account</Link>
                  </li>
                </>
              )}
            </ul>
          </div>
          <div>
            <h2 className="landing-footer__heading">Explore</h2>
            <ul>
              {LANDING_SECTIONS.map((section) => (
                <li key={section.to}>
                  <Link to={section.to}>{section.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="landing-footer__heading">Organisation</h2>
            <ul>
              {ORGANISATION_LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>

      <div className="landing-footer__base">
        <p>
          © {year} {SITE.name}. All rights reserved.
        </p>
        <p>
          Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>. Every other dataset is credited under{" "}
          <Link to="/#sources">Data sources</Link>.
        </p>
      </div>
    </footer>
  );
}
