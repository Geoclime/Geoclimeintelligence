import { Link } from "react-router";
import { InfoPage } from "../../components/landing/InfoPage";
import { buttonClassName } from "../../components/shared/Button";
import { SITE } from "../../config/site";

/** Who we are, what the platform is for, and the principles behind it. */
export function AboutPage() {
  return (
    <InfoPage
      eyebrow="About"
      title={`About ${SITE.name}`}
      lead="We bring Nigeria's geography, infrastructure and rainfall into one shared, sourced map, so the people who plan for and respond to floods and other disasters work from the same picture."
      sections={[
        {
          id: "mission",
          title: "Our mission",
          body: (
            <>
              <p>
                Across Nigeria, rivers, creeks and coastlines shape where people live and how they travel, and heavy rain can quickly change both. Good
                decisions in those moments depend on knowing where a community is, what is around it, and how the season compares with normal.
              </p>
              <p>
                Our mission is to make that knowledge easy to reach: accurate, openly sourced and the same for everyone, from an emergency coordinator to a
                resident checking on their own community.
              </p>
            </>
          ),
        },
        {
          id: "coverage",
          title: "Where we work",
          body: (
            <>
              <p>
                We are building state by state. Rivers State, in the Niger Delta, came first: one of the country's most flood-exposed states. Each new
                state brings its local government areas, wards, infrastructure and rainfall record onto the same map. The current coverage is shown live
                on the <Link to="/#coverage">home page</Link>.
              </p>
              <p>
                The platform is designed around countries and their own administrative levels, not around Nigeria alone, so it can grow to other
                countries in Africa on the same foundations.
              </p>
            </>
          ),
        },
        {
          id: "what-we-do",
          title: "What the platform does",
          body: (
            <ul>
              <li>
                <strong>Maps each state in layers:</strong> the state, its local government areas and their wards, with roads, rivers and creeks, named
                communities, health and education facilities, and building outlines.
              </li>
              <li>
                <strong>Profiles every LGA:</strong> its wards, its place in the state and its rainfall record, in one page.
              </li>
              <li>
                <strong>Tracks rainfall:</strong> a month-by-month record for every LGA, with each month compared with its usual level and each year with
                an average year.
              </li>
              <li>
                <strong>Answers "where is this?":</strong> search a community or use your location to find its LGA and ward.
              </li>
            </ul>
          ),
        },
        {
          id: "principles",
          title: "How we work",
          body: (
            <>
              <h3>Every figure has a source</h3>
              <p>
                Each boundary, layer and rainfall value is shown with the dataset it came from and its licence. Where a dataset is a placeholder rather
                than an official boundary, we say so.
              </p>
              <h3>Honest about uncertainty</h3>
              <p>
                Rainfall tells you how wet a season has been, not whether a particular street will flood. We present data for what it is, and we don't
                show a feature until the data behind it is ready.
              </p>
              <h3>Private by design</h3>
              <p>
                Anyone can look up an area without an account. Your location is used once to find your area and is never stored. See our{" "}
                <Link to="/privacy">privacy policy</Link>.
              </p>
              <h3>Access by role</h3>
              <p>
                Responders, officials, researchers and the public each see what their work needs. Administrators assign roles, and access can be limited
                to a region.
              </p>
            </>
          ),
        },
        {
          id: "data",
          title: "Our data",
          body: (
            <p>
              The platform is built on open data from organisations including geoBoundaries, GRID3, OpenStreetMap contributors and the Climate Hazards
              Center (CHIRPS rainfall). The full, current list is under <Link to="/#sources">Data sources</Link> on the home page.
            </p>
          ),
        },
      ]}
      footer={
        <div className="info-page__cta">
          <p>Working on disaster risk in Nigeria, or want your state on the platform? We'd like to hear from you.</p>
          <Link to="/contact" className={buttonClassName({ variant: "primary" })}>
            Contact us
          </Link>
        </div>
      }
    />
  );
}
