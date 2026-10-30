import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate } from "react-router";
import { PushDeviceControl } from "../../components/notifications/NotificationSettingsCard";
import type { RedirectState } from "../../components/routing/RequireAuth";
import { Button } from "../../components/shared/Button";
import { Callout } from "../../components/shared/Callout";
import { TextField } from "../../components/shared/TextField";
import { HomeAreaFields } from "../../components/users/HomeAreaFields";
import { useAuth } from "../../hooks/useAuth";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { applySubmitError } from "../../utils/form-errors";
import { MAP_PATH } from "../../utils/map-url";
import { PROFILE_FIELDS, profileSchema, type ProfileInput } from "../account/profile.schema";
import "../../components/notifications/notifications.css";
import "../../components/users/users.css";

/** Only same-app paths, so a crafted link can't send someone to another site. */
function destination(state: unknown): string {
  const from = (state as RedirectState | null)?.from;
  return typeof from === "string" && from.startsWith("/") && !from.startsWith("//") && !from.startsWith("/welcome") ? from : MAP_PATH;
}

/**
 * "Finish setting up": shown once, straight after the first sign-in, before anything else in the
 * app (RequireCompleteProfile). Step 1 asks for what a complete profile needs (full name, phone
 * number, home state and LGA) plus organisation and job title if they have one. Step 2 offers
 * push notifications on this device; in-app and email notifications are already on.
 */
export function WelcomePage() {
  useDocumentTitle("Finish setting up");
  const { user, updateProfile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [step, setStep] = useState<"details" | "notifications">("details");
  const next = destination(location.state);

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    mode: "onTouched",
    defaultValues: {
      displayName: user?.displayName ?? "",
      phone: user?.phone ?? "",
      homeAdminUnitId: user?.homeAdminUnitId ?? "",
      organisation: user?.organisation ?? "",
      jobTitle: user?.jobTitle ?? "",
    },
  });

  // Opened directly with a complete profile: nothing to do here.
  if (step === "details" && user && user.profileComplete !== false) return <Navigate to={next} replace />;

  const onSubmit = handleSubmit(async (values) => {
    try {
      await updateProfile({
        displayName: values.displayName.trim(),
        phone: values.phone.trim(),
        homeAdminUnitId: values.homeAdminUnitId,
        organisation: values.organisation.trim() || null,
        jobTitle: values.jobTitle.trim() || null,
      });
      setStep("notifications");
    } catch (error) {
      applySubmitError(error, setError, PROFILE_FIELDS);
    }
  });

  if (step === "notifications") {
    return (
      <section className="auth-card" data-cy="welcome-notifications">
        <header className="auth-card__header">
          <p className="auth-card__step">Step 2 of 2</p>
          <h1 className="auth-card__title">Stay informed</h1>
          <p className="auth-card__lead">
            Flood alerts for your area, and updates on any reports you send, will reach you in the app and by email. You can change this any
            time in Notification settings.
          </p>
        </header>
        <div className="auth-form">
          <PushDeviceControl hideWhenUnavailable />
          <Button size="lg" fullWidth onClick={() => navigate(next, { replace: true })} data-cy="welcome-finish">
            Go to GeoClime Intelligence
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="auth-card" data-cy="welcome-page">
      <header className="auth-card__header">
        <p className="auth-card__step">Step 1 of 2</p>
        <h1 className="auth-card__title">Finish setting up your account</h1>
        <p className="auth-card__lead">A few details so coordinators can reach you, and so flood alerts for where you live or work reach you.</p>
      </header>

      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {errors.root?.server && (
          <Callout tone="danger" dataCy="form-error">
            {errors.root.server.message}
          </Callout>
        )}
        <TextField label="Full name" autoComplete="name" error={errors.displayName?.message} data-cy="welcome-name" {...register("displayName")} />
        <TextField
          label="Phone number"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="+234 803 123 4567"
          hint="Only coordinators and administrators see it."
          error={errors.phone?.message}
          data-cy="welcome-phone"
          {...register("phone")}
        />
        <Controller
          control={control}
          name="homeAdminUnitId"
          render={({ field, fieldState }) => <HomeAreaFields value={field.value} onChange={(id) => field.onChange(id)} error={fieldState.error?.message} />}
        />
        <TextField label="Organisation (optional)" autoComplete="organization" error={errors.organisation?.message} data-cy="welcome-organisation" {...register("organisation")} />
        <TextField label="Job title (optional)" autoComplete="organization-title" error={errors.jobTitle?.message} data-cy="welcome-job-title" {...register("jobTitle")} />
        <Button type="submit" size="lg" fullWidth loading={isSubmitting} loadingLabel="Saving…" data-cy="welcome-save">
          Save and continue
        </Button>
      </form>

      <p className="auth-card__footer">
        Not {user?.email ?? "you"}?{" "}
        <button type="button" className="auth-card__link-button" onClick={() => void signOut()}>
          Sign out
        </button>
      </p>
    </section>
  );
}
