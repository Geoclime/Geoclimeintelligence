import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import "../../../components/countries/countries.css";
import { Breadcrumbs } from "../../../components/shared/Breadcrumbs/Breadcrumbs";
import { Button, buttonClassName } from "../../../components/shared/Button";
import { EmptyState } from "../../../components/shared/EmptyState";
import { ErrorState } from "../../../components/shared/ErrorState";
import { Icon } from "../../../components/shared/Icon";
import { LoadingSpinner } from "../../../components/shared/LoadingSpinner";
import { Modal } from "../../../components/shared/Modal";
import { Pagination } from "../../../components/shared/Pagination";
import { TextField } from "../../../components/shared/TextField";
import { useAdminUnits } from "../../../hooks/useAdminUnits";
import { useClearLevel, useCountry, useDeleteCountry } from "../../../hooks/useCountries";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useToast } from "../../../hooks/useToast";
import { errorMessage } from "../../../transport/api-error";
import { parsePageParam } from "../../../utils/pagination";

const PAGE_SIZE = 50;

/**
 * One country: its levels with area counts, and the areas of the chosen level (?level=2&page=1 in
 * the URL). "Import areas" opens the import screen preset to this country and level. "Delete" is
 * only offered while the country holds no areas; the server enforces the same rule.
 */
export function CountryDetailPage() {
  const { code } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { country, loading, error, notFound, refetch } = useCountry(code);
  const level = Math.max(1, Number(searchParams.get("level")) || 1);
  const page = parsePageParam(searchParams.get("page"));
  const areas = useAdminUnits({ countryCode: country?.countryCode, level, page, pageSize: PAGE_SIZE, enabled: Boolean(country) });
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { remove, deleting } = useDeleteCountry();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { clear, clearing } = useClearLevel();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState("");
  useDocumentTitle(country?.countryName ?? "Country");

  if (loading && !country) return <LoadingSpinner message="Loading the country…" />;
  if (notFound) {
    return (
      <div className="page">
        <EmptyState icon="globe" title="No such country" message={`There's no country with code ${code}.`} />
      </div>
    );
  }
  if (error || !country) return <ErrorState message={error ?? "The country couldn't be loaded."} onRetry={refetch} />;

  const current = country.levels.find((l) => l.level === level) ?? country.levels[0]!;
  const parentLevel = country.levels.find((l) => l.level === current.level - 1);
  const importLink = (lvl: number) => `/admin/imports/new?country=${country.countryCode}&level=${lvl}`;
  const showLevel = (lvl: number) => setSearchParams({ level: String(lvl) });
  const areaTotal = country.levels.reduce((sum, l) => sum + l.unitCount, 0);
  const childLevel = country.levels.find((l) => l.level === current.level + 1);

  const openClear = () => {
    setClearConfirmText("");
    setConfirmingClear(true);
  };

  const handleClear = async () => {
    try {
      const deleted = await clear(country.countryCode, current.level);
      showToast({ type: "success", message: `${deleted.toLocaleString()} ${current.name} areas cleared.` });
    } catch (error) {
      showToast({ type: "error", message: errorMessage(error) });
    } finally {
      setConfirmingClear(false);
      refetch();
      areas.refetch();
    }
  };

  const handleDelete = async () => {
    try {
      await remove(country.countryCode);
      showToast({ type: "success", message: `${country.countryName} deleted.` });
      navigate("/admin/countries");
    } catch (error) {
      showToast({ type: "error", message: errorMessage(error) });
      setConfirmingDelete(false);
      refetch();
    }
  };

  return (
    <div className="page" data-cy="country-detail-page">
      <Breadcrumbs items={[{ label: "Countries", to: "/admin/countries" }, { label: country.countryName }]} />
      <header className="page__header">
        <div>
          <p className="page__eyebrow mono">{country.countryCode}</p>
          <h1 className="page__title">{country.countryName}</h1>
          <p className="page__lead">
            {country.bbox ? `Rough box: ${country.bbox.join(", ")}` : "No rough bounding box set: imports skip that check."}
          </p>
        </div>
        <div className="page__actions">
          <Link to={`/admin/countries/${country.countryCode}/edit`} className={buttonClassName({ variant: "secondary" })} data-cy="edit-country">
            <Icon name="edit" size={16} />
            <span>Edit</span>
          </Link>
          <Link to={importLink(current.level)} className={buttonClassName()} data-cy="import-areas">
            <Icon name="upload" size={16} />
            <span>Import areas</span>
          </Link>
          <Button
            variant="danger"
            icon={<Icon name="trash" size={16} />}
            disabled={areaTotal > 0}
            title={areaTotal > 0 ? "A country that holds areas can't be deleted" : undefined}
            onClick={() => setConfirmingDelete(true)}
            data-cy="delete-country"
          >
            Delete
          </Button>
        </div>
      </header>
      {areaTotal > 0 && (
        <p className="muted country-delete-note" data-cy="delete-blocked">
          {country.countryName} holds {areaTotal.toLocaleString()} areas, so it can't be deleted.
        </p>
      )}

      <div className="level-cards" data-cy="level-cards">
        {country.levels.map((l) => (
          <button
            key={l.level}
            type="button"
            className="card level-card"
            onClick={() => showLevel(l.level)}
            aria-pressed={l.level === current.level}
            data-cy={`level-card-${l.level}`}
          >
            <span className="stat__label">Level {l.level}</span>
            <span className="level-card__name">{l.name}</span>
            <span className={`level-card__count${l.unitCount === 0 ? " level-card__count--empty" : ""}`}>
              {l.unitCount > 0 ? `${l.unitCount.toLocaleString()} areas` : "None loaded yet"}
            </span>
          </button>
        ))}
      </div>

      <section className="card" aria-busy={areas.loading} aria-labelledby="areas-title">
        <div className="card__header">
          <div>
            <h2 id="areas-title" className="card__title">
              {current.name} areas
            </h2>
            <p className="card__subtitle">Names and codes only; open one to see its shape.</p>
          </div>
          <div className="page__actions">
            <Link to={importLink(current.level)} className={buttonClassName({ variant: "secondary", size: "sm" })}>
              Import {current.name} areas
            </Link>
            <Button
              variant="danger"
              size="sm"
              icon={<Icon name="trash" size={16} />}
              disabled={current.unitCount === 0 || Boolean(childLevel && childLevel.unitCount > 0)}
              onClick={openClear}
              data-cy="clear-level"
            >
              Clear {current.name} areas
            </Button>
          </div>
        </div>
        {current.unitCount > 0 && childLevel && childLevel.unitCount > 0 && (
          <p className="muted country-delete-note card__body" data-cy="clear-blocked">
            To clear the {current.name} areas, clear the {childLevel.unitCount.toLocaleString()} {childLevel.name} areas inside
            them first. Levels are cleared from the bottom up.
          </p>
        )}
        {areas.loading && areas.units.length === 0 ? (
          <LoadingSpinner message="Loading areas…" />
        ) : areas.error ? (
          <ErrorState message={areas.error} onRetry={areas.refetch} />
        ) : areas.units.length === 0 ? (
          <EmptyState
            icon="upload"
            title={`No ${current.name} areas yet`}
            message={parentLevel && parentLevel.unitCount === 0 ? `Import the ${parentLevel.name} areas first.` : "Import a file to add them."}
          />
        ) : (
          <>
            <div className="data-table__scroll">
              <table className="data-table" data-cy="area-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Code</th>
                    <th scope="col" className="data-table__numeric">
                      Areas inside
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {areas.units.map((unit) => (
                    <tr key={unit.id} data-cy="area-row">
                      <td className="data-table__lead">
                        <span className="data-table__primary">
                          {unit.level === 2 ? <Link to={`/places/${unit.id}`}>{unit.unitName}</Link> : unit.unitName}
                        </span>
                      </td>
                      <td data-label="Code" className="mono">
                        {unit.unitCode ?? <span className="muted">Not available</span>}
                      </td>
                      <td data-label="Areas inside" className="data-table__numeric">
                        {unit.childCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card__footer">
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={areas.total}
                hasPrev={areas.hasPrev}
                hasNext={areas.hasNext}
                onPageChange={(next) => setSearchParams({ level: String(current.level), page: String(next) })}
                itemLabel="areas"
                disabled={areas.loading}
              />
            </div>
          </>
        )}
      </section>

      <Modal
        open={confirmingDelete}
        title={`Delete ${country.countryName}?`}
        description="It has no areas yet, so nothing else is affected. Its past imports stay in the history."
        onClose={() => setConfirmingDelete(false)}
        dismissible={!deleting}
        dataCy="delete-country-dialog"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
              Keep it
            </Button>
            <Button variant="danger" loading={deleting} loadingLabel="Deleting…" onClick={() => void handleDelete()} data-cy="confirm-delete-country">
              Delete {country.countryCode}
            </Button>
          </>
        }
      />

      <Modal
        open={confirmingClear}
        title={`Clear all ${current.unitCount.toLocaleString()} ${current.name} areas?`}
        description={`They disappear from the map, the directory and every page that uses them. This can't be undone; to get them back, import the file again.`}
        onClose={() => setConfirmingClear(false)}
        dismissible={!clearing}
        dataCy="clear-level-dialog"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmingClear(false)} disabled={clearing}>
              Keep them
            </Button>
            <Button
              variant="danger"
              loading={clearing}
              loadingLabel="Clearing…"
              disabled={clearConfirmText.trim().toLowerCase() !== current.name.toLowerCase()}
              onClick={() => void handleClear()}
              data-cy="confirm-clear-level"
            >
              Clear {current.name} areas
            </Button>
          </>
        }
      >
        <div className="stack">
          <p>Past imports stay in the history, so you can see where these areas came from.</p>
          <TextField
            label={`Type ${current.name} to confirm`}
            value={clearConfirmText}
            onChange={(event) => setClearConfirmText(event.target.value)}
            autoComplete="off"
            data-cy="clear-level-confirm-input"
          />
        </div>
      </Modal>
    </div>
  );
}
