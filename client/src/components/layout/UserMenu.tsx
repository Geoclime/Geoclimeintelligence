import { useId } from "react";
import type { AuthUser } from "../../types/auth.types";
import { Icon } from "../shared/Icon";
import { RoleBadge } from "../users/RoleBadge";
import { ThemeToggle } from "./ThemeToggle";

interface UserMenuProps {
  user: AuthUser;
  onSignOut: () => void;
}

function initials(user: AuthUser): string {
  const source = user.displayName || user.email || "?";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/**
 * Account menu. Uses the HTML popover attribute, which gives click-outside and Esc dismissal
 * without any custom listeners.
 */
export function UserMenu({ user, onSignOut }: UserMenuProps) {
  const menuId = useId();
  const name = user.displayName || user.email || "Your account";

  return (
    <div className="user-menu">
      <button type="button" className="user-menu__trigger" popoverTarget={menuId} data-cy="user-menu-trigger">
        <span className="user-menu__avatar" aria-hidden="true">
          {initials(user)}
        </span>
        <span className="visually-hidden">Account menu for {name}</span>
      </button>
      <div id={menuId} popover="auto" className="user-menu__panel" data-cy="user-menu">
        <div className="user-menu__identity">
          <p className="user-menu__name">{name}</p>
          {user.displayName && user.email && <p className="user-menu__email">{user.email}</p>}
          <RoleBadge role={user.role} />
        </div>
        <div className="user-menu__section">
          <p className="user-menu__label">Theme</p>
          <ThemeToggle />
        </div>
        <button type="button" className="user-menu__action" onClick={onSignOut} data-cy="sign-out">
          <Icon name="logOut" size={16} />
          Sign out
        </button>
      </div>
    </div>
  );
}
