import type { AuthUser } from "../types/auth.types";

/** "Ada Obi" -> "AO"; falls back to the email ("ada.obi@x" -> "AO"), then "?". */
export function initials(user: Pick<AuthUser, "displayName" | "email">): string {
  const source = user.displayName || user.email || "?";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export interface ProfileItem {
  key: "displayName" | "phone" | "organisation" | "jobTitle";
  label: string;
  done: boolean;
}

/**
 * The profile details a user can add themselves, and which are filled in. Drives the
 * completeness meter on the account page and the reminder dot on the avatar.
 */
export function profileChecklist(user: AuthUser): ProfileItem[] {
  return [
    { key: "displayName", label: "Your name", done: Boolean(user.displayName?.trim()) },
    { key: "phone", label: "Phone number", done: Boolean(user.phone?.trim()) },
    { key: "organisation", label: "Organisation", done: Boolean(user.organisation?.trim()) },
    { key: "jobTitle", label: "Job title", done: Boolean(user.jobTitle?.trim()) },
  ];
}

/** True when the user hasn't even added a name: the one detail worth nudging about everywhere. */
export function needsName(user: AuthUser): boolean {
  return !user.displayName?.trim();
}
