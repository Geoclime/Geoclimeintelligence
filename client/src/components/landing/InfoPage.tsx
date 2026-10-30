import type { ReactNode } from "react";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { formatDate } from "../../utils/formatDate";

export interface InfoSection {
  /** The section's anchor, e.g. "your-rights" (linkable as /privacy#your-rights). */
  id: string;
  title: string;
  body: ReactNode;
}

interface InfoPageProps {
  eyebrow: string;
  title: string;
  lead: ReactNode;
  /** "YYYY-MM-DD": shown as "Last updated …" on policies. */
  updated?: string;
  sections: InfoSection[];
  /** Shown after the sections, e.g. a call to action. */
  footer?: ReactNode;
  /** The "On this page" list beside the text on wide screens. On by default for long pages (3+ sections). */
  toc?: boolean;
}

/**
 * The layout of the public content pages (About, Contact, Accessibility, Privacy, Terms): a
 * title band, a contents list beside the text on wide screens, and readable prose. Each section
 * has an anchor, so a link can point straight at it.
 */
export function InfoPage({ eyebrow, title, lead, updated, sections, footer, toc = sections.length > 2 }: InfoPageProps) {
  useDocumentTitle(title);
  return (
    <article className="info-page">
      <header className="info-page__hero">
        <div className="info-page__hero-inner">
          <p className="landing-hero__eyebrow">{eyebrow}</p>
          <h1 className="info-page__title">{title}</h1>
          <div className="info-page__lead">{lead}</div>
          {updated && <p className="info-page__updated">Last updated {formatDate(updated)}</p>}
        </div>
      </header>

      <div className={`info-page__layout${toc ? " info-page__layout--with-toc" : ""}`}>
        {toc && (
          <nav className="info-page__toc" aria-label="On this page">
            <p className="info-page__toc-title">On this page</p>
            <ol>
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div className="info-page__body">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="info-page__section" aria-labelledby={`${section.id}-title`}>
              <h2 id={`${section.id}-title`} className="info-page__section-title">
                {section.title}
              </h2>
              <div className="info-page__prose">{section.body}</div>
            </section>
          ))}
          {footer}
        </div>
      </div>
    </article>
  );
}
