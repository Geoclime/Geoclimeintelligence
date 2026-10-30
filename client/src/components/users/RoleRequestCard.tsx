import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { errorMessage } from "../../transport/api-error";
import { REQUESTABLE_ROLES, type AuthUser } from "../../types/auth.types";
import { applySubmitError } from "../../utils/form-errors";
import { formatDate } from "../../utils/formatDate";
import { JOINING_AS } from "../../utils/roles";
import { Button } from "../shared/Button";
import { Callout } from "../shared/Callout";
import { roleRequestFormSchema, toRoleRequestBody, type RoleRequestFormValues } from "./role-request.schema";
import { RolePicker, RoleRequestDetails } from "./RoleRequestFields";
import "./users.css";

/**
 * The profile page's "Request a role" card. With an open request it shows what was asked and
 * when, with a way to withdraw it; otherwise a button opens the request form. Asking grants
 * nothing: an administrator approves or declines it on the Users page. Not shown to
 * administrators, who already have every permission.
 */
export function RoleRequestCard({ user }: { user: AuthUser }) {
  const [open, setOpen] = useState(false);
  if (user.role === "administrator") return null;
  const choices = REQUESTABLE_ROLES.filter((role) => role !== user.role);

  return (
    <section className="card account-card" aria-labelledby="role-request-title" data-cy="role-request-card">
      <div className="account-card__header">
        <div>
          <h2 id="role-request-title" className="account-card__title">
            Staff access
          </h2>
          <p className="account-card__lead">
            Responders, officials and researchers get more of the platform. Ask for the role you need, and an administrator will review it.
          </p>
        </div>
      </div>
      {user.roleRequest ? (
        <OpenRequest user={user} />
      ) : open ? (
        <RequestForm user={user} choices={choices} onDone={() => setOpen(false)} />
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)} data-cy="open-role-request">
          Request a role
        </Button>
      )}
    </section>
  );
}

function OpenRequest({ user }: { user: AuthUser }) {
  const { withdrawRoleRequest } = useAuth();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const request = user.roleRequest!;

  const withdraw = async () => {
    setBusy(true);
    try {
      await withdrawRoleRequest();
      showToast({ type: "info", message: "Your role request is withdrawn." });
    } catch (error) {
      showToast({ type: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="role-request-status" data-cy="role-request-status">
      <Callout tone="info" title="Waiting for an administrator">
        You asked for <strong>{JOINING_AS[request.role].label.toLowerCase()}</strong> access on {formatDate(request.requestedAt)}. You'll see the
        new role here once it's approved.
      </Callout>
      <p className="role-request-status__reason">{request.reason}</p>
      <div>
        <Button variant="ghost" size="sm" onClick={withdraw} loading={busy} loadingLabel="Withdrawing…" data-cy="withdraw-role-request">
          Withdraw request
        </Button>
      </div>
    </div>
  );
}

function RequestForm({ user, choices, onDone }: { user: AuthUser; choices: RoleRequestFormValues["role"][]; onDone: () => void }) {
  const { requestRole } = useAuth();
  const { showToast } = useToast();
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RoleRequestFormValues>({
    resolver: zodResolver(roleRequestFormSchema),
    mode: "onTouched",
    defaultValues: { role: choices[0], organisation: user.organisation ?? "", jobTitle: user.jobTitle ?? "", reason: "" },
  });
  const role = useWatch({ control, name: "role" });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await requestRole(toRoleRequestBody(values));
      showToast({ type: "success", message: "Your request was sent to the administrators." });
      onDone();
    } catch (error) {
      applySubmitError(error, setError, ["role", "organisation", "jobTitle", "reason"]);
    }
  });

  return (
    <form className="profile-form" onSubmit={onSubmit} noValidate data-cy="role-request-form">
      {errors.root?.server && (
        <Callout tone="danger" dataCy="form-error">
          {errors.root.server.message}
        </Callout>
      )}
      <RolePicker legend="Role you need" options={choices} field={register("role")} error={errors.role?.message} />
      <RoleRequestDetails
        role={role}
        organisation={register("organisation")}
        jobTitle={register("jobTitle")}
        reason={register("reason")}
        errors={{ organisation: errors.organisation?.message, jobTitle: errors.jobTitle?.message, reason: errors.reason?.message }}
      />
      <div className="form-actions">
        <Button variant="secondary" onClick={onDone} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting} loadingLabel="Sending…" data-cy="send-role-request">
          Send request
        </Button>
      </div>
    </form>
  );
}
