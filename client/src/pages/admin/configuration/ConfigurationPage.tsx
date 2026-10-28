import { DataSourcesSection } from "../../../components/configuration/DataSourcesSection";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";

/** Platform settings for Administrators. For now that is the data sources; more sections join here. */
export function ConfigurationPage() {
  useDocumentTitle("Configuration");

  return (
    <div className="page" data-cy="configuration-page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Administration</p>
          <h1 className="page__title">Configuration</h1>
          <p className="page__lead">Settings that the rest of the platform builds on. Data sources come first.</p>
        </div>
      </header>
      <DataSourcesSection />
    </div>
  );
}
