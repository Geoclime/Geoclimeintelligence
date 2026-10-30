import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Icon, type IconName } from "../../components/shared/Icon";
import { RoleBadge } from "../../components/users/RoleBadge";
import { useAuth } from "../../hooks/useAuth";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { USER_ROLES } from "../../types/auth.types";
import { MAP_PATH } from "../../utils/map-url";
import { ROLE_INFO, hasAnyRole } from "../../utils/roles";
import "./HelpPage.css";

interface Topic {
  id: string;
  icon: IconName;
  title: string;
  adminOnly?: boolean;
  questions: { q: string; a: ReactNode }[];
}

const TOPICS: Topic[] = [
  {
    id: "start",
    icon: "map",
    title: "Getting started",
    questions: [
      {
        q: "What can I do here?",
        a: (
          <>
            Explore Nigeria's states, LGAs and wards on the <Link to={MAP_PATH}>map</Link>, look up any LGA or ward in{" "}
            <Link to="/places">Places</Link>, and see what your account is allowed to do on your{" "}
            <Link to="/account">profile</Link>. More data (rainfall, flood risk, alerts) appears as it is published.
          </>
        ),
      },
      {
        q: "How do I find a place quickly?",
        a: (
          <>
            Use the search box in the top bar, or press <kbd>Ctrl</kbd> + <kbd>K</kbd> (<kbd>⌘</kbd> + <kbd>K</kbd> on a
            Mac) or <kbd>/</kbd> from anywhere. Type part of an LGA or ward name and press Enter.
          </>
        ),
      },
      {
        q: "Why should I complete my profile?",
        a: "Administrators decide who gets staff access. Your name, organisation and job title tell them who you are, so they can approve you without chasing you for details.",
      },
    ],
  },
  {
    id: "map",
    icon: "layers",
    title: "Using the map",
    questions: [
      {
        q: "How do I see the LGAs and wards?",
        a: "Zoom in. The state outline shows first, LGAs appear as you zoom, and wards appear when you are close enough to read them. Use the layer switch to hide any of them.",
      },
      {
        q: "Which LGA or ward is this spot in?",
        a: "Click or tap anywhere on the map. A popup names the state, LGA and ward at that point, and the LGA is selected so you can open its profile.",
      },
      {
        q: "How do I find out where I am?",
        a: "Press \"Where am I?\" in the panel at the top of the map. Your browser asks for permission once; the map then zooms to you and names the LGA and ward. Your location isn't saved.",
      },
      {
        q: "Can I share what I'm looking at?",
        a: "Yes. The address in your browser keeps the view, the selected LGA and the visible layers. Copy it and anyone with an account opens the same view.",
      },
    ],
  },
  {
    id: "roles",
    icon: "shield",
    title: "Roles and access",
    questions: [
      {
        q: "What can each role do?",
        a: (
          <ul className="help-roles">
            {USER_ROLES.map((role) => (
              <li key={role}>
                <RoleBadge role={role} />
                <span>{ROLE_INFO[role].description}</span>
              </li>
            ))}
          </ul>
        ),
      },
      {
        q: "How do I get more access?",
        a: "Every new account starts as General Public. Ask an administrator in your organisation to raise your role. Responders and officials can also be limited to one LGA or ward.",
      },
      {
        q: "I can't see a page a colleague can see.",
        a: "Pages your role can't use are hidden. Check your role on your profile page, then ask an administrator if you need more.",
      },
    ],
  },
  {
    id: "account",
    icon: "lock",
    title: "Signing in and your account",
    questions: [
      {
        q: "I didn't get the verification email.",
        a: "It can take a few minutes; check your spam folder. On the sign-in page, enter your email and password and you'll be offered a new link.",
      },
      {
        q: "How do I change my password?",
        a: (
          <>
            Open your <Link to="/account">profile</Link> and press Change next to Password. We email you a secure link.
            Signed out? Use "Forgot password" on the sign-in page.
          </>
        ),
      },
      {
        q: "What happens when I'm offline?",
        a: "A banner at the top tells you. What's already on screen stays, but loading anything new waits until you're back online. Nothing you've saved is lost.",
      },
    ],
  },
  {
    id: "admin",
    icon: "database",
    title: "For administrators",
    adminOnly: true,
    questions: [
      {
        q: "In what order do I set up a new platform?",
        a: (
          <ol className="help-steps">
            <li>
              <Link to="/admin/countries/new">Add the country</Link> with its level names (e.g. State, LGA, Ward).
            </li>
            <li>
              <Link to="/admin/imports/new">Import</Link> the state outline (level 1), then the LGAs (level 2), then the
              wards (level 3).
            </li>
            <li>Review each import and promote it. Nothing goes live before it's promoted.</li>
            <li>
              <Link to="/admin/users">Give your team access</Link> by raising their roles.
            </li>
          </ol>
        ),
      },
      {
        q: "What happens to an import that has errors?",
        a: "Every file goes into staging first. Rows with errors are listed with the reason and never reach the live map. Fix the file and import it again, or promote only the rows that passed.",
      },
      {
        q: "How do I find a particular user?",
        a: "On the Users page, search by name, email or organisation, or filter by role. You can't change your own role, so another administrator has to do that.",
      },
    ],
  },
];

const SHORTCUTS: { keys: string[]; what: string }[] = [
  { keys: ["Ctrl", "K"], what: "Search places and pages" },
  { keys: ["/"], what: "Search, when you're not typing in a field" },
  { keys: ["Esc"], what: "Close a dialog, search or the menu" },
];

/** Plain-language answers to the questions people would otherwise ask a supervisor. */
export function HelpPage() {
  useDocumentTitle("Help");
  const { user } = useAuth();
  const isAdmin = user ? hasAnyRole(user.role, ["administrator"]) : false;
  const topics = TOPICS.filter((topic) => !topic.adminOnly || isAdmin);
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();

  const textOf = (node: ReactNode): string =>
    typeof node === "string" ? node : Array.isArray(node) ? node.map(textOf).join(" ") : "";
  const visible = topics
    .map((topic) => ({
      ...topic,
      questions: topic.questions.filter(
        (item) => !needle || `${item.q} ${textOf(item.a)} ${topic.title}`.toLowerCase().includes(needle),
      ),
    }))
    .filter((topic) => topic.questions.length > 0);

  return (
    <div className="page help-page" data-cy="help-page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Support</p>
          <h1 className="page__title">Help and guides</h1>
          <p className="page__lead">Short answers to common questions. Still stuck? Contact your organisation's administrator.</p>
        </div>
      </header>

      <div className="help-page__layout">
        <aside className="help-page__aside">
          <label className="toolbar__search help-page__search">
            <span className="visually-hidden">Search help</span>
            <Icon name="search" size={16} />
            <input
              type="search"
              className="field__input"
              placeholder="Search help"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              data-cy="help-search"
            />
          </label>
          <nav aria-label="Help topics">
            <ul className="help-toc">
              {topics.map((topic) => (
                <li key={topic.id}>
                  <a href={`#${topic.id}`}>
                    <Icon name={topic.icon} size={15} />
                    {topic.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <section className="card help-shortcuts" aria-labelledby="shortcuts-heading">
            <h2 id="shortcuts-heading" className="help-shortcuts__title">
              Keyboard shortcuts
            </h2>
            <dl>
              {SHORTCUTS.map((shortcut) => (
                <div key={shortcut.what}>
                  <dt>
                    {shortcut.keys.map((key) => (
                      <kbd key={key}>{key}</kbd>
                    ))}
                  </dt>
                  <dd>{shortcut.what}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>

        <div className="help-page__topics">
          {visible.length === 0 && (
            <p className="muted" role="status">
              Nothing matches "{filter.trim()}". Try a simpler word, like "password" or "import".
            </p>
          )}
          {visible.map((topic) => (
            <section key={topic.id} id={topic.id} className="card help-topic" aria-labelledby={`${topic.id}-title`}>
              <h2 id={`${topic.id}-title`} className="help-topic__title">
                <span className="help-topic__icon">
                  <Icon name={topic.icon} size={16} />
                </span>
                {topic.title}
              </h2>
              {topic.questions.map((item, index) => (
                <details key={item.q} className="help-item" open={Boolean(needle) || index === 0}>
                  <summary>{item.q}</summary>
                  <div className="help-item__answer">{item.a}</div>
                </details>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
