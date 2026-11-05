import { Link } from "react-router";
import { InfoPage } from "../../components/landing/InfoPage";
import { SITE } from "../../config/site";

/** The terms of using the website and platform. */
export function TermsPage() {
  return (
    <InfoPage
      eyebrow="Terms"
      title="Terms of use"
      lead={`These terms apply to everyone who uses the ${SITE.name} website and platform. By using them, you agree to these terms.`}
      updated={SITE.policiesUpdated}
      sections={[
        {
          id: "not-an-emergency-service",
          title: "Not an emergency service",
          body: (
            <p>
              The platform provides information for planning and decision-making. It is not an emergency service, does not issue official warnings,
              and is not monitored around the clock. If anyone is in danger, call{" "}
              <a href={`tel:${SITE.emergencyNumber}`}>{SITE.emergencyNumber}</a> and follow the instructions of the emergency services and government
              agencies.
            </p>
          ),
        },
        {
          id: "information",
          title: "About the information",
          body: (
            <>
              <p>
                Boundaries, map layers and rainfall come from third-party datasets, credited with their sources. Some are estimates (rainfall is derived
                from satellite and station records), and some boundaries are placeholders rather than official lines. We work to keep the information
                accurate and current, but we can't guarantee that it is complete, correct or up to date.
              </p>
              <p>
                Rainfall figures describe how wet a period has been. They are not a flood forecast and must not be read as one. Check important decisions
                against official sources.
              </p>
            </>
          ),
        },
        {
          id: "data-licences",
          title: "Data licences",
          body: (
            <p>
              Each dataset stays under its own licence, listed under <Link to="/#sources">Data sources</Link>. Map data is © OpenStreetMap contributors
              under the Open Database License. If you reuse data from the platform, you must follow its licence, including any attribution it requires.
            </p>
          ),
        },
        {
          id: "accounts",
          title: "Your account",
          body: (
            <ul>
              <li>Give accurate details when you sign up, and keep your password to yourself.</li>
              <li>You're responsible for what happens under your account. Tell us at once if you think someone else has used it.</li>
              <li>
                Administrators assign roles and regions. We may change or suspend access that is misused or no longer needed, and you can ask us to
                close your account at any time.
              </li>
            </ul>
          ),
        },
        {
          id: "acceptable-use",
          title: "Acceptable use",
          body: (
            <>
              <p>You must not:</p>
              <ul>
                <li>try to get around access controls, or reach data your role doesn't allow;</li>
                <li>disrupt the service, overload it, or collect its data automatically beyond reasonable personal use;</li>
                <li>present information from the platform as an official government warning or instruction;</li>
                <li>use the platform for anything unlawful.</li>
              </ul>
            </>
          ),
        },
        {
          id: "liability",
          title: "Our liability",
          body: (
            <p>
              The platform is provided "as is". As far as the law allows, we are not liable for any loss arising from reliance on its information or from
              its being unavailable. Nothing in these terms limits liability that cannot be limited by law.
            </p>
          ),
        },
        {
          id: "changes-and-law",
          title: "Changes and governing law",
          body: (
            <p>
              We may update these terms and will show the date at the top; continuing to use the platform means you accept the new terms. These terms
              are governed by the laws of the Federal Republic of Nigeria. Questions? See the <Link to="/contact">contact page</Link>. How we handle
              personal data is set out in our <Link to="/privacy">privacy policy</Link>.
            </p>
          ),
        },
      ]}
    />
  );
}
