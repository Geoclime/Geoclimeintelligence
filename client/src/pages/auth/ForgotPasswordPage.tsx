import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { Button, buttonClassName } from "../../components/shared/Button";
import { Callout } from "../../components/shared/Callout";
import { TextField } from "../../components/shared/TextField";
import { useAuth } from "../../hooks/useAuth";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { passwordResetSchema, type PasswordResetInput } from "./auth.schema";

/**
 * Asks Firebase to email a password-reset link. The confirmation reads the same whether or not
 * the address has an account, so this page can't be used to find out who is registered.
 */
export function ForgotPasswordPage() {
  useDocumentTitle("Reset your password");
  const { sendPasswordReset } = useAuth();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordResetInput>({ resolver: zodResolver(passwordResetSchema), mode: "onTouched" });

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      await sendPasswordReset(email);
      setSentTo(email);
    } catch (error) {
      setError("root.server", { message: error instanceof Error ? error.message : "Couldn't send the email." });
    }
  });

  if (sentTo) {
    return (
      <section className="auth-card" data-cy="reset-sent">
        <header className="auth-card__header">
          <h1 className="auth-card__title">Check your inbox</h1>
        </header>
        <div className="auth-form">
          <Callout tone="success">
            If an account exists for <strong>{sentTo}</strong>, a link to reset the password is on its way. It can
            take a few minutes, so check your spam folder too.
          </Callout>
          <Link to="/sign-in" className={buttonClassName({ size: "lg", fullWidth: true })}>
            Back to sign in
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="auth-card" data-cy="forgot-password-page">
      <header className="auth-card__header">
        <h1 className="auth-card__title">Reset your password</h1>
        <p className="auth-card__lead">Enter your account's email and we'll send you a link to choose a new password.</p>
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
        <Button type="submit" size="lg" fullWidth loading={isSubmitting} loadingLabel="Sending…" data-cy="submit">
          Send reset link
        </Button>
      </form>

      <p className="auth-card__footer">
        Remembered it? <Link to="/sign-in">Back to sign in</Link>
      </p>
    </section>
  );
}
