import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Link, useLocation } from "react-router";
import { Button, buttonClassName } from "../../components/shared/Button";
import { Callout } from "../../components/shared/Callout";
import { TextField } from "../../components/shared/TextField";
import { toRoleRequestBody } from "../../components/users/role-request.schema";
import { RolePicker, RoleRequestDetails } from "../../components/users/RoleRequestFields";
import { useAuth } from "../../hooks/useAuth";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { REQUESTABLE_ROLES, type RequestableRole } from "../../types/auth.types";
import { savePendingRoleRequest } from "../../utils/pending-role-request";
import { JOINING_AS } from "../../utils/roles";
import { PASSWORD_MIN_LENGTH, signUpSchema, type SignUpInput } from "./auth.schema";

const JOINING_OPTIONS = ["general_public", ...REQUESTABLE_ROLES] as const;

/**
 * Creates a Firebase account and emails a verification link. The new account is deliberately NOT
 * signed in: the user has to click the link first, then sign in. The backend creates the matching
 * `users` row, as General Public, the first time that verified account calls GET /api/v1/auth/me
 * (which AuthContext does right after sign-in).
 *
 * Nobody chooses their own role. Someone joining as a responder, official or researcher makes a
 * REQUEST: it is kept in this browser and sent after their first sign-in
 * (hooks/useSubmitPendingRoleRequest.ts), and an administrator approves or declines it.
 */
export function SignUpPage() {
  useDocumentTitle("Create an account");
  const { signUp } = useAuth();
  const location = useLocation();
  const [created, setCreated] = useState<{ email: string; verificationSent: boolean; requested: RequestableRole | null } | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    mode: "onTouched",
    defaultValues: { joiningAs: "general_public", organisation: "", jobTitle: "", reason: "" },
  });
  const joiningAs = useWatch({ control, name: "joiningAs" });

  const onSubmit = handleSubmit(async ({ displayName, email, password, joiningAs: chosen, organisation, jobTitle, reason }) => {
    try {
      const { verificationSent } = await signUp(email, password, displayName);
      const requested = chosen === "general_public" ? null : chosen;
      if (requested) savePendingRoleRequest(email, toRoleRequestBody({ role: requested, organisation, jobTitle, reason }));
      setCreated({ email, verificationSent, requested });
    } catch (error) {
      setError("root.server", { message: error instanceof Error ? error.message : "Sign-up failed." });
    }
  });

  if (created) {
    return (
      <section className="auth-card" data-cy="verify-email-sent">
        <header className="auth-card__header">
          <h1 className="auth-card__title">Verify your email</h1>
        </header>
        <div className="auth-form">
          {created.verificationSent ? (
            <Callout tone="success">
              Your account is created. We sent a verification link to <strong>{created.email}</strong>. Click it, then
              sign in. It can take a few minutes, so check your spam folder too.
            </Callout>
          ) : (
            <Callout tone="warning" dataCy="verification-not-sent">
              Your account is created, but we couldn't send the verification link to <strong>{created.email}</strong>.
              Try signing in and we'll offer to send it again.
            </Callout>
          )}
          {created.requested && (
            <Callout tone="info" dataCy="role-request-pending">
              When you first sign in, we'll send your request for <strong>{JOINING_AS[created.requested].label.toLowerCase()}</strong> access to
              an administrator. Until it's approved, your account has public access.
            </Callout>
          )}
          <Link to="/sign-in" state={location.state} className={buttonClassName({ size: "lg", fullWidth: true })}>
            Go to sign in
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="auth-card" data-cy="sign-up-page">
      <header className="auth-card__header">
        <h1 className="auth-card__title">Create an account</h1>
        <p className="auth-card__lead">
          Every account starts with public access. If you work in emergency response, government or research, ask for that role below
          and an administrator will review it.
        </p>
      </header>

      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {errors.root?.server && (
          <Callout tone="danger" dataCy="form-error">
            {errors.root.server.message}
          </Callout>
        )}
        <TextField
          label="Full name"
          autoComplete="name"
          autoFocus
          hint="Shown to administrators when they review access requests."
          error={errors.displayName?.message}
          data-cy="display-name"
          {...register("displayName")}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email?.message}
          data-cy="email"
          {...register("email")}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          revealable
          hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short phrase is easier to remember than a code.`}
          error={errors.password?.message}
          data-cy="password"
          {...register("password")}
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          revealable
          error={errors.confirmPassword?.message}
          data-cy="confirm-password"
          {...register("confirmPassword")}
        />
        <RolePicker legend="I'm joining as" options={JOINING_OPTIONS} field={register("joiningAs")} error={errors.joiningAs?.message} />
        {joiningAs !== "general_public" && (
          <RoleRequestDetails
            role={joiningAs}
            organisation={register("organisation")}
            jobTitle={register("jobTitle")}
            reason={register("reason")}
            errors={{ organisation: errors.organisation?.message, jobTitle: errors.jobTitle?.message, reason: errors.reason?.message }}
          />
        )}
        <Button type="submit" size="lg" fullWidth loading={isSubmitting} loadingLabel="Creating account…" data-cy="submit">
          Create account
        </Button>
        <p className="auth-card__legal">
          By creating an account you agree to our <Link to="/terms">terms of use</Link> and <Link to="/privacy">privacy policy</Link>.
        </p>
      </form>

      <p className="auth-card__footer">
        Already have an account?{" "}
        <Link to="/sign-in" state={location.state}>
          Sign in
        </Link>
      </p>
    </section>
  );
}
