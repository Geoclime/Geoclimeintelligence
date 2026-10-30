import type { UserRole } from "../../types/auth.types";
import { MAP_PATH } from "../../utils/map-url";
import type { IconName } from "../shared/Icon";

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Roles that see the link; administrators always do. Empty = every signed-in user. */
  roles: readonly UserRole[];
  /** One-line description shown under the page title in the top bar. */
  description: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Only screens that exist are listed. Rainfall, flood risk and alerts join once their backend
// endpoints ship, never before (standard sections 10 and 17.1).
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Explore",
    items: [
      { to: MAP_PATH, label: "Map", icon: "map", roles: [], description: "States, LGAs and wards" },
      { to: "/places", label: "Places", icon: "pin", roles: [], description: "LGA directory and ward lists" },
    ],
  },
  {
    label: "Administration",
    items: [
      { to: "/admin/users", label: "Users", icon: "users", roles: ["administrator"], description: "Roles and region scopes" },
      { to: "/admin/countries", label: "Countries", icon: "globe", roles: ["administrator"], description: "Countries and their levels" },
      { to: "/admin/imports", label: "Imports", icon: "upload", roles: ["administrator"], description: "Load boundary data through staging and review" },
      { to: "/admin/configuration", label: "Configuration", icon: "database", roles: ["administrator"], description: "Data sources and platform settings" },
    ],
  },
  {
    label: "Support",
    items: [
      { to: "/help", label: "Help", icon: "info", roles: [], description: "Guides for every part of the platform" },
      { to: "/account", label: "Profile", icon: "user", roles: [], description: "Your details, access and preferences" },
    ],
  },
];

/** The nav item a path belongs to ("/places/abc" -> Places), for the top bar's title. */
export function activeNavItem(pathname: string): NavItem | undefined {
  return NAV_GROUPS.flatMap((group) => group.items).find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
}
