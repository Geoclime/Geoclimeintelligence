import "./commands";

// Safety net for standard section 21: any request to the API that a spec forgot to stub fails
// loudly with a 599 instead of silently reaching for a server. Registered first, so every
// cy.interceptApi() in a spec takes precedence over it.
beforeEach(() => {
  cy.intercept({ url: "**/api/v1/**" }, { statusCode: 599, body: { success: false, data: null, message: "Unstubbed API call in an e2e spec" } });
  cy.intercept({ url: /googleapis\.com|firebaseapp\.com/ }, { forceNetworkError: true });
  // Mapbox: never a live call. Tiles, fonts and telemetry get an empty reply; the base style is
  // a one-layer local fixture, so the map still starts and draws the stubbed boundary layers.
  cy.intercept({ url: /mapbox\.com/ }, { statusCode: 204, body: "" });
  cy.intercept({ url: /api\.mapbox\.com\/styles\// }, { fixture: "map/style.json" });
});
