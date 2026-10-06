import { useNavigate, useParams } from "react-router";
import { CountryForm } from "../../../components/countries/CountryForm";
import { toCountryPatch, toNewCountry, type CountryFormValues } from "../../../components/countries/country-form.schema";
import { Breadcrumbs } from "../../../components/shared/Breadcrumbs/Breadcrumbs";
import { EmptyState } from "../../../components/shared/EmptyState";
import { ErrorState } from "../../../components/shared/ErrorState";
import { LoadingSpinner } from "../../../components/shared/LoadingSpinner";
import { useCountry, useSaveCountry } from "../../../hooks/useCountries";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useToast } from "../../../hooks/useToast";

/** /admin/countries/new and /admin/countries/:code/edit. */
export function CountryFormPage() {
  const { code } = useParams();
  const editing = Boolean(code);
  useDocumentTitle(editing ? "Edit country" : "Add country");
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { country, loading, error, notFound, refetch } = useCountry(code);
  const { save } = useSaveCountry();

  const handleSubmit = async (values: CountryFormValues) => {
    if (editing && country) {
      const patch = toCountryPatch(values, country);
      if (Object.keys(patch).length === 0) {
        navigate(`/admin/countries/${country.countryCode}`);
        return;
      }
      const saved = await save({ code: country.countryCode, patch });
      showToast({ type: "success", message: `${saved.countryName} updated.` });
      navigate(`/admin/countries/${saved.countryCode}`);
    } else {
      const saved = await save(toNewCountry(values));
      showToast({ type: "success", message: `${saved.countryName} created. Next, import its areas.` });
      navigate(`/admin/countries/${saved.countryCode}`);
    }
  };

  if (editing && loading && !country) return <LoadingSpinner message="Loading the country…" />;
  if (editing && notFound) {
    return (
      <div className="page">
        <EmptyState icon="globe" title="No such country" message={`There's no country with code ${code}.`} />
      </div>
    );
  }
  if (editing && (error || !country)) return <ErrorState message={error ?? "The country couldn't be loaded."} onRetry={refetch} />;

  return (
    <div className="page" data-cy="country-form-page">
      <Breadcrumbs
        items={[
          { label: "Countries", to: "/admin/countries" },
          ...(country ? [{ label: country.countryName, to: `/admin/countries/${country.countryCode}` }] : []),
          { label: editing ? "Edit" : "Add country" },
        ]}
      />
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Administration</p>
          <h1 className="page__title">{editing ? `Edit ${country?.countryName}` : "Add a country"}</h1>
          <p className="page__lead">
            {editing
              ? "Rename the country or its levels, add a level, or set its rough bounding box."
              : "Name the country and its levels. Its areas are loaded afterwards on the import screen."}
          </p>
        </div>
      </header>
      <CountryForm
        key={country?.updatedAt ?? "new"}
        country={editing ? (country ?? null) : null}
        onSubmit={handleSubmit}
        onCancel={() => navigate(editing && country ? `/admin/countries/${country.countryCode}` : "/admin/countries")}
      />
    </div>
  );
}
