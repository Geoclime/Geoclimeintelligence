import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { USER_ROLES } from "../../types/auth.types";
import type { ManagedUser, UserAccessPatch } from "../../types/user.types";
import { applySubmitError } from "../../utils/form-errors";
import { formatDate } from "../../utils/formatDate";
import { ROLE_INFO, isRegionScopable } from "../../utils/roles";
import { Button } from "../shared/Button";
import { Callout } from "../shared/Callout";
import { Modal } from "../shared/Modal";
import { TextField } from "../shared/TextField";
import { toAccessPatch, userAccessSchema, type UserAccessFormValues } from "./user-access.schema";
import "./users.css";

interface UserAccessDialogProps {
  /** The account being edited; null keeps the dialog closed. */
  user: ManagedUser | null;
  onClose: () => void;
  /** Persists the change and resolves with the saved record; rejects with an ApiError. */
  onSave: (userId: string, patch: UserAccessPatch) => Promise<ManagedUser>;
  onSaved: (updated: ManagedUser) => void;
  /** Declines the account's open role request; rejects with an ApiError. */
  onDecline: (userId: string) => Promise<ManagedUser>;
  onDeclined: (updated: ManagedUser) => void;
}

/**
 * Change one account's role and region scope, and answer its role request. With an open
 * request the form starts on the requested role, so saving approves it; "Decline request"
 * closes it and leaves the role as it is. Render it with `key={user?.id}` so each account opens
 * a fresh form.
 */
export function UserAccessDialog({ user, onClose, onSave, onSaved, onDecline, onDeclined }: UserAccessDialogProps) {
  const formId = useId();
  const request = user?.roleRequest ?? null;
  const [declining, setDeclining] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UserAccessFormValues>({
    resolver: zodResolver(userAccessSchema),
    defaultValues: { role: request?.role ?? user?.role ?? "general_public", scopeAdminUnitId: user?.scopeAdminUnitId ?? "" },
  });
  const role = useWatch({ control, name: "role" });
  const scopable = isRegionScopable(role);
  const approving = request !== null && role === request.role;
  const busy = isSubmitting || declining;

  const decline = async () => {
    if (!user) return;
    setDeclining(true);
    try {
      onDeclined(await onDecline(user.id));
    } catch (error) {
      applySubmitError(error, setError, []);
    } finally {
      setDeclining(false);
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    if (!user) return;
    try {
      onSaved(await onSave(user.id, toAccessPatch(values)));
    } catch (error) {
      applySubmitError(error, setError, ["role", "scopeAdminUnitId"]);
    }
  });

  const name = user?.displayName || user?.email || "this account";

  return (
    <Modal
      open={user !== null}
      title="Edit access"
      description={
        <>
          Role and region for <strong>{name}</strong>. Changes apply to their next request.
        </>
      }
      onClose={onClose}
      dismissible={!busy}
      dataCy="user-access-dialog"
      footer={
        <>
          {request && (
            <Button variant="danger" onClick={decline} loading={declining} loadingLabel="Declining…" disabled={isSubmitting} data-cy="decline-request">
              Decline request
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            loading={isSubmitting}
            loadingLabel="Saving…"
            disabled={(!isDirty && !approving) || declining}
            data-cy="save-access"
          >
            {approving ? `Approve as ${ROLE_INFO[request.role].label}` : "Save changes"}
          </Button>
        </>
      }
    >
      <form id={formId} className="access-form" onSubmit={onSubmit} noValidate>
        {errors.root?.server && (
          <Callout tone="danger" dataCy="form-error">
            {errors.root.server.message}
          </Callout>
        )}
        {request && (
          <Callout tone="warning" title={`Asks for ${ROLE_INFO[request.role].label} access`} dataCy="role-request-callout">
            <p className="role-request-status__reason">{request.reason}</p>
            <p className="user-table__muted">
              Requested {formatDate(request.requestedAt)}
              {user?.organisation ? ` · ${[user.jobTitle, user.organisation].filter(Boolean).join(", ")}` : ""}. Check it before approving.
            </p>
          </Callout>
        )}

        <fieldset className="role-picker">
          <legend className="role-picker__legend">Role</legend>
          {USER_ROLES.map((option) => (
            <label key={option} className="role-picker__option" data-cy={`role-option-${option}`}>
              <input type="radio" value={option} {...register("role")} />
              <span className="role-picker__text">
                <span className="role-picker__label">{ROLE_INFO[option].label}</span>
                <span className="role-picker__description">{ROLE_INFO[option].description}</span>
              </span>
            </label>
          ))}
          {errors.role && <p className="field__error">{errors.role.message}</p>}
        </fieldset>

        {scopable ? (
          <TextField
            label="Region ID (optional)"
            placeholder="Leave blank for all regions"
            spellCheck={false}
            autoComplete="off"
            className="mono-input"
            hint="Limits this account to one administrative area. A region picker replaces this field once boundary data is loaded."
            error={errors.scopeAdminUnitId?.message}
            data-cy="scope-input"
            {...register("scopeAdminUnitId")}
          />
        ) : (
          <p className="access-form__note">
            Only Emergency Responders and Government Officials can be limited to a region. This role covers every
            region.
          </p>
        )}
      </form>
    </Modal>
  );
}
