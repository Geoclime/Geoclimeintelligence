import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { Button } from "../shared/Button";
import { Icon } from "../shared/Icon";

/**
 * Shown on every signed-in screen until the account's email is verified. An administrator relies
 * on verified emails before granting staff access, and the first-administrator bootstrap only
 * accepts a verified address.
 */
export function VerifyEmailBanner() {
  const { user, session, sendEmailVerification } = useAuth();
  const { showToast } = useToast();
  const [sending, setSending] = useState(false);
  if (!user || !session || session.emailVerified) return null;

  const resend = async () => {
    setSending(true);
    try {
      await sendEmailVerification();
      showToast({ type: "success", message: `Verification email sent to ${user.email ?? "your inbox"}.` });
    } catch (error) {
      showToast({ type: "error", message: error instanceof Error ? error.message : "Couldn't send the email." });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="verify-banner" role="status" data-cy="verify-email-notice">
      <Icon name="mail" size={16} />
      <p className="verify-banner__text">
        <strong>Verify your email address.</strong> We sent a link to {user.email ?? "your email"}.
      </p>
      <Button variant="secondary" size="sm" loading={sending} onClick={() => void resend()}>
        Resend link
      </Button>
    </div>
  );
}
