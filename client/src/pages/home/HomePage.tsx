import { useState } from "react";
import { Link } from "react-router";
import { buttonClassName, Button } from "../../components/shared/Button";
import { Callout } from "../../components/shared/Callout";
import { EmptyState } from "../../components/shared/EmptyState";
import { Icon } from "../../components/shared/Icon";
import { AccessSummary } from "../../components/users/AccessSummary";
import { useAuth } from "../../hooks/useAuth";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useToast } from "../../hooks/useToast";
import { hasAnyRole } from "../../utils/roles";
import "./HomePage.css";

/**
 * The signed-in landing page. Phase 1 has no climate or disaster data yet, so it shows the
 * user's access and an honest empty state where the map will go, never sample data (rule 19.4).
 */
export function HomePage() {
  useDocumentTitle("Overview");
  const { user, session, sendEmailVerification } = useAuth();
  const { showToast } = useToast();
  const [sending, setSending] = useState(false);
  if (!user) return null;

  const firstName = user.displayName?.split(" ")[0];
  const isAdmin = hasAnyRole(user.role, ["administrator"]);

  const resendVerification = async () => {
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
    <div className="page home-page" data-cy="home-page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Overview</p>
          <h1 className="page__title">{firstName ? `Welcome, ${firstName}` : "Welcome"}</h1>
          <p className="page__lead">Your account and what it can do on the platform.</p>
        </div>
      </header>

      {session && !session.emailVerified && (
        <div className="home-page__notice">
          <Callout
            tone="warning"
            title="Verify your email address"
            dataCy="verify-email-notice"
            action={
              <Button variant="secondary" size="sm" loading={sending} onClick={() => void resendVerification()}>
                Resend link
              </Button>
            }
          >
            We sent a link to {user.email ?? "your email"}. Verifying it helps an administrator confirm who you are
            before granting staff access.
          </Callout>
        </div>
      )}

      <div className="home-page__grid">
        <AccessSummary user={user} />

        <div className="home-page__side">
          {isAdmin && (
            <section className="card home-page__admin" data-cy="admin-shortcut">
              <span className="home-page__admin-icon">
                <Icon name="users" size={20} />
              </span>
              <div>
                <h2 className="home-page__card-title">Manage users</h2>
                <p className="home-page__card-text">Grant staff roles and set region scopes for new accounts.</p>
              </div>
              <Link to="/admin/users" className={buttonClassName({ variant: "secondary", size: "sm" })}>
                Open
              </Link>
            </section>
          )}

          <section className="card" aria-labelledby="map-layers-title">
            <h2 id="map-layers-title" className="visually-hidden">
              Map and data layers
            </h2>
            <EmptyState
              icon="map"
              title="No data layers yet"
              message="Flood risk, rainfall and disaster-event layers will appear here once their datasets are connected. Nothing is shown until real data exists."
            />
          </section>
        </div>
      </div>
    </div>
  );
}
