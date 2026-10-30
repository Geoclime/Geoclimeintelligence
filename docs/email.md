# Email

## What was built

The platform emails notifications (flood alerts, report updates, access changes: [notifications.md](notifications.md)) through one of two providers, chosen with `EMAIL_PROVIDER`:

| Provider | Setting | Good for |
|---|---|---|
| `smtp` | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM_ADDRESS` | Any mail service: Gmail (with an app password), Brevo, SendGrid, Resend, Mailgun |
| `apps_script` | `EMAIL_APPS_SCRIPT_URL`, `EMAIL_APPS_SCRIPT_TOKEN` | A Google account's own Gmail, through a small Apps Script web app (below) |
| `none` | | Email off (the default) |

- With `EMAIL_FALLBACK=true` (the default), if the chosen provider fails the other is tried, when its settings are filled in.
- `EMAIL_FROM_NAME` is the sender name people see.
- `EMAIL_REPLY_TO`, if set, is where replies go.

The server refuses to start if the chosen provider is missing its settings, and says which ones.

## How it works

**1. An outbox, not sending on the spot.** A notification queues its emails in the `email_outbox` table and returns at once (`common/email/email-outbox.ts`). A worker in the API process wakes every 10 seconds and sends up to `EMAIL_MAX_PER_TICK` (default 30). So:
- an alert to hundreds of people never slows down the official issuing it;
- it never sends hundreds of emails in a burst, which providers throttle or block.

**2. Retries.**
- A failed email is tried again after about 1, 4, 15, 60 and 240 minutes, then marked `failed` with its last error.
- Rows are claimed with `FOR UPDATE SKIP LOCKED`, so even two API instances never send one email twice.

To see what's stuck:
```sql
SELECT status, count(*) FROM email_outbox GROUP BY status;
SELECT to_address, subject, attempts, last_error FROM email_outbox WHERE status = 'failed' ORDER BY created_at DESC LIMIT 20;
```

**3. The email itself** (`common/email/notification-email.ts`):
- a plain branded layout with one button into the app (`APP_URL` + the notification's link);
- the emergency number;
- a footer saying why it was sent, with a link to the person's notification settings;
- a plain-text version for mail apps that don't show HTML.

**4. Limits to know.**
- Apps Script: about 100 emails a day on a free Google account, 1,500 on Google Workspace.
- Gmail SMTP: about 500 a day.
- For a state-wide alert, use a transactional service (Brevo, SendGrid, Resend) through `smtp`.

## The Apps Script web app

1. Open https://script.google.com, create a project, and paste the script below.
2. In the script, change `DEFAULT_SENDER_NAME` if you like. Under Project Settings → Script Properties, add `TOKEN` with a long random value, and put the same value in `EMAIL_APPS_SCRIPT_TOKEN`.
3. Deploy → New deployment → Web app. Execute as: *Me*; Who has access: *Anyone*. Copy the URL ending in `/exec` into `EMAIL_APPS_SCRIPT_URL`.
4. Set `EMAIL_PROVIDER=apps_script`.

The token check matters. Without it, anyone who learns the URL could send email from your Google account.

```javascript
/**
 * Web App: send an email from a JSON POST request.
 * Expected JSON body:
 *   { "to": "...", "subject": "...", "htmlBody": "...", "body": "...",
 *     "name": "(optional) sender display name", "replyTo": "(optional) reply address",
 *     "token": "(required when the TOKEN script property is set)" }
 */
var DEFAULT_SENDER_NAME = "GeoClime Intelligence";

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    var expected = PropertiesService.getScriptProperties().getProperty("TOKEN");
    if (expected && data.token !== expected) {
      throw new Error("Not allowed.");
    }
    if (!data.to || !data.subject) {
      throw new Error("Both 'to' and 'subject' are required.");
    }

    var options = { to: data.to, subject: data.subject, body: data.body || "", name: data.name || DEFAULT_SENDER_NAME };
    if (data.htmlBody) options.htmlBody = data.htmlBody;
    if (data.replyTo) options.replyTo = data.replyTo;

    MailApp.sendEmail(options);
    return jsonResponse({ status: "success", to: data.to });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
```

The server posts `{ to, subject, body, htmlBody, name, replyTo, token }` and treats anything but `"status": "success"` as a failure to retry.

## Resources to read

- Nodemailer, "SMTP transport": https://nodemailer.com/smtp/
- Google, "Gmail app passwords": https://support.google.com/accounts/answer/185833
- Google Apps Script, "MailApp" and its quotas: https://developers.google.com/apps-script/reference/mail/mail-app

## Explain it like I'm new to this

Think of a post room. When something happens, the platform doesn't run to the post office with each letter. It drops them in a tray (the outbox) and gets on with its work. A clerk empties a few letters from the tray every ten seconds and posts them. If the post office is shut, the clerk tries again later, waiting a bit longer each time. And you choose which post office to use: your own Gmail through a small script, or a proper mail service.
