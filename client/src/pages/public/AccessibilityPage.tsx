import { Link } from "react-router";
import { InfoPage } from "../../components/landing/InfoPage";
import { SITE } from "../../config/site";

/** The accessibility statement: the standard we aim for, what works, what doesn't yet, and how to tell us. */
export function AccessibilityPage() {
  return (
    <InfoPage
      eyebrow="Accessibility"
      title="Accessibility statement"
      lead={`${SITE.name} should be usable by everyone, including people who use a keyboard, a screen reader, magnification or a phone. This statement explains how we work towards that and where we still fall short.`}
      updated={SITE.policiesUpdated}
      sections={[
        {
          id: "standard",
          title: "Our standard",
          body: (
            <p>
              We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA across the website and platform. This statement is based on
              our own review of the site.
            </p>
          ),
        },
        {
          id: "what-works",
          title: "What you can expect",
          body: (
            <ul>
              <li>Every page can be used with a keyboard alone, with a visible focus outline and a "Skip to content" link.</li>
              <li>Light and dark themes, or your device's setting, with text and controls kept at AA contrast in both.</li>
              <li>Animation is reduced when your device asks for reduced motion.</li>
              <li>Charts have a table view with the same values, and icons that carry meaning have text labels.</li>
              <li>Pages reflow on small screens and stay usable when text is enlarged to 200%.</li>
              <li>Search results, loading states and errors are announced to screen readers.</li>
            </ul>
          ),
        },
        {
          id: "limitations",
          title: "Known limitations",
          body: (
            <>
              <ul>
                <li>
                  <strong>The interactive map is visual.</strong> The same areas are listed, with their details, in the Places directory and can be
                  found with search, which work fully with a keyboard and screen reader.
                </li>
                <li>
                  <strong>The state outline on the home page responds to a mouse or touch only.</strong> The "Check your area" search beside it gives
                  the same results by keyboard.
                </li>
                <li>
                  <strong>Some map controls come from our mapping provider</strong> and may not fully follow our standard. We report problems we find to
                  them.
                </li>
              </ul>
              <p>We're working on these, and we review the site whenever a new feature is added.</p>
            </>
          ),
        },
        {
          id: "feedback",
          title: "Tell us about a problem",
          body: (
            <p>
              If something is hard to use, or you need information in a different format, email{" "}
              <a href={`mailto:${SITE.contact.accessibility}?subject=${encodeURIComponent("Accessibility")}`}>{SITE.contact.accessibility}</a>. Tell us
              the page and what went wrong. We'll reply within {SITE.responseDays} working days. Other ways to reach us are on the{" "}
              <Link to="/contact">contact page</Link>.
            </p>
          ),
        },
      ]}
    />
  );
}
