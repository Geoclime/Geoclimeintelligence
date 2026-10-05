import { Link } from "react-router";
import { buttonClassName } from "../../components/shared/Button";
import { Icon } from "../../components/shared/Icon";
import { AccessSummary } from "../../components/users/AccessSummary";
import { useAdminUnit } from "../../hooks/useAdminUnit";
import { useAuth } from "../../hooks/useAuth";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { hasAnyRole } from "../../utils/roles";
import "./AccountPage.css";

/** The signed-in user's own account: role, region (by name now that boundaries exist) and email. */
export function AccountPage() {
  useDocumentTitle("Your account");
  const { user } = useAuth();
  const { unit: region, loading: regionLoading } = useAdminUnit(user?.scopeAdminUnitId ?? undefined);
  if (!user) return null;

  const firstName = user.displayName?.split(" ")[0];
  const isAdmin = hasAnyRole(user.role, ["administrator"]);

  return (
    <div className="page home-page" data-cy="account-page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Account</p>
          <h1 className="page__title">{firstName ? `Welcome, ${firstName}` : "Your account"}</h1>
          <p className="page__lead">Your account and what it can do on the platform.</p>
        </div>
      </header>

      <div className="home-page__grid">
        <AccessSummary user={user} region={region} regionLoading={regionLoading} />

        <div className="home-page__side">
          <section className="card home-page__admin">
            <span className="home-page__admin-icon">
              <Icon name="map" size={20} />
            </span>
            <div>
              <h2 className="home-page__card-title">Explore the map</h2>
              <p className="home-page__card-text">Rivers State, its 23 LGAs and their wards.</p>
            </div>
            <Link to="/" className={buttonClassName({ variant: "secondary", size: "sm" })}>
              Open
            </Link>
          </section>

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
        </div>
      </div>
    </div>
  );
}
