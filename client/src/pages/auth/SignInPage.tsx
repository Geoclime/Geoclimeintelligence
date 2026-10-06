import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation } from "react-router";
import { Button } from "../../components/shared/Button";
import { Callout } from "../../components/shared/Callout";
import { TextField } from "../../components/shared/TextField";
import { useAuth } from "../../hooks/useAuth";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useToast } from "../../hooks/useToast";
import { EMAIL_NOT_VERIFIED, IdentityError } from "../../transport/identity-error";
import { signInSchema, type SignInInput } from "./auth.schema";

/**
 * Email + password sign-in. The credentials go straight to Firebase, never to our backend.
 * On success nothing happens here: AuthContext sees the new session, loads the account from
 * GET /api/v1/auth/me, and GuestOnly redirects to wherever the user was headed.
 *
 * A correct password isn't enough: until the email is verified the user stays signed out, and this
 * page says why and offers to send the verification link again.
 */
export function SignInPage() {
  useDocumentTitle("Sign in");
  const { signIn, resendVerificationEmail } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const [unverifiedMessage, setUnverifiedMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({ resolver: zodResolver(signInSchema), mode: "onTouched" });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setUnverifiedMessage(null);
    try {
      await signIn(email, password);
    } catch (error) {
      if (error instanceof IdentityError && error.code === EMAIL_NOT_VERIFIED) {
        setUnverifiedMessage(error.message);
        return;
      }
      setError("root.server", { message: error instanceof Error ? error.message : "Sign-in failed." });
    }
  });

  const resend = async () => {
    const { email, password } = getValues();
    setResending(true);
    try {
      // false means the email was verified in the meantime and they are now signed in; the
      // route guard moves them on, so there is nothing to announce.
      if (await resendVerificationEmail(email, password)) {
        showToast({ type: "success", message: `Verification email sent to ${email}.` });
      }
    } catch (error) {
      showToast({ type: "error", message: error instanceof Error ? error.message : "Couldn't send the email." });
    } finally {
      setResending(false);
    }
  };

  return (
    <section className="auth-card" data-cy="sign-in-page">
      <header className="auth-card__header">
        <h1 className="auth-card__title">Sign in</h1>
        <p className="auth-card__lead">Welcome back. Sign in to see the latest for your area.</p>
      </header>

      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {errors.root?.server && (
          <Callout tone="danger" dataCy="form-error">
            {errors.root.server.message}
          </Callout>
        )}
        {unverifiedMessage && (
          <Callout
            tone="warning"
            dataCy="verify-email-notice"
            action={
              <Button variant="secondary" size="sm" loading={resending} onClick={() => void resend()} data-cy="resend-verification">
                Resend link
              </Button>
            }
          >
            {unverifiedMessage}
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
          autoComplete="current-password"
          revealable
          error={errors.password?.message}
          data-cy="password"
          {...register("password")}
        />
        <div className="auth-form__row">
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        <Button type="submit" size="lg" fullWidth loading={isSubmitting} loadingLabel="Signing in…" data-cy="submit">
          Sign in
        </Button>
      </form>

      <p className="auth-card__footer">
        New here?{" "}
        <Link to="/sign-up" state={location.state}>
          Create an account
        </Link>
      </p>
    </section>
  );
}
