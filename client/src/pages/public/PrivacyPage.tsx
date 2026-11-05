import { Link } from "react-router";
import { InfoPage } from "../../components/landing/InfoPage";
import { SITE } from "../../config/site";

const PROVIDERS = [
  { name: "Google Firebase", purpose: "Signing in, password resets and account emails. Your password is held by Firebase; we never see it." },
  { name: "Mapbox", purpose: "Drawing the map. Your browser requests map images from Mapbox, which receives your IP address." },
  { name: "Vercel", purpose: "Hosting the website." },
  { name: "Render", purpose: "Running the platform's server." },
  { name: "Aiven", purpose: "Hosting the platform's database." },
];

/** What personal data the platform holds, why, who processes it, and the rights people have over it. */
export function PrivacyPage() {
  const privacyEmail = <a href={`mailto:${SITE.contact.privacy}?subject=${encodeURIComponent("Privacy request")}`}>{SITE.contact.privacy}</a>;
  return (
    <InfoPage
      eyebrow="Privacy"
      title="Privacy policy"
      lead={`How ${SITE.name} collects, uses and protects personal data, in line with the Nigeria Data Protection Act 2023.`}
      updated={SITE.policiesUpdated}
      sections={[
        {
          id: "summary",
          title: "In short",
          body: (
            <ul>
              <li>You can look up any area without an account, and we don't use advertising or analytics trackers.</li>
              <li>If you create an account, we hold your email address, your name and any profile details you choose to add.</li>
              <li>Your location is used once, when you ask, to find your area. It is never stored.</li>
              <li>We never sell personal data.</li>
            </ul>
          ),
        },
        {
          id: "what-we-collect",
          title: "What we collect",
          body: (
            <>
              <h3>When you create an account</h3>
              <p>
                Your email address and password (held by our sign-in provider), your name, and, if you add them, your phone number, organisation and
                job title. Administrators record your role and, for some roles, the region you work in.
              </p>
              <h3>When you use your location</h3>
              <p>
                Only when you press "Use my location" or "Where am I?". Your browser asks your permission first. The position is sent once to find the
                LGA and ward that contain it, and it is not saved.
              </p>
              <h3>When you use the site</h3>
              <p>
                Like any web service, our servers process technical information such as your IP address and the pages requested. We use it to keep the
                service running, to limit abuse and to diagnose errors, and we keep error records only as long as needed to fix the problem.
              </p>
              <h3>On your device</h3>
              <p>
                Your browser stores your colour theme, a layout preference and, when you're signed in, your sign-in session. These are needed for the
                site to work and are not used to track you.
              </p>
            </>
          ),
        },
        {
          id: "how-we-use-it",
          title: "How we use it, and why we may",
          body: (
            <ul>
              <li>
                <strong>To provide your account and the platform</strong>: signing you in, showing what your role allows, and emailing you about your
                account (for example, to verify your address or reset your password). This is needed to provide the service you asked for.
              </li>
              <li>
                <strong>To keep the platform secure and working</strong>: limiting abuse and fixing faults. This is our legitimate interest in running a
                reliable public service.
              </li>
              <li>
                <strong>To find your area from your location</strong>: only with your consent, given in your browser each time.
              </li>
            </ul>
          ),
        },
        {
          id: "who-processes-it",
          title: "Who processes it for us",
          body: (
            <>
              <p>We use these service providers, under contracts that require them to protect the data and use it only for us:</p>
              <table className="info-page__table">
                <thead>
                  <tr>
                    <th scope="col">Provider</th>
                    <th scope="col">What for</th>
                  </tr>
                </thead>
                <tbody>
                  {PROVIDERS.map((provider) => (
                    <tr key={provider.name}>
                      <td>{provider.name}</td>
                      <td>{provider.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                Some of these providers store data outside Nigeria. Where they do, we rely on the safeguards the Nigeria Data Protection Act 2023 requires
                for transfers abroad.
              </p>
            </>
          ),
        },
        {
          id: "retention",
          title: "How long we keep it",
          body: (
            <p>
              We keep your account details while your account is open. When you ask us to delete your account, we remove your personal details within 30
              days, except where the law requires us to keep a record.
            </p>
          ),
        },
        {
          id: "your-rights",
          title: "Your rights",
          body: (
            <>
              <p>Under the Nigeria Data Protection Act 2023 you can ask us to:</p>
              <ul>
                <li>tell you what personal data we hold about you and give you a copy;</li>
                <li>correct anything that is wrong (you can edit most details yourself on your profile page);</li>
                <li>delete your data, or limit how we use it;</li>
                <li>give you your data in a portable format;</li>
                <li>stop processing that relies on your consent or our legitimate interest.</li>
              </ul>
              <p>
                Email {privacyEmail}. We'll reply within {SITE.responseDays} working days and may ask you to confirm your identity first. If you're not
                satisfied with our answer, you can complain to the Nigeria Data Protection Commission.
              </p>
            </>
          ),
        },
        {
          id: "security",
          title: "Security",
          body: (
            <p>
              Data travels over encrypted connections, the database requires an encrypted connection, and access to personal data is limited to the
              administrators who need it. No system is perfectly secure, but we take reasonable steps to protect what we hold.
            </p>
          ),
        },
        {
          id: "children",
          title: "Children",
          body: <p>The platform is not directed at children under 18, and we don't knowingly create accounts for them.</p>,
        },
        {
          id: "changes",
          title: "Changes to this policy",
          body: (
            <p>
              We'll update this page when our practices change and show the date at the top. If a change affects how we use your data, we'll tell
              account holders by email before it takes effect. Questions? See the <Link to="/contact">contact page</Link> or email {privacyEmail}.
            </p>
          ),
        },
      ]}
    />
  );
}
