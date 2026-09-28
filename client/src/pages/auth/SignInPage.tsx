import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useLocation } from "react-router";
import { Button } from "../../components/shared/Button";
import { Callout } from "../../components/shared/Callout";
import { TextField } from "../../components/shared/TextField";
import { useAuth } from "../../hooks/useAuth";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { signInSchema, type SignInInput } from "./auth.schema";

/**
 * Email + password sign-in. The credentials go straight to Firebase, never to our backend.
 * On success nothing happens here: AuthContext sees the new session, loads the account from
 * GET /api/v1/auth/me, and GuestOnly redirects to wherever the user was headed.
 */
export function SignInPage() {
  useDocumentTitle("Sign in");
  const { signIn } = useAuth();
  const location = useLocation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({ resolver: zodResolver(signInSchema), mode: "onTouched" });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    try {
      await signIn(email, password);
    } catch (error) {
      setError("root.server", { message: error instanceof Error ? error.message : "Sign-in failed." });
    }
  });

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
