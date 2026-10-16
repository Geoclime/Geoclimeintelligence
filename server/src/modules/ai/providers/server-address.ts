export const OLLAMA_CLOUD = "https://ollama.com";

const PRIVATE_HOST =
  /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

/**
 * SSRF guard for an Ollama server address. The API server calls this address itself, so anyone
 * who can save a key could otherwise point it at our private network. `allowPrivate` is true
 * outside production, so a developer can use a local Ollama.
 */
export function checkServerAddress(raw: string, allowPrivate: boolean): { url: string } | { problem: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { problem: `Enter a full address, such as ${OLLAMA_CLOUD}` };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { problem: "The address must start with https://" };
  if (url.username || url.password) return { problem: "Leave the user name and password out of the address" };
  if (!allowPrivate) {
    if (url.protocol !== "https:") return { problem: "The address must start with https://" };
    if (PRIVATE_HOST.test(url.hostname)) return { problem: "That address is on a private network and can't be reached" };
  }
  return { url: `${url.origin}${url.pathname.replace(/\/+$/, "")}` };
}
