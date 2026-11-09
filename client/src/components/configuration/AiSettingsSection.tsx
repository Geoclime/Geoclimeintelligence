import { useState } from "react";
import { useAiStatus, usePlatformAiCredentials } from "../../hooks/useAi";
import { useToast } from "../../hooks/useToast";
import { errorMessage } from "../../transport/api-error";
import { AI_FEATURES, AI_PROVIDERS, type AiProviderId } from "../../types/ai.types";
import { Badge } from "../shared/Badge";
import { Button } from "../shared/Button";
import { Callout } from "../shared/Callout";
import { SelectField } from "../shared/SelectField";
import { TextField } from "../shared/TextField";

const DEFAULT_MODELS: Record<AiProviderId, string> = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  ollama: "llama3.2",
};

export function AiSettingsSection() {
  const { showToast } = useToast();
  const { status } = useAiStatus();
  const { credentials, save, activate, remove } = usePlatformAiCredentials();
  const [provider, setProvider] = useState<AiProviderId>("gemini");
  const [model, setModel] = useState(DEFAULT_MODELS.gemini);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const handleProviderChange = (next: AiProviderId) => {
    setProvider(next);
    setModel(DEFAULT_MODELS[next]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await save({
        provider,
        model: model.trim(),
        apiKey: apiKey.trim() || undefined,
        baseUrl: provider === "ollama" ? baseUrl.trim() || "http://localhost:11434" : null,
      });
      setApiKey("");
      showToast({ type: "success", message: "Platform AI provider configuration saved." });
    } catch (err) {
      showToast({ type: "error", message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card section-gap" aria-labelledby="ai-settings-title" data-cy="ai-settings-section">
      <div className="card__header">
        <div>
          <h2 id="ai-settings-title" className="card__title">
            AI provider &amp; flood intelligence
          </h2>
          <p className="card__subtitle">
            Connect Gemini, OpenAI, Anthropic, or Ollama for plain-language flood outlooks and AI-assisted alert drafting.
          </p>
        </div>
        {status && (
          <Badge tone={status.available ? "warning" : "neutral"}>
            {status.available ? `Active: ${status.providerLabel} (${status.model})` : "Deterministic mode (No AI key)"}
          </Badge>
        )}
      </div>

      <div className="card__body stack">
        {status && !status.storageReady && (
          <Callout tone="warning">
            <code>AI_KEYS_SECRET</code> is not set in the server environment, so encrypted API keys cannot be stored yet. Deterministic flood predictions remain fully active.
          </Callout>
        )}

        <div>
          <h3 className="rainfall-card__section-title">Enabled AI features</h3>
          <ul className="flood-outlook-card__drivers">
            {AI_FEATURES.map((feat) => (
              <li key={feat.id}>
                <strong>{feat.label}:</strong> {feat.description}
              </li>
            ))}
          </ul>
        </div>

        {credentials.length > 0 && (
          <div className="data-table__scroll">
            <table className="data-table" data-cy="ai-credentials-table">
              <thead>
                <tr>
                  <th scope="col">Provider</th>
                  <th scope="col">Model</th>
                  <th scope="col">Key</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {credentials.map((cred) => (
                  <tr key={cred.id}>
                    <td>{cred.providerLabel}</td>
                    <td className="mono">{cred.model}</td>
                    <td className="mono">{cred.keyHint || "Local"}</td>
                    <td>{cred.isActive ? <Badge tone="warning">Active</Badge> : <span className="muted">Standby</span>}</td>
                    <td>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        {!cred.isActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void activate(cred.provider).catch((err) => showToast({ type: "error", message: errorMessage(err) }))}
                          >
                            Activate
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void remove(cred.provider).catch((err) => showToast({ type: "error", message: errorMessage(err) }))}
                        >
                          Remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form onSubmit={handleSave} className="access-form" style={{ maxWidth: "36rem" }}>
          <SelectField
            label="AI Provider"
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as AiProviderId)}
            data-cy="ai-provider-select"
          >
            {AI_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </SelectField>

          <TextField
            label="Model ID"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="e.g. gemini-2.5-flash"
            required
            data-cy="ai-model-input"
          />

          {provider === "ollama" && (
            <TextField
              label="Ollama Server URL"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:11434"
              data-cy="ai-base-url-input"
            />
          )}

          <TextField
            label={provider === "ollama" ? "API Key (optional for local Ollama)" : "API Key"}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste provider API key"
            data-cy="ai-api-key-input"
          />

          <div>
            <Button type="submit" loading={saving} loadingLabel="Verifying & saving…" disabled={status?.storageReady === false} data-cy="save-ai-credential">
              Save &amp; verify AI provider
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
