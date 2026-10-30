import type { UseFormRegisterReturn } from "react-hook-form";
import type { RequestableRole } from "../../types/auth.types";
import { JOINING_AS } from "../../utils/roles";
import { TextAreaField } from "../shared/TextAreaField";
import { TextField } from "../shared/TextField";
import { REASON_MAX } from "./role-request.schema";
import "./users.css";

type JoiningAs = keyof typeof JOINING_AS;

interface RolePickerProps {
  legend: string;
  options: readonly JoiningAs[];
  field: UseFormRegisterReturn;
  error?: string;
}

/** Radio cards for "I'm joining as …" / "Role you need", each with who it is for. */
export function RolePicker({ legend, options, field, error }: RolePickerProps) {
  return (
    <fieldset className="role-picker" data-cy="role-picker">
      <legend className="role-picker__legend">{legend}</legend>
      {options.map((option) => (
        <label key={option} className="role-picker__option" data-cy={`joining-as-${option}`}>
          <input type="radio" value={option} {...field} />
          <span className="role-picker__text">
            <span className="role-picker__label">{JOINING_AS[option].label}</span>
            <span className="role-picker__description">{JOINING_AS[option].description}</span>
          </span>
        </label>
      ))}
      {error && <p className="field__error">{error}</p>}
    </fieldset>
  );
}

interface RoleRequestDetailsProps {
  role: RequestableRole;
  organisation: UseFormRegisterReturn;
  jobTitle: UseFormRegisterReturn;
  reason: UseFormRegisterReturn;
  errors: { organisation?: string; jobTitle?: string; reason?: string };
}

/** Who is asking and why: what an administrator needs to approve a staff role. */
export function RoleRequestDetails({ role, organisation, jobTitle, reason, errors }: RoleRequestDetailsProps) {
  return (
    <div className="role-request-details" data-cy="role-request-details">
      <p className="role-request-details__note">
        An administrator checks every request for <strong>{JOINING_AS[role].label.toLowerCase()}</strong> access. Until it's approved, your
        account has public access.
      </p>
      <TextField label="Organisation" autoComplete="organization" error={errors.organisation} data-cy="request-organisation" {...organisation} />
      <TextField label="Job title (optional)" autoComplete="organization-title" error={errors.jobTitle} data-cy="request-job-title" {...jobTitle} />
      <TextAreaField
        label="Why do you need this role?"
        hint={`For example, your team and the area you cover. Up to ${REASON_MAX} characters.`}
        maxLength={REASON_MAX}
        error={errors.reason}
        data-cy="request-reason"
        {...reason}
      />
    </div>
  );
}
