import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useLocation } from "react-router";
import { Button } from "../../components/shared/Button";
import { Callout } from "../../components/shared/Callout";
import { TextField } from "../../components/shared/TextField";
import { useAuth } from "../../hooks/useAuth";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useToast } from "../../hooks/useToast";
import { PASSWORD_MIN_LENGTH, signUpSchema, type SignUpInput } from "./auth.schema";

/**
 * Creates a Firebase account. The backend creates the matching `users` row, as General Public,
 * the first time the new account calls GET /api/v1/auth/me, which AuthContext does straight away.
 * Only an Administrator can raise the role afterwards.
 */
export function SignUpPage() {
  useDocumentTitle("Create an account");
  const { signUp } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({ resolver: zodResolver(signUpSchema), mode: "onTouched" });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    try {
      await signUp(email, password);
      showToast({ type: "success", message: `Account created. We've sent a verification link to ${email}.` });
    } catch (error) {
      setError("root.server", { message: error instanceof Error ? error.message : "Sign-up failed." });
    }
  });

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
