import type { UserRole } from "../../common/access/roles";

type Roles = [UserRole, ...UserRole[]];

/**
 * Who may do what with AI, as role lists for authorise() (Administrators always pass). This app
 * has roles, not fine-grained permissions, so the design's ai.* permissions map to these.
 *
 * Starting point only: whether general_public may use AI on the platform's key is still to be
 * decided (docs/ai-integration.md, "Open decisions").
 */
export const AI_ACCESS = {
  /** Use AI features at all. A draft feature also requires the role that may edit the thing it drafts. */
  use: ["emergency_responder", "government_official", "researcher"],
  /** Save, change and remove one's own provider keys. */
  ownKeys: ["emergency_responder", "government_official", "researcher"],
  /** The platform default keys everyone falls back to. */
  platformKeys: ["administrator"],
  /** Grant credits and set prices (Phase 2, if credits are used). */
  manageCredits: ["administrator"],
} as const satisfies Record<string, Roles>;
