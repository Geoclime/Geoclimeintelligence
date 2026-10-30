import { logger } from "../../config/logger";

/**
 * Things that happened, which other parts of the platform react to (notifications, live updates).
 * Services announce them without knowing who listens, so a service never waits on, or fails
 * because of, an email or a push message. Listeners are registered once at startup
 * (server.ts); tests register none, so nothing is sent.
 */
export interface DomainEvents {
  "alert.issued": { alertId: string; issuerId: string };
  "alert.ended": { alertId: string };
  "report.submitted": { reportId: string; reporterId: string };
  "report.reviewed": { reportId: string; reviewerId: string };
  "role.requested": { userId: string };
  "role.answered": { userId: string; role: string; approved: boolean };
}

type Handler<K extends keyof DomainEvents> = (payload: DomainEvents[K]) => Promise<void> | void;

const handlers = new Map<keyof DomainEvents, Handler<keyof DomainEvents>[]>();

export const domainEvents = {
  on<K extends keyof DomainEvents>(name: K, handler: Handler<K>): void {
    handlers.set(name, [...(handlers.get(name) ?? []), handler as Handler<keyof DomainEvents>]);
  },

  /** Runs every listener in the background. A failing listener is logged; the caller never sees it. */
  emit<K extends keyof DomainEvents>(name: K, payload: DomainEvents[K]): void {
    for (const handler of handlers.get(name) ?? []) {
      Promise.resolve()
        .then(() => handler(payload))
        .catch((err: unknown) => logger.error({ err, event: name }, "A domain event listener failed"));
    }
  },

  /** For tests only. */
  clear(): void {
    handlers.clear();
  },
};
