import { useCallback, useMemo } from "react";
import type { Permission } from "../types/auth.types";
import { can, surveyAbilities, type SurveyAbilities } from "../utils/permissions";
import { useAuth } from "./useAuth";

/** `can("photos.view")`: whether the signed-in person's role may do something (utils/permissions.ts). */
export function useCan(): (permission: Permission) => boolean {
  const { user } = useAuth();
  return useCallback((permission: Permission) => can(user, permission), [user]);
}

/** What field survey lets the signed-in person do on the map. */
export function useSurveyAbilities(): SurveyAbilities {
  const { user } = useAuth();
  return useMemo(() => surveyAbilities(user), [user]);
}
