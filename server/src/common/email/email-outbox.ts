import { AppDataSource } from "../../config/data-source";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { Mailer, type EmailMessage, type IMailer } from "./mailer";

/** How often the worker looks for emails to send. */
export const TICK_MS = 10_000;
/** After this many failed tries an email is marked failed and left alone. */
export const MAX_ATTEMPTS = 6;
/** Minutes to wait before try 2, 3, 4...: about 1, 4, 15, 60 and 240 minutes. */
const BACKOFF_MINUTES = [1, 4, 15, 60, 240];

/** Queues and sends email. Services depend on this, so tests use an in-memory fake. */
export interface IEmailOutbox {
  readonly enabled: boolean;
  enqueue(messages: EmailMessage[]): Promise<void>;
}

/**
 * The email outbox (table email_outbox). Notifications queue emails here instead of sending them
 * on the spot, and a worker in this process sends up to EMAIL_MAX_PER_TICK every ten seconds.
 * A failed email is retried with growing gaps, then marked failed. Rows are claimed with
 * FOR UPDATE SKIP LOCKED, so two API instances would never send the same email twice.
 */
export class EmailOutbox implements IEmailOutbox {
  private static _instance?: EmailOutbox;
  static get Instance(): EmailOutbox {
    return (this._instance ??= new EmailOutbox(Mailer.Instance));
  }

  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly mailer: IMailer) {}

  get enabled(): boolean {
    return this.mailer.enabled;
  }

  async enqueue(messages: EmailMessage[]): Promise<void> {
    if (!this.enabled || messages.length === 0) return;
    await AppDataSource.query(
      `INSERT INTO email_outbox (to_address, subject, text_body, html_body)
       SELECT * FROM unnest($1::varchar[], $2::varchar[], $3::text[], $4::text[])`,
      [messages.map((m) => m.to), messages.map((m) => m.subject.slice(0, 300)), messages.map((m) => m.text), messages.map((m) => m.html)],
    );
  }

  /** Starts the worker. Called once at startup (server.ts); does nothing when email is off. */
  start(): void {
    if (!this.enabled || this.timer) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    logger.info({ provider: env.EMAIL_PROVIDER, perTick: env.EMAIL_MAX_PER_TICK }, "Email outbox worker started");
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Sends the emails that are due, at most EMAIL_MAX_PER_TICK. Never overlaps itself. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // A CTE, so the driver returns plain rows rather than UPDATE's [rows, count] pair.
      const due: { id: string; to: string; subject: string; text: string; html: string; attempts: number }[] = await AppDataSource.query(
        `WITH claimed AS (
           UPDATE email_outbox SET attempts = attempts + 1
            WHERE id IN (
              SELECT id FROM email_outbox WHERE status = 'pending' AND next_attempt_at <= now()
               ORDER BY next_attempt_at LIMIT $1 FOR UPDATE SKIP LOCKED)
            RETURNING id, to_address, subject, text_body, html_body, attempts)
         SELECT id, to_address AS "to", subject, text_body AS text, html_body AS html, attempts FROM claimed`,
        [env.EMAIL_MAX_PER_TICK],
      );

      for (const email of due) {
        try {
          await this.mailer.send(email);
          await AppDataSource.query(`UPDATE email_outbox SET status = 'sent', sent_at = now(), last_error = NULL WHERE id = $1`, [email.id]);
        } catch (error) {
          const giveUp = email.attempts >= MAX_ATTEMPTS;
          const waitMinutes = BACKOFF_MINUTES[Math.min(email.attempts - 1, BACKOFF_MINUTES.length - 1)]!;
          await AppDataSource.query(
            `UPDATE email_outbox SET status = $2, last_error = $3, next_attempt_at = now() + make_interval(mins => $4) WHERE id = $1`,
            [email.id, giveUp ? "failed" : "pending", String(error instanceof Error ? error.message : error).slice(0, 1000), waitMinutes],
          );
          if (giveUp) logger.error({ err: error, emailId: email.id }, "Email failed for good after every retry");
        }
      }
    } catch (error) {
      logger.error({ err: error }, "Email outbox tick failed");
    } finally {
      this.running = false;
    }
  }
}
