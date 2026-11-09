import { AiSettingsSection } from "../../../components/configuration/AiSettingsSection";
import { DataSourcesSection } from "../../../components/configuration/DataSourcesSection";
import { FloodPredictionSettingsSection } from "../../../components/configuration/FloodPredictionSettingsSection";
import { Tabs, type TabItem } from "../../../components/shared/Tabs";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useTabParam } from "../../../hooks/useTabParam";

const TABS: TabItem[] = [
  { id: "data-sources", label: "Data sources", content: <DataSourcesSection />, dataCy: "config-tab-data-sources" },
  { id: "flood-forecast", label: "Flood forecast", content: <FloodPredictionSettingsSection />, dataCy: "config-tab-flood-forecast" },
  { id: "ai", label: "AI providers", content: <AiSettingsSection />, dataCy: "config-tab-ai" },
];
const TAB_IDS = TABS.map((tab) => tab.id);

/**
 * Platform settings for Administrators: data sources, flood forecast settings, and AI providers, one
 * tab each. The open tab lives in the URL (?tab=ai), so a refresh or a shared link keeps it.
 */
export function ConfigurationPage() {
  useDocumentTitle("Configuration");
  const [activeId, selectTab] = useTabParam(TAB_IDS);

  return (
    <div className="page" data-cy="configuration-page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Administration</p>
          <h1 className="page__title">Configuration</h1>
          <p className="page__lead">Settings that the rest of the platform builds on: data sources, flood forecasting, and AI providers.</p>
        </div>
      </header>
      <Tabs tabs={TABS} activeId={activeId} onChange={selectTab} ariaLabel="Configuration sections" />
    </div>
  );
}
