import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../../config/env";
import { logger } from "../../config/logger";

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text version, for mail apps that don't show HTML. */
  text: string;
  html: string;
}

/** One way of sending email. */
interface EmailProvider {
  readonly name: "smtp" | "apps_script";
  send(message: EmailMessage): Promise<void>;
}

/** Sends email. Services depend on this, so tests use an in-memory fake. */
export interface IMailer {
  /** False when EMAIL_PROVIDER is none. */
  readonly enabled: boolean;
  send(message: EmailMessage): Promise<void>;
}

/** SMTP through Nodemailer: any mail service, e.g. Gmail with an app password. */
class SmtpProvider implements EmailProvider {
  readonly name = "smtp" as const;
  private readonly transport: Transporter;

  constructor() {
    this.transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }

  async send({ to, subject, text, html }: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: { name: env.EMAIL_FROM_NAME, address: env.EMAIL_FROM_ADDRESS },
      to,
      subject,
      text,
      html,
      ...(env.EMAIL_REPLY_TO ? { replyTo: env.EMAIL_REPLY_TO } : {}),
    });
  }
}

/**
 * A Google Apps Script web app that calls MailApp.sendEmail, posted as JSON (docs/email.md has the
 * script). The shared token, when set, is sent with every message and checked by the script, so
 * nobody else who learns the URL can send through it. Apps Script answers a POST with a redirect
 * to its result; fetch follows it.
 */
class AppsScriptProvider implements EmailProvider {
  readonly name = "apps_script" as const;

  async send({ to, subject, text, html }: EmailMessage): Promise<void> {
    const response = await fetch(env.EMAIL_APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        subject,
        body: text,
        htmlBody: html,
        name: env.EMAIL_FROM_NAME,
        ...(env.EMAIL_REPLY_TO ? { replyTo: env.EMAIL_REPLY_TO } : {}),
        ...(env.EMAIL_APPS_SCRIPT_TOKEN ? { token: env.EMAIL_APPS_SCRIPT_TOKEN } : {}),
      }),
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    const result = (await response.json().catch(() => null)) as { status?: string; message?: string } | null;
    if (!response.ok || result?.status !== "success") {
      throw new Error(`Apps Script didn't send the email: ${result?.message ?? `HTTP ${response.status}`}`);
    }
  }
}

/** The providers that have their settings filled in, the chosen one first. */
function configuredProviders(): EmailProvider[] {
  const smtp: EmailProvider | null = env.SMTP_HOST && env.EMAIL_FROM_ADDRESS ? new SmtpProvider() : null;
  const appsScript: EmailProvider | null = env.EMAIL_APPS_SCRIPT_URL ? new AppsScriptProvider() : null;
  if (env.EMAIL_PROVIDER === "none") return [];
  const [first, second] = env.EMAIL_PROVIDER === "smtp" ? [smtp, appsScript] : [appsScript, smtp];
  return [first, env.EMAIL_FALLBACK ? second : null].filter((p): p is EmailProvider => p !== null);
}

/**
 * Sends one email with the chosen provider (EMAIL_PROVIDER), and, if that fails and
 * EMAIL_FALLBACK is on, with the other one when it is configured. Rejects only if every provider
 * failed, so the outbox can retry later (email-outbox.ts).
 */
export class Mailer implements IMailer {
  private static _instance?: Mailer;
  static get Instance(): Mailer {
    return (this._instance ??= new Mailer(configuredProviders()));
  }

  readonly enabled: boolean;

  constructor(private readonly providers: EmailProvider[]) {
    this.enabled = providers.length > 0;
  }

  async send(message: EmailMessage): Promise<void> {
    let lastError: unknown = new Error("No email provider is configured");
    for (const [index, provider] of this.providers.entries()) {
      try {
        await provider.send(message);
        if (index > 0) logger.warn({ provider: provider.name }, "Email sent by the fallback provider");
        return;
      } catch (error) {
        lastError = error;
        logger.warn({ err: error, provider: provider.name }, "Email provider failed");
      }
    }
    throw lastError;
  }
}
