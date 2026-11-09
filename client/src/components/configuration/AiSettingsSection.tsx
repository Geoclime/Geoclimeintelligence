import { useRef, useState } from "react";
import { QUERY_KEYS, SETTINGS_POLICY } from "../../cache/queryClient";
import { useAiStatus, usePlatformAiCredentials } from "../../hooks/useAi";
import { useLoader } from "../../hooks/useLoader";
import { useToast } from "../../hooks/useToast";
import { errorMessage } from "../../transport/api-error";
import { AI_FEATURES, AI_PROVIDERS, type AiModelOption, type AiProviderId } from "../../types/ai.types";
import { Badge } from "../shared/Badge";
import { Button } from "../shared/Button";
import { Callout } from "../shared/Callout";
import { SelectField } from "../shared/SelectField";
import { TextField } from "../shared/TextField";
import "./configuration.css";

const DEFAULT_MODELS: Record<AiProviderId, string> = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  ollama: "llama3.2",
};

/** The select's last entry: reveals a text box for a model ID the provider did not list. */
const CUSTOM_MODEL = "__custom__";

/** "Gemini 2.5 Flash (gemini-2.5-flash) · balanced": the name, the ID to save, and the provider's size hint. */
function modelLabel(m: AiModelOption): string {
  const name = m.label && m.label !== m.id ? `${m.label} (${m.id})` : m.id;
  return m.tier ? `${name} · ${m.tier}` : name;
}

export function AiSettingsSection() {
  const { showToast } = useToast();
  const { status } = useAiStatus();
  const { credentials, save, activate, remove, listModels } = usePlatformAiCredentials();
  const [provider, setProvider] = useState<AiProviderId>("gemini");
  const [chosenModel, setChosenModel] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [saving, setSaving] = useState(false);
  // Models listed with a key typed here and not saved yet.
  const [typedModels, setTypedModels] = useState<AiModelOption[] | null>(null);
  const [loadingTyped, setLoadingTyped] = useState(false);
  const [typedError, setTypedError] = useState<string | null>(null);
  const loadRequest = useRef(0);

  const saved = credentials.find((c) => c.provider === provider);
  // Until a model is picked, show the one saved for this provider, else the provider's default.
  const model = chosenModel ?? saved?.model ?? DEFAULT_MODELS[provider];
  const providerLabel = AI_PROVIDERS.find((p) => p.id === provider)?.label ?? provider;
  const serverUrl = provider === "ollama" ? baseUrl.trim() || "http://localhost:11434" : null;

  // With a key already saved for this provider the server lists the models itself; no key is typed.
  const savedModels = useLoader<AiModelOption[]>(
    saved ? [...QUERY_KEYS.ai, "models", provider, saved.id, saved.updatedAt] : null,
    () => listModels(provider),
    SETTINGS_POLICY,
  );
  // The loader keeps the previous answer on screen while the next loads: never show another provider's models.
  const savedList = saved && !savedModels.loading ? (savedModels.data ?? []) : [];
  const models = typedModels ?? savedList;
  const loadingModels = loadingTyped || (Boolean(saved) && savedModels.loading);
  const modelsError = typedError ?? (saved ? savedModels.error : null);
  const canLoadModels = Boolean(apiKey.trim()) || Boolean(saved) || provider === "ollama";

  // The saved or default model may not be in the provider's list; keep it selectable so the select is never blank.
  const options = models.map((m) => ({ id: m.id, text: modelLabel(m) }));
  if (!models.some((m) => m.id === model)) {
    options.unshift({ id: model, text: models.length > 0 ? `${model} (not in the provider's list)` : model });
  }

  let modelHint = "";
  if (loadingModels) modelHint = "Loading models from the provider…";
  else if (modelsError) modelHint = `Could not load the model list (${modelsError}). Choose “Other…” to type a model ID.`;
  else if (models.length > 0) modelHint = `${models.length} models available from ${providerLabel}.`;
  else if (!saved) modelHint = "Showing the default model. Enter your API key and load the provider's models to choose from the full list.";

  const handleProviderChange = (next: AiProviderId) => {
    loadRequest.current += 1; // a reply still on its way belongs to the old provider
    setProvider(next);
    setChosenModel(null);
    setCustomModel(false);
    setTypedModels(null);
    setTypedError(null);
    setLoadingTyped(false);
  };

  const handleModelSelect = (value: string) => {
    if (value === CUSTOM_MODEL) {
      setCustomModel(true);
      setChosenModel(model);
    } else {
      setCustomModel(false);
      setChosenModel(value);
    }
  };

  const handleLoadModels = async () => {
    const request = ++loadRequest.current;
    setLoadingTyped(true);
    setTypedError(null);
    try {
      const list = await listModels(provider, { apiKey: apiKey.trim() || undefined, baseUrl: serverUrl });
      if (request !== loadRequest.current) return;
      setTypedModels(list);
      if (list.length === 0) setTypedError(`${providerLabel} returned no chat models`);
    } catch (err) {
      if (request !== loadRequest.current) return;
      setTypedError(errorMessage(err));
    } finally {
      if (request === loadRequest.current) setLoadingTyped(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await save({
        provider,
        model: model.trim(),
        apiKey: apiKey.trim() || undefined,
        baseUrl: serverUrl,
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

        <form onSubmit={handleSave} className="ai-form">
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
            placeholder={saved ? "Saved. Leave blank to keep it" : "Paste provider API key"}
            data-cy="ai-api-key-input"
          />

          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleLoadModels()}
              loading={loadingTyped}
              loadingLabel="Loading models…"
              disabled={!canLoadModels}
              data-cy="ai-load-models"
            >
              {typedModels ? "Reload available models" : "Load available models"}
            </Button>
          </div>

          <SelectField
            label="Model"
            value={customModel ? CUSTOM_MODEL : model}
            onChange={(e) => handleModelSelect(e.target.value)}
            hint={modelHint}
            aria-busy={loadingModels}
            data-cy="ai-model-select"
          >
            {options.map((m) => (
              <option key={m.id} value={m.id}>
                {m.text}
              </option>
            ))}
            <option value={CUSTOM_MODEL}>Other… (type a model ID)</option>
          </SelectField>

          {customModel && (
            <TextField
              label="Model ID"
              value={model}
              onChange={(e) => setChosenModel(e.target.value)}
              placeholder={`e.g. ${DEFAULT_MODELS[provider]}`}
              required
              data-cy="ai-model-input"
            />
          )}

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
