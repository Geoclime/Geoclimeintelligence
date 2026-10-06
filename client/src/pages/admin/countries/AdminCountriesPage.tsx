import { Link } from "react-router";
import "../../../components/countries/countries.css";
import { buttonClassName } from "../../../components/shared/Button";
import { EmptyState } from "../../../components/shared/EmptyState";
import { ErrorState } from "../../../components/shared/ErrorState";
import { Icon } from "../../../components/shared/Icon";
import { LoadingSpinner } from "../../../components/shared/LoadingSpinner";
import { useCountries } from "../../../hooks/useCountries";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";

/** Every country, its levels, and how many areas each level holds. */
export function AdminCountriesPage() {
  useDocumentTitle("Countries");
  const { countries, loading, error, refetch } = useCountries();

  const addButton = (
    <Link to="/admin/countries/new" className={buttonClassName()} data-cy="add-country">
      <Icon name="plus" size={16} />
      <span>Add country</span>
    </Link>
  );

  const renderBody = () => {
    if (loading && countries.length === 0) return <LoadingSpinner message="Loading countries…" />;
    if (error) return <ErrorState message={error} onRetry={refetch} />;
    if (countries.length === 0) {
      return (
        <EmptyState
          icon="globe"
          title="No countries yet"
          message="Start with Nigeria: code NGA, levels State, LGA and Ward. Then import its boundaries."
          action={addButton}
        />
      );
    }
    return (
      <div className="data-table__scroll">
        <table className="data-table" data-cy="country-table">
          <caption className="visually-hidden">Countries</caption>
          <thead>
            <tr>
              <th scope="col">Country</th>
              <th scope="col">Levels and areas</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {countries.map((country) => (
              <tr key={country.countryCode} data-cy="country-row">
                <td className="data-table__lead">
                  <span className="data-table__primary">
                    <Link to={`/admin/countries/${country.countryCode}`}>{country.countryName}</Link>
                  </span>
                  <span className="data-table__secondary mono">{country.countryCode}</span>
                </td>
                <td data-label="Levels">
                  <span className="chip-row">
                    {country.levels.map((level) => (
                      <span key={level.level} className="level-chip">
                        {level.name} <strong>{level.unitCount.toLocaleString()}</strong>
                      </span>
                    ))}
                  </span>
                </td>
                <td className="data-table__actions">
                  <Link to={`/admin/countries/${country.countryCode}/edit`} className={buttonClassName({ variant: "ghost", size: "sm" })}>
                    <Icon name="edit" size={16} />
                    <span>Edit</span>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="page" data-cy="admin-countries-page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Administration</p>
          <h1 className="page__title">Countries</h1>
          <p className="page__lead">
            Each country's administrative levels. Areas aren't typed in here: they arrive through the import screen.
          </p>
        </div>
        {countries.length > 0 && addButton}
      </header>
      <section className="card" aria-busy={loading} aria-label="Countries">
        {renderBody()}
      </section>
    </div>
  );
}
