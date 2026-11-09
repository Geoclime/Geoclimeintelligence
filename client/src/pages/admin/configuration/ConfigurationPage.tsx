import { AiSettingsSection } from "../../../components/configuration/AiSettingsSection";
import { DataSourcesSection } from "../../../components/configuration/DataSourcesSection";
import { FloodPredictionSettingsSection } from "../../../components/configuration/FloodPredictionSettingsSection";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";

/** Platform settings for Administrators: data sources, flood forecast settings, and AI providers. */
export function ConfigurationPage() {
  useDocumentTitle("Configuration");

  return (
    <div className="page" data-cy="configuration-page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Administration</p>
          <h1 className="page__title">Configuration</h1>
          <p className="page__lead">Settings that the rest of the platform builds on: data sources, flood forecasting, and AI providers.</p>
        </div>
      </header>
      <DataSourcesSection />
      <FloodPredictionSettingsSection />
      <AiSettingsSection />
    </div>
  );
}
