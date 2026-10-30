import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { InstallAppButton } from "../../components/layout/InstallAppButton";
import { ThemeToggle } from "../../components/layout/ThemeToggle";
import { Button } from "../../components/shared/Button";
import { Callout } from "../../components/shared/Callout";
import { Icon, type IconName } from "../../components/shared/Icon";
import { TextField } from "../../components/shared/TextField";
import { AccessSummary } from "../../components/users/AccessSummary";
import { RoleRequestCard } from "../../components/users/RoleRequestCard";
import { RoleBadge } from "../../components/users/RoleBadge";
import { useAdminUnit } from "../../hooks/useAdminUnit";
import { useAuth } from "../../hooks/useAuth";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { usePwa } from "../../hooks/usePwa";
import { useToast } from "../../hooks/useToast";
import type { AuthUser } from "../../types/auth.types";
import { applySubmitError } from "../../utils/form-errors";
import { formatDate } from "../../utils/formatDate";
import { MAP_PATH } from "../../utils/map-url";
import { initials, profileChecklist } from "../../utils/profile";
import { hasAnyRole } from "../../utils/roles";
import { SetupChecklist } from "./SetupChecklist";
import { PROFILE_FIELDS, profileSchema, type ProfileInput } from "./profile.schema";
import "./AccountPage.css";

/**
 * The signed-in user's own account: who they are (editable name and contact details), what they
 * can do and where, account security, display preferences, and shortcuts to the next useful step.
 */
export function AccountPage() {
  useDocumentTitle("Your account");
  const { user } = useAuth();
  const { unit: region, loading: regionLoading } = useAdminUnit(user?.scopeAdminUnitId ?? undefined);
  if (!user) return null;

  const isAdmin = hasAnyRole(user.role, ["administrator"]);
  const checklist = profileChecklist(user);
  const done = checklist.filter((item) => item.done).length;

  return (
    <div className="page account-page" data-cy="account-page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Account</p>
          <h1 className="page__title">Your profile</h1>
          <p className="page__lead">Keep your details up to date so administrators know who you are when they grant access.</p>
        </div>
      </header>

      <section className="card profile-hero" aria-label="Profile summary" data-cy="profile-hero">
        <span className="profile-hero__avatar" aria-hidden="true">
          {initials(user)}
        </span>
        <div className="profile-hero__identity">
          <p className="profile-hero__name">{user.displayName || <span className="muted">Add your name below</span>}</p>
          <p className="profile-hero__meta">
            {[user.jobTitle, user.organisation].filter(Boolean).join(" · ") || user.email}
          </p>
          <div className="profile-hero__chips">
            <RoleBadge role={user.role} />
            <span className="profile-chip">
              <Icon name="pin" size={13} />
              {user.scopeAdminUnitId ? (region?.unitName ?? "One region") : "All regions"}
            </span>
            {user.createdAt && (
              <span className="profile-chip">
                <Icon name="history" size={13} />
                Member since {formatDate(user.createdAt)}
              </span>
            )}
          </div>
        </div>
        <div className="profile-hero__progress" data-cy="profile-progress">
          <p className="profile-hero__progress-label">
            Profile {done === checklist.length ? "complete" : `${done} of ${checklist.length} done`}
          </p>
          <div
            className="progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={checklist.length}
            aria-valuenow={done}
            aria-label="Profile completeness"
          >
            <span style={{ width: `${(done / checklist.length) * 100}%` }} />
          </div>
          {done < checklist.length && (
            <p className="profile-hero__progress-hint">
              Missing: {checklist.filter((item) => !item.done).map((item) => item.label.toLowerCase()).join(", ")}
            </p>
          )}
        </div>
      </section>

      <div className="account-page__grid">
        <div className="account-page__main">
          <ProfileForm user={user} />
          <AccessSummary user={user} region={region} regionLoading={regionLoading} />
          <RoleRequestCard user={user} />
        </div>

        <div className="account-page__side">
          {isAdmin && <SetupChecklist />}
          <SecurityCard user={user} />
          <section className="card account-card" aria-labelledby="prefs-title">
            <h2 id="prefs-title" className="account-card__title">
              Preferences
            </h2>
            <div className="account-row">
              <div>
                <p className="account-row__label">Theme</p>
                <p className="account-row__hint">Match your device, or always light or dark.</p>
              </div>
              <ThemeToggle />
            </div>
            <InstallRow />
          </section>
          <QuickLinks isAdmin={isAdmin} />
        </div>
      </div>
    </div>
  );
}

function toFormValues(user: AuthUser): ProfileInput {
  return {
    displayName: user.displayName ?? "",
    phone: user.phone ?? "",
    organisation: user.organisation ?? "",
    jobTitle: user.jobTitle ?? "",
  };
}

/** Name and contact details. Only changed fields are sent; an emptied field is cleared. */
function ProfileForm({ user }: { user: AuthUser }) {
  const { updateProfile } = useAuth();
  const { showToast } = useToast();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty, dirtyFields },
  } = useForm<ProfileInput>({ resolver: zodResolver(profileSchema), mode: "onTouched", values: toFormValues(user) });

  const onSubmit = handleSubmit(async (values) => {
    const patch = Object.fromEntries(
      PROFILE_FIELDS.filter((field) => dirtyFields[field]).map((field) => [field, values[field] || null]),
    );
    try {
      const updated = await updateProfile(patch);
      reset(toFormValues(updated));
      showToast({ type: "success", message: "Your profile is saved." });
    } catch (error) {
      applySubmitError(error, setError, PROFILE_FIELDS);
    }
  });

  return (
    <section className="card account-card" aria-labelledby="details-title" data-cy="profile-form-card">
      <div className="account-card__header">
        <div>
          <h2 id="details-title" className="account-card__title">
            Personal details
          </h2>
          <p className="account-card__lead">Visible to administrators. Your email is managed by your sign-in.</p>
        </div>
      </div>
      <form className="profile-form" onSubmit={onSubmit} noValidate data-cy="profile-form">
        {errors.root?.server && (
          <Callout tone="danger" dataCy="form-error">
            {errors.root.server.message}
          </Callout>
        )}
        <div className="profile-form__grid">
          <TextField
            label="Full name"
            autoComplete="name"
            placeholder="e.g. Ada Obi"
            error={errors.displayName?.message}
            data-cy="profile-name"
            {...register("displayName")}
          />
          <TextField label="Email" value={user.email ?? "Not available"} disabled readOnly hint="Used to sign in." />
          <TextField
            label="Phone number"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="+234 803 123 4567"
            hint="So responders and administrators can reach you."
            error={errors.phone?.message}
            data-cy="profile-phone"
            {...register("phone")}
          />
          <TextField
            label="Organisation"
            autoComplete="organization"
            placeholder="e.g. National Emergency Management Agency"
            error={errors.organisation?.message}
            data-cy="profile-organisation"
            {...register("organisation")}
          />
          <TextField
            label="Job title"
            autoComplete="organization-title"
            placeholder="e.g. Field coordinator"
            error={errors.jobTitle?.message}
            data-cy="profile-job-title"
            {...register("jobTitle")}
          />
        </div>
        <div className="profile-form__actions">
          <Button variant="ghost" onClick={() => reset()} disabled={!isDirty || isSubmitting}>
            Discard changes
          </Button>
          <Button type="submit" loading={isSubmitting} loadingLabel="Saving…" disabled={!isDirty} data-cy="profile-save">
            Save changes
          </Button>
        </div>
      </form>
    </section>
  );
}

/** Password reset by email (Firebase owns passwords) and sign-out. */
function SecurityCard({ user }: { user: AuthUser }) {
  const { sendPasswordReset, signOut } = useAuth();
  const { showToast } = useToast();
  const [sending, setSending] = useState(false);

  const sendReset = async () => {
    if (!user.email) return;
    setSending(true);
    try {
      await sendPasswordReset(user.email);
      showToast({ type: "success", message: `We sent a password reset link to ${user.email}.` });
    } catch (error) {
      showToast({ type: "error", message: error instanceof Error ? error.message : "Couldn't send the link." });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="card account-card" aria-labelledby="security-title" data-cy="security-card">
      <h2 id="security-title" className="account-card__title">
        Sign-in and security
      </h2>
      <div className="account-row">
        <div>
          <p className="account-row__label">Email</p>
          <p className="account-row__hint account-row__hint--strong">{user.email ?? "Not available"}</p>
        </div>
        <span className="profile-chip profile-chip--success">
          <Icon name="check" size={13} />
          Verified
        </span>
      </div>
      <div className="account-row">
        <div>
          <p className="account-row__label">Password</p>
          <p className="account-row__hint">We'll email you a secure link to set a new one.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void sendReset()} loading={sending} disabled={!user.email} data-cy="send-reset">
          Change
        </Button>
      </div>
      <div className="account-row">
        <div>
          <p className="account-row__label">This device</p>
          <p className="account-row__hint">Sign out when you're on a shared computer.</p>
        </div>
        <Button variant="ghost" size="sm" icon={<Icon name="logOut" size={14} />} onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </section>
  );
}

/** "Install the app", shown only where the browser offers installation and it isn't installed yet. */
function InstallRow() {
  const { canInstall, standalone } = usePwa();
  if (!canInstall || standalone) return null;
  return (
    <div className="account-row">
      <div>
        <p className="account-row__label">App</p>
        <p className="account-row__hint">Install it for quick access from your home screen, and for use on a poor connection.</p>
      </div>
      <InstallAppButton />
    </div>
  );
}

function QuickLinks({ isAdmin }: { isAdmin: boolean }) {
  const links: { to: string; icon: IconName; title: string; text: string }[] = [
    { to: MAP_PATH, icon: "map", title: "Explore the map", text: "States, LGAs and wards." },
    { to: "/places", icon: "pin", title: "Browse places", text: "Every LGA with its wards." },
    { to: "/help", icon: "info", title: "Help and guides", text: "How each part of the platform works." },
  ];
  if (isAdmin) links.push({ to: "/admin/users", icon: "users", title: "Manage users", text: "Grant roles and region scopes." });

  return (
    <nav className="card account-card" aria-labelledby="shortcuts-title">
      <h2 id="shortcuts-title" className="account-card__title">
        Shortcuts
      </h2>
      <ul className="shortcut-list">
        {links.map((link) => (
          <li key={link.to}>
            <Link to={link.to} className="shortcut">
              <span className="shortcut__icon">
                <Icon name={link.icon} size={16} />
              </span>
              <span className="shortcut__text">
                <span className="shortcut__title">{link.title}</span>
                <span className="shortcut__desc">{link.text}</span>
              </span>
              <Icon name="chevronRight" size={16} />
            </Link>
          </li>
        ))}
      </ul>
      <p className="account-card__foot">
        Need more access? Ask an administrator. <Link to="/help#roles">What each role can do</Link>
      </p>
    </nav>
  );
}
