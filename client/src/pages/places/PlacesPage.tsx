import { useState } from "react";
import { Link } from "react-router";
import { EmptyState } from "../../components/shared/EmptyState";
import { ErrorState } from "../../components/shared/ErrorState";
import { Icon } from "../../components/shared/Icon";
import { LoadingSpinner } from "../../components/shared/LoadingSpinner";
import { useAdminUnits } from "../../hooks/useAdminUnits";
import { useDebounce } from "../../hooks/useDebounce";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";

/**
 * The LGA directory: a searchable list of Rivers State's LGAs, each with its ward count, linking
 * to its profile. The search is debounced 300 ms and runs on the server (name contains).
 */
export function PlacesPage() {
  useDocumentTitle("Places");
  const [query, setQuery] = useState("");
  const q = useDebounce(query.trim(), 300);
  const { units, loading, error, total, refetch } = useAdminUnits({ level: 2, q, pageSize: 100 });

  const renderBody = () => {
    if (loading && units.length === 0) return <LoadingSpinner message="Loading LGAs…" />;
    if (error) return <ErrorState message={error} onRetry={refetch} />;
    if (units.length === 0) {
      return q ? (
        <EmptyState icon="search" title="No matching LGA" message={`No LGA name contains "${q}".`} />
      ) : (
        <EmptyState icon="pin" title="No LGAs loaded yet" message="LGA boundaries appear here once an administrator imports and promotes them." />
      );
    }
    return (
      <div className="data-table__scroll">
        <table className="data-table" data-cy="lga-table">
          <caption className="visually-hidden">Local government areas</caption>
          <thead>
            <tr>
              <th scope="col">LGA</th>
              <th scope="col">Code</th>
              <th scope="col" className="data-table__numeric">
                Wards
              </th>
              <th scope="col">
                <span className="visually-hidden">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {units.map((lga) => (
              <tr key={lga.id} data-cy="lga-row">
                <td className="data-table__lead">
                  <span className="data-table__primary">
                    <Link to={`/places/${lga.id}`}>{lga.unitName}</Link>
                  </span>
                </td>
                <td data-label="Code">{lga.unitCode ?? <span className="muted">Not available</span>}</td>
                <td data-label="Wards" className="data-table__numeric">
                  {lga.childCount > 0 ? lga.childCount : <span className="muted">Not loaded</span>}
                </td>
                <td className="data-table__actions">
                  <Link to={`/places/${lga.id}`} aria-label={`Open ${lga.unitName}`}>
                    <Icon name="chevronRight" size={18} />
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
    <div className="page" data-cy="places-page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Places</p>
          <h1 className="page__title">Local government areas</h1>
          <p className="page__lead">Every LGA in Rivers State, with its wards. Open one for its map, code and data source.</p>
        </div>
      </header>

      <section className="card" aria-busy={loading} aria-label="LGA directory">
        <div className="toolbar">
          <label className="toolbar__search">
            <span className="visually-hidden">Search LGAs</span>
            <Icon name="search" size={18} />
            <input
              type="search"
              className="field__input"
              placeholder="Search by name, e.g. Obio"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              data-cy="lga-search"
            />
          </label>
          {total > 0 && (
            <p className="toolbar__meta" aria-live="polite">
              {total} {total === 1 ? "LGA" : "LGAs"}
            </p>
          )}
        </div>
        {renderBody()}
      </section>
    </div>
  );
}
