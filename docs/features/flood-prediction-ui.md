# Flood Prediction & Early-Warning UI (`client/src/`)

## 1. What was built
Four connected client surfaces bring flood forecasting and AI-assisted early warning to officials, researchers, responders, and (when enabled by an administrator) the public:
1. **LGA & Ward Profile Card (`FloodOutlookCard.tsx`):** Mounted on `LgaProfilePage.tsx` and `WardPage.tsx`, showing a toggle between the **Next 7 days** and **30-day seasonal** horizons, the `Modelled` badge, likelihood score (`0–100`), daily forecast bar chart (reusing `RainfallChart`), key risk driver bullets, AI narrative + preparedness actions, and a **"Draft alert for this LGA"** shortcut.
2. **Interactive Map Layer (`FloodPredictionLayer.tsx`):** Added `"Flood forecast (7-day)"` under the **Hazard** group in `LayerToggle` on `MapPage.tsx`, colouring LGAs by predicted flood likelihood (`normal`, `watch`, `warning`, `severe`) with a matching legend entry and provenance note.
3. **Early-Warning Banner & AI Alert Drafting (`AlertsPage.tsx` & `AlertFormDialog.tsx`):**
   - `AlertsPage.tsx` displays an early-warning callout banner when LGAs are forecast at `watch`, `warning`, or `severe` over the next 7 days without an active alert in force, with a **"Draft alert for flagged LGAs"** button.
   - `AlertFormDialog.tsx` includes a **"Draft from forecast with AI"** button that pre-fills `severity`, `title`, `message`, `actions`, and `durationHours` from the forecast and displays an attribution & caveats callout reminding the official to verify before issuing.
4. **Admin Configuration & Public Home Page (`ConfigurationPage.tsx` & `AlertsSection.tsx`):**
   - `FloodPredictionSettingsSection.tsx` lets administrators toggle `showPublicFloodOutlook`, select the public horizon (`7d` or `seasonal`), and refresh all LGA forecasts.
   - `AiSettingsSection.tsx` lets administrators configure and verify platform AI keys (Gemini, OpenAI, Anthropic, Ollama).
   - `AlertsSection.tsx` on the public landing page renders the **7-Day Flood Outlook (`Modelled`)** section below the National Alert Map whenever `showPublicFloodOutlook` is enabled.

## 2. How it works
- **Hooks & Caching (`useFloodPrediction.ts`, `useAi.ts`):** Uses `useLoader` and TanStack Query keys (`QUERY_KEYS.floodPrediction`, `QUERY_KEYS.ai`, `QUERY_KEYS.public`). Toggling public visibility or refreshing predictions invalidates both `QUERY_KEYS.floodPrediction` and `QUERY_KEYS.public` so the landing page updates immediately.
- **Map URL State (`map-url.ts`):** `"floodPrediction"` is included in `HAZARD_LAYER_IDS` and `OFF_BY_DEFAULT` so turning on the forecast layer writes `layers=...floodPrediction` to the URL for shareable map links without changing the default map view.

## 3. Resources to read
- [docs/flood-prediction.md](../flood-prediction.md) — Backend multi-factor scoring engine and API routes.
- [docs/features/flood-risk-overlay.md](flood-risk-overlay.md) — How hazard layers and profile cards are structured on the client.

## 4. Explain it like I'm new to this
Officials need to see where flooding is likely *before* the rain arrives, and act on it quickly. On any LGA or Ward page, the Flood Forecast card shows the next 7 days of expected rain and why that area is vulnerable. On the main map, switching on "Flood forecast (7-day)" colours each LGA from green (`Normal`) to red (`Severe`). On the Alerts page, a banner highlights any LGA that is forecast to flood but doesn't have an alert out yet—and with one click inside the alert form, AI drafts the warning text and safety actions for the official to review and publish.
