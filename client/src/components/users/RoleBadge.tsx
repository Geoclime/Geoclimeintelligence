import type { UserRole } from "../../types/auth.types";
import { roleLabel } from "../../utils/roles";
import { Badge, type BadgeTone } from "../shared/Badge";

const ROLE_TONES: Record<UserRole, BadgeTone> = {
  general_public: "neutral",
  emergency_responder: "danger",
  government_official: "info",
  researcher: "violet",
  administrator: "primary",
};

export function RoleBadge({ role }: { role: UserRole }) {
  return (
    <Badge tone={ROLE_TONES[role]} dataCy="role-badge">
      {roleLabel(role)}
    </Badge>
  );
}
