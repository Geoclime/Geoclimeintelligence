import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation } from "react-router";
import { Button, buttonClassName } from "../../components/shared/Button";
import { Callout } from "../../components/shared/Callout";
import { TextField } from "../../components/shared/TextField";
import { useAuth } from "../../hooks/useAuth";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { PASSWORD_MIN_LENGTH, signUpSchema, type SignUpInput } from "./auth.schema";

/**
 * Creates a Firebase account and emails a verification link. The new account is deliberately NOT
 * signed in: the user has to click the link first, then sign in. The backend creates the matching
 * `users` row, as General Public, the first time that verified account calls GET /api/v1/auth/me
 * (which AuthContext does right after sign-in). Only an Administrator can raise the role afterwards.
 */
export function SignUpPage() {
  useDocumentTitle("Create an account");
  const { signUp } = useAuth();
  const location = useLocation();
  const [created, setCreated] = useState<{ email: string; verificationSent: boolean } | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({ resolver: zodResolver(signUpSchema), mode: "onTouched" });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    try {
      const { verificationSent } = await signUp(email, password);
      setCreated({ email, verificationSent });
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
          New accounts can view published events, risk layers and alerts. Staff access is granted by an
          administrator.
        </p>
      </header>

      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {errors.root?.server && (
          <Callout tone="danger" dataCy="form-error">
            {errors.root.server.message}
          </Callout>
        )}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoFocus
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
        <Button type="submit" size="lg" fullWidth loading={isSubmitting} loadingLabel="Creating account…" data-cy="submit">
          Create account
        </Button>
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
