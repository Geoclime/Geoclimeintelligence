import { env } from "../../config/env";
import type { EmailMessage } from "./mailer";

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

interface NotificationEmailInput {
  to: string;
  name: string | null;
  title: string;
  body: string;
  /** A path in the app, e.g. "/alerts". */
  link: string | null;
  /** What the notification is about, for the "why you're getting this" line. */
  reason: string;
}

/**
 * A notification as an email: the platform's colours, the message, one button into the app, and a
 * footer saying why it was sent and where to turn such emails off. Table layout and inline styles,
 * because many mail apps ignore stylesheets.
 */
export function notificationEmail({ to, name, title, body, link, reason }: NotificationEmailInput): EmailMessage {
  const url = link ? `${env.APP_URL}${link}` : env.APP_URL;
  const settingsUrl = `${env.APP_URL}/notifications#settings`;
  const greeting = name ? `Hello ${name},` : "Hello,";

  const text = [greeting, "", title, "", body, "", `Open GeoClime Intelligence: ${url}`, "", `You're getting this because ${reason}.`, `Change which emails you get: ${settingsUrl}`].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f7f7;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f1f20">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #d4e0e0;border-radius:12px;overflow:hidden">
<tr><td style="background:#063c3e;padding:18px 24px;color:#ffffff;font-size:16px;font-weight:700">GeoClime <span style="color:#5cc6c9;font-weight:600">Intelligence</span></td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 12px;font-size:14px;color:#4a5e60">${escape(greeting)}</p>
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${escape(title)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4a5e60;white-space:pre-line">${escape(body)}</p>
<a href="${escape(url)}" style="display:inline-block;background:#0e6b6f;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px">Open GeoClime Intelligence</a>
<p style="margin:20px 0 0;font-size:13px;color:#b42318">If anyone is in danger, call 112.</p>
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #d4e0e0;font-size:12px;line-height:1.5;color:#6b7f81">
You're getting this because ${escape(reason)}. <a href="${escape(settingsUrl)}" style="color:#0e6b6f">Change which emails you get</a>.
</td></tr>
</table></td></tr></table></body></html>`;

  return { to, subject: title, text, html };
}
