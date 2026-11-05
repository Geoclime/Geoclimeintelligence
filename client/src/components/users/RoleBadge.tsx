import { useRoles } from "../../hooks/useRoles";
import type { BuiltInRole, UserRole } from "../../types/auth.types";
import { roleLabel } from "../../utils/roles";
import { Badge, type BadgeTone } from "../shared/Badge";

const ROLE_TONES: Record<BuiltInRole, BadgeTone> = {
  general_public: "neutral",
  emergency_responder: "danger",
  government_official: "info",
  researcher: "violet",
  administrator: "primary",
};

/** A role's name as a badge. A role made on the Roles screen is named from the cached role list, in a neutral tone. */
export function RoleBadge({ role }: { role: UserRole }) {
  const { roles } = useRoles();
  return (
    <Badge tone={role in ROLE_TONES ? ROLE_TONES[role as BuiltInRole] : "neutral"} dataCy="role-badge">
      {roleLabel(role, roles)}
    </Badge>
  );
}
