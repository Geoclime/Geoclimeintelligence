import "./commands";

// Safety net for standard section 21: any request to the API that a spec forgot to stub fails
// loudly with a 599 instead of silently reaching for a server. Registered first, so every
// cy.interceptApi() in a spec takes precedence over it.
beforeEach(() => {
  cy.intercept({ url: "**/api/v1/**" }, { statusCode: 599, body: { success: false, data: null, message: "Unstubbed API call in an e2e spec" } });
  cy.intercept({ url: /googleapis\.com|firebaseapp\.com/ }, { forceNetworkError: true });
});
