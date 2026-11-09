# Flood Prediction & AI Synthesis (`server/src/modules/flood-prediction`)

## 1. What was built
The platform can now predict future flood likelihood across Local Government Areas (LGAs) and Wards over both a **short-term 7-day horizon** (`7d`) and a **30-day seasonal horizon** (`seasonal`), and synthesize plain-language outlooks and official alert drafts using AI:
- **Database Migration (`1793500000000-CreateAiAndFloodPredictions.ts`):**
  - `ai_credentials` and `ai_usage_logs` for AES-256-GCM encrypted AI provider keys (Google Gemini, OpenAI, Anthropic, Ollama) and token usage auditing.
  - `flood_predictions` storing per-area, per-horizon predictions (`risk_level`, `likelihood_score`, `forecast_rainfall_mm`, `peak_daily_rainfall_mm`, `river_discharge_m3s`, `daily_forecast`, `drivers`, AI narrative fields, and `data_type = 'MODELLED'`).
  - `platform_settings` singleton row controlling whether the modelled flood outlook is exposed on the public landing page (`show_public_flood_outlook`, default `false`).
- **AI Foundation Completion (`server/src/modules/ai/`):**
  - Connected native `fetch` adapters for Gemini, OpenAI, Anthropic, and Ollama, plus `AiCredentialService`, `AiRepository`, `AiService.generateJson` (with schema validation and one automatic repair retry), and `/api/v1/ai` routes.
- **Multi-Factor Flood Prediction Engine (`server/src/modules/flood-prediction/`):**
  - `OpenMeteoForecastFetcher`: queries Open-Meteo 7-day daily precipitation and GloFAS v4 river discharge for each area's centroid, with a deterministic Rivers State seasonal climatology fallback when offline.
  - `computeFloodPrediction`: deterministic 0–100 scorer combining forecast rainfall (35%), river discharge anomaly (15%), terrain susceptibility from `FloodRiskService` (20%), blocked/damaged drainage ratio from `DrainageService` (15%), and ground saturation / active floods from `FloodExtentService` + `RainfallService` (15%).
  - `FloodPredictionService` and `/api/v1/flood-predictions` + `/api/v1/public/flood-outlook` endpoints.

## 2. How it works
1. **Deterministic Scoring First:** Every prediction is computed deterministically by `computeFloodPrediction` in `prediction-scorer.ts` and tagged `data_type = 'MODELLED'`. The platform never depends on an LLM to calculate risk scores or classify an LGA into `normal`, `watch`, `warning`, or `severe`.
2. **Untrusted Data Fencing & AI Synthesis:** When an official or researcher requests an AI narrative (`POST /api/v1/flood-predictions/areas/:adminUnitId/ai-outlook`) or drafts an alert from the forecast (`POST /api/v1/flood-predictions/draft-alert`), all database strings are sanitized via `inert()` and wrapped in XML tags (`<area_context>`, `<forecast_data>`, `<susceptibility>`, `<drainage_status>`, `<flood_history>`, `<seasonal_baseline>`).
3. **Human-in-the-Loop Alert Drafting:** `draftAlert` returns a structured `AlertDraftDto` (`severity`, `title`, `message`, `actions`, `suggestedDurationHours`, `caveats`) that pre-fills the client's `AlertFormDialog` for human review—never auto-issuing a public alert.

## 3. Resources to read
- [docs/ai-integration.md](ai-integration.md) — AI provider contract, key encryption (`seal`/`open`), and lenient Zod parsing.
- [docs/rainfall.md](rainfall.md) — Daily and monthly rainfall thresholds in Rivers State.
- [docs/flood-risk.md](flood-risk.md) — Terrain susceptibility classes (`percentHighOrVeryHigh`).

## 4. Explain it like I'm new to this
Heavy rain alone doesn't tell you whether a neighbourhood will flood: 50 mm of rain over high ground with clear drains runs off safely, while the same 50 mm over low-lying land with blocked drains and an already high river causes flooding. The prediction engine checks five things for each area—the next 7 days of rain, the river flow forecast, how low-lying the land is, how many local drains are blocked, and whether floodwater is still on the ground—and combines them into a single 0–100 score and a clear level (`Normal`, `Watch`, `Warning`, or `Severe`). If an AI key is connected, the AI turns those numbers into a plain-English summary and a draft alert that an official can check and publish.
