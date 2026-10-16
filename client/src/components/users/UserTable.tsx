import { memo } from "react";
import { useAdminUnit } from "../../hooks/useAdminUnit";
import type { ManagedUser } from "../../types/user.types";
import { formatDate } from "../../utils/formatDate";
import { Button } from "../shared/Button";
import { Icon } from "../shared/Icon";
import { RoleBadge } from "./RoleBadge";
import "./users.css";

interface UserTableProps {
  users: ManagedUser[];
  /** The signed-in administrator. The backend refuses self-edits, so their row can't be edited. */
  currentUserId: string;
  onEdit: (user: ManagedUser) => void;
}

/** A region scope by name ("Obio/Akpor, LGA"), looked up once per area and cached. */
function ScopeName({ id }: { id: string }) {
  const { unit, error } = useAdminUnit(id);
  if (unit) return <span title={id}>{unit.unitName} <span className="user-table__muted">({unit.levelName})</span></span>;
  return (
    <code className="user-table__scope" title={id}>
      {error ? `${id.slice(0, 8)}…` : "Loading…"}
    </code>
  );
}

/**
 * One page of accounts. A plain table: pages are at most 100 rows (the backend's cap), well
 * under the few-hundred-row point where the standard asks for virtualisation (section 13).
 */
export const UserTable = memo(function UserTable({ users, currentUserId, onEdit }: UserTableProps) {
  return (
    <div className="user-table__scroll">
      <table className="user-table" data-cy="user-table">
        <caption className="visually-hidden">Platform accounts</caption>
        <thead>
          <tr>
            <th scope="col">Account</th>
            <th scope="col">Role</th>
            <th scope="col">Region</th>
            <th scope="col">Joined</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const isSelf = user.id === currentUserId;
            const name = user.displayName || user.email || "Unnamed account";
            return (
              <tr key={user.id} data-cy="user-row">
                <td data-label="Account">
                  <span className="user-table__name">
                    {name}
                    {isSelf && <span className="user-table__you">You</span>}
                  </span>
                  {user.displayName && user.email && <span className="user-table__email">{user.email}</span>}
                  {(user.jobTitle || user.organisation) && (
                    <span className="user-table__org">{[user.jobTitle, user.organisation].filter(Boolean).join(" · ")}</span>
                  )}
                </td>
                <td data-label="Role">
                  <RoleBadge role={user.role} />
                </td>
                <td data-label="Region">
                  {user.scopeAdminUnitId ? (
                    <ScopeName id={user.scopeAdminUnitId} />
                  ) : (
                    <span className="user-table__muted">All regions</span>
                  )}
                </td>
                <td data-label="Joined">{formatDate(user.createdAt)}</td>
                <td className="user-table__actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Icon name="edit" size={16} />}
                    onClick={() => onEdit(user)}
                    disabled={isSelf}
                    title={isSelf ? "You can't change your own role or region" : undefined}
                    aria-label={`Edit access for ${name}`}
                    data-cy="edit-access"
                  >
                    Edit access
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
