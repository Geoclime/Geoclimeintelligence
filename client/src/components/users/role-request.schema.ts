import { z } from "zod";
import { REQUESTABLE_ROLES, type RoleRequestBody } from "../../types/auth.types";

// The rules for asking for a staff role, shared by the sign-up form and the profile page. They
// mirror roleRequestSchema on the server, which checks again whatever it receives.

export const ORGANISATION_REQUIRED = "Enter the organisation you work for, so the administrator can check it";
export const REASON_MIN = 10;
export const REASON_MAX = 500;
export const REASON_TOO_SHORT = `Tell the administrator a little more (at least ${REASON_MIN} characters)`;

export const roleRequestFormSchema = z.object({
  role: z.enum(REQUESTABLE_ROLES, { error: "Choose the role you need" }),
  organisation: z.string().trim().min(2, { error: ORGANISATION_REQUIRED }).max(200, { error: "Use 200 characters or fewer" }),
  jobTitle: z.string().trim().max(120, { error: "Use 120 characters or fewer" }),
  reason: z.string().trim().min(REASON_MIN, { error: REASON_TOO_SHORT }).max(REASON_MAX, { error: `Use ${REASON_MAX} characters or fewer` }),
});
export type RoleRequestFormValues = z.infer<typeof roleRequestFormSchema>;

/** The request body; an empty job title is left out rather than sent as "". */
export function toRoleRequestBody(values: RoleRequestFormValues): RoleRequestBody {
  return {
    role: values.role,
    reason: values.reason.trim(),
    organisation: values.organisation.trim(),
    ...(values.jobTitle.trim() && { jobTitle: values.jobTitle.trim() }),
  };
}
