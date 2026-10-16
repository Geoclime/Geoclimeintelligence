import { useId } from "react";
import { Link } from "react-router";
import type { AuthUser } from "../../types/auth.types";
import { initials, needsName } from "../../utils/profile";
import { Icon } from "../shared/Icon";
import { RoleBadge } from "../users/RoleBadge";
import { ThemeToggle } from "./ThemeToggle";

interface UserMenuProps {
  user: AuthUser;
  onSignOut: () => void;
}

/**
 * Account menu. Uses the HTML popover attribute, which gives click-outside and Esc dismissal
 * without any custom listeners.
 */
export function UserMenu({ user, onSignOut }: UserMenuProps) {
  const menuId = useId();
  const name = user.displayName || user.email || "Your account";
  const incomplete = needsName(user);
  const closeMenu = () => document.getElementById(menuId)?.hidePopover();

  return (
    <div className="user-menu">
      <button type="button" className="user-menu__trigger" popoverTarget={menuId} data-cy="user-menu-trigger">
        <span className="user-menu__avatar" aria-hidden="true">
          {initials(user)}
        </span>
        {incomplete && <span className="user-menu__dot" aria-hidden="true" />}
        <span className="visually-hidden">Account menu for {name}</span>
      </button>
      <div id={menuId} popover="auto" className="user-menu__panel" data-cy="user-menu">
        <div className="user-menu__identity">
          <p className="user-menu__name">{name}</p>
          {user.displayName && user.email && <p className="user-menu__email">{user.email}</p>}
          <RoleBadge role={user.role} />
        </div>
        {incomplete && (
          <Link to="/account" className="user-menu__nudge" onClick={closeMenu} data-cy="profile-nudge">
            <Icon name="alert" size={14} />
            Add your name so administrators know who you are
          </Link>
        )}
        <Link to="/account" className="user-menu__link" onClick={closeMenu} data-cy="account-link">
          <Icon name="user" size={16} />
          Your profile and access
        </Link>
        <Link to="/help" className="user-menu__link" onClick={closeMenu}>
          <Icon name="info" size={16} />
          Help and guides
        </Link>
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
