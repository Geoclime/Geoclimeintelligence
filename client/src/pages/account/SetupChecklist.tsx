import { Link } from "react-router";
import { Icon } from "../../components/shared/Icon";
import { useAuth } from "../../hooks/useAuth";
import { useCountries } from "../../hooks/useCountries";
import { useUsers } from "../../hooks/useUsers";

interface Step {
  title: string;
  text: string;
  to: string;
  done: boolean;
}

/**
 * Administrators only: the order a new platform is set up in, ticked off from live data, so a
 * new administrator can get from an empty database to a working map without a walkthrough.
 */
export function SetupChecklist() {
  const { user } = useAuth();
  const { countries, loading: countriesLoading } = useCountries();
  const { users, loading: usersLoading } = useUsers({ page: 1, pageSize: 100 });

  if (countriesLoading || usersLoading) return null;

  const levelCount = (level: number) =>
    countries.reduce((sum, country) => sum + (country.levels.find((l) => l.level === level)?.unitCount ?? 0), 0);
  const levelName = (level: number, fallback: string) =>
    countries[0]?.levels.find((l) => l.level === level)?.name ?? fallback;
  const hasStaff = users.some((account) => account.id !== user?.id && account.role !== "general_public");

  const steps: Step[] = [
    {
      title: "Add a country",
      text: "Its name, ISO code and level names, e.g. State, LGA, Ward.",
      to: "/admin/countries/new",
      done: countries.length > 0,
    },
    {
      title: `Import the ${levelName(1, "state").toLowerCase()} outline`,
      text: "Level 1 boundary file, then review and promote it.",
      to: "/admin/imports/new",
      done: levelCount(1) > 0,
    },
    {
      title: `Import the ${levelName(2, "LGA")}s`,
      text: "Level 2 boundaries. Each one is matched to its parent.",
      to: "/admin/imports/new",
      done: levelCount(2) > 0,
    },
    {
      title: `Import the ${levelName(3, "ward").toLowerCase()}s`,
      text: "Level 3 boundaries, so people can drill down on the map.",
      to: "/admin/imports/new",
      done: levelCount(3) > 0,
    },
    {
      title: "Give your team access",
      text: "Raise new accounts to responder, official or researcher.",
      to: "/admin/users",
      done: hasStaff,
    },
  ];

  const done = steps.filter((step) => step.done).length;
  if (done === steps.length) return null;
  const next = steps.find((step) => !step.done);

  return (
    <section className="card account-card setup-checklist" aria-labelledby="setup-title" data-cy="setup-checklist">
      <div className="account-card__header">
        <div>
          <h2 id="setup-title" className="account-card__title">
            Platform setup
          </h2>
          <p className="account-card__lead">
            {done} of {steps.length} steps done. This card disappears once everything is in place.
          </p>
        </div>
      </div>
      <ol className="setup-steps">
        {steps.map((step) => (
          <li key={step.title} className={`setup-step${step.done ? " is-done" : ""}${step === next ? " is-next" : ""}`}>
            <span className="setup-step__mark" aria-hidden="true">
              {step.done ? <Icon name="check" size={12} /> : null}
            </span>
            <div className="setup-step__body">
              {step.done ? (
                <span className="setup-step__title">{step.title}</span>
              ) : (
                <Link to={step.to} className="setup-step__title">
                  {step.title}
                </Link>
              )}
              {step === next && <span className="setup-step__text">{step.text}</span>}
            </div>
            <span className="visually-hidden">{step.done ? "Done" : "To do"}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
