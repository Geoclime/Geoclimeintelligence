/**
 * Whether an error means "a service this server needs couldn't be reached", as opposed to a bug or a bad
 * request: the name of the database host didn't resolve (ENOTFOUND), the network dropped (ECONNRESET), the
 * connection timed out, or Postgres itself said it is shutting down or full. Such a failure is usually over
 * in a moment, so it is answered with 503 (which the web app retries for reads) rather than a 500 (which
 * it does not), and logged as a warning without a stack: it is not something to fix in the code.
 */

/** Node's names for a network that didn't deliver. */
const NETWORK_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "EPIPE", "ECONNABORTED"]);

/** Postgres SQLSTATE codes: class 08 is a connection exception; 57P01-57P03 the server is shutting down or can't accept connections; 53300 it has too many. */
const SERVER_UNAVAILABLE_STATES = new Set(["57P01", "57P02", "57P03", "53300"]);

/** What node-postgres says, in words, when a connection fails without a code. */
const CONNECTION_MESSAGES = [
  /connection terminated/i,
  /timeout exceeded when trying to connect/i,
  /client has encountered a connection error/i,
  /server closed the connection unexpectedly/i,
];

/** TypeORM wraps the driver's error (`driverError`), and Node's dual-stack connects gather several (`errors`). */
function candidates(err: unknown): Record<string, unknown>[] {
  if (typeof err !== "object" || err === null) return [];
  const own = err as Record<string, unknown>;
  const inner = [own.driverError, own.cause, ...(Array.isArray(own.errors) ? own.errors : [])];
  return [own, ...inner.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)];
}

/** The code that shows why (ENOTFOUND, 57P01...), or a short tag for a message-only failure; null when it isn't this kind of failure. */
export function unreachableReason(err: unknown): string | null {
  for (const item of candidates(err)) {
    const code = typeof item.code === "string" ? item.code : "";
    if (NETWORK_CODES.has(code) || SERVER_UNAVAILABLE_STATES.has(code) || code.startsWith("08")) return code;
    const message = typeof item.message === "string" ? item.message : "";
    if (CONNECTION_MESSAGES.some((pattern) => pattern.test(message))) return "connection-terminated";
  }
  return null;
}

export function isDatabaseUnreachable(err: unknown): boolean {
  return unreachableReason(err) !== null;
}

/** The host the failed lookup or connection was for, to say in the log which service it was. */
export function unreachableHost(err: unknown): string | undefined {
  for (const item of candidates(err)) {
    const host = item.hostname ?? item.address;
    if (typeof host === "string") return host;
  }
  return undefined;
}
