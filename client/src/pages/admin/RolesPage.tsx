import { Fragment, useState } from "react";
import { RoleFormDialog } from "../../components/roles/RoleFormDialog";
import { Badge } from "../../components/shared/Badge";
import { Button } from "../../components/shared/Button";
import { Callout } from "../../components/shared/Callout";
import { ErrorState } from "../../components/shared/ErrorState";
import { Icon } from "../../components/shared/Icon";
import { LoadingSpinner } from "../../components/shared/LoadingSpinner";
import { Modal } from "../../components/shared/Modal";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { usePermissionCatalog, useRoleActions, useRoles } from "../../hooks/useRoles";
import { useToast } from "../../hooks/useToast";
import { errorMessage } from "../../transport/api-error";
import type { Role } from "../../types/role.types";
import "../../components/roles/roles.css";

/**
 * Roles and permissions (Administrator-only). Every role is a column and every permission a row, so
 * what each role may do reads at a glance. Edit opens a role's permissions; New role makes one. The
 * Administrator role always holds everything and can't be changed. Built-in roles can be edited but not
 * deleted; a role still held by anyone can't be deleted. Every change is in the activity log.
 */
export function RolesPage() {
  useDocumentTitle("Roles");
  const { roles, loading, error, refetch } = useRoles();
  const { catalog, loading: catalogLoading, error: catalogError } = usePermissionCatalog();
  const actions = useRoleActions();
  const { showToast } = useToast();
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await actions.remove(deleting.code);
      showToast({ type: "success", message: `Deleted the role ${deleting.name}.` });
      setDeleting(null);
    } catch (failure) {
      showToast({ type: "error", message: errorMessage(failure) });
    } finally {
      setBusy(false);
    }
  };

  const groups = catalog ? [...new Set(catalog.permissions.map((entry) => entry.group))] : [];

  return (
    <div className="page" data-cy="roles-page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Administration</p>
          <h1 className="page__title">Roles</h1>
          <p className="page__lead">
            What each role may do. Change a role and it applies to everyone who has it at once; make a new role for a job the built-in ones don't fit,
            such as a drainage inspector, then give it to people on the Users screen.
          </p>
        </div>
        <Button icon={<Icon name="plus" size={16} />} onClick={() => setEditing("new")} disabled={!catalog} data-cy="new-role">
          New role
        </Button>
      </header>

      {(error || catalogError) && <ErrorState message={error ?? catalogError ?? ""} onRetry={refetch} />}
      {(loading || catalogLoading) && !error && <LoadingSpinner message="Loading roles…" />}

      {catalog && roles.length > 0 && (
        <section className="card roles-matrix" aria-label="What each role may do">
          <div className="roles-matrix__scroll">
            <table className="roles-matrix__table" data-cy="roles-matrix">
              <thead>
                <tr>
                  <th scope="col" className="roles-matrix__corner">
                    Permission
                  </th>
                  {roles.map((role) => (
                    <th key={role.code} scope="col" className="roles-matrix__role">
                      <span className="roles-matrix__role-name">{role.name}</span>
                      <span className="roles-matrix__role-meta">
                        {role.userCount} {role.userCount === 1 ? "person" : "people"}
                        {role.isSystem ? "" : " · custom"}
                      </span>
                      {role.code === "administrator" ? (
                        <Badge tone="primary">Everything</Badge>
                      ) : (
                        <span className="roles-matrix__actions">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(role)} data-cy={`edit-role-${role.code}`}>
                            Edit
                          </Button>
                          {!role.isSystem && (
                            <Button variant="ghost" size="sm" onClick={() => setDeleting(role)} disabled={role.userCount > 0} title={role.userCount > 0 ? "Give these people another role first" : undefined} data-cy={`delete-role-${role.code}`}>
                              Delete
                            </Button>
                          )}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={group}>
                    <tr className="roles-matrix__group">
                      <th scope="rowgroup" colSpan={roles.length + 1}>
                        {group}
                      </th>
                    </tr>
                    {catalog.permissions
                      .filter((entry) => entry.group === group)
                      .map((entry) => (
                        <tr key={entry.key}>
                          <th scope="row" className="roles-matrix__permission">
                            <span>{entry.label}</span>
                            <span className="roles-matrix__permission-text">{entry.description}</span>
                          </th>
                          {roles.map((role) => {
                            const held = role.permissions.includes(entry.key);
                            return (
                              <td key={role.code} className={held ? "roles-matrix__cell is-held" : "roles-matrix__cell"}>
                                {held ? <Icon name="check" size={16} /> : <span aria-hidden="true">·</span>}
                                <span className="visually-hidden">{held ? "Yes" : "No"}</span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </Fragment>
                ))}
                <tr>
                  <th scope="row" className="roles-matrix__permission">
                    <span>Can be limited to an area</span>
                    <span className="roles-matrix__permission-text">Their access can be narrowed to one LGA or ward on the Users screen.</span>
                  </th>
                  {roles.map((role) => (
                    <td key={role.code} className={role.canBeScoped ? "roles-matrix__cell is-held" : "roles-matrix__cell"}>
                      {role.canBeScoped ? <Icon name="check" size={16} /> : <span aria-hidden="true">·</span>}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <Callout tone="info" title="Only administrators">
            {catalog.adminOnly.join("; ")}. No role can be given these, so nobody can grant themselves more access.
          </Callout>
        </section>
      )}

      {editing && catalog && (
        <RoleFormDialog
          key={editing === "new" ? "new" : editing.code}
          role={editing === "new" ? null : editing}
          catalog={catalog}
          onClose={() => setEditing(null)}
          onCreate={async (body) => {
            await actions.create(body);
            showToast({ type: "success", message: `Created the role ${body.name}.` });
          }}
          onUpdate={async (code, patch) => {
            await actions.update(code, patch);
            showToast({ type: "success", message: "Role updated. It applies to everyone with it now." });
          }}
        />
      )}
      <Modal
        open={deleting !== null}
        title={`Delete the role ${deleting?.name ?? ""}?`}
        description="Nobody has it now. Deleting it can't be undone, but it stays named in the activity log."
        onClose={() => setDeleting(null)}
        dismissible={!busy}
        dataCy="delete-role-dialog"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={busy}>
              Keep it
            </Button>
            <Button variant="danger" loading={busy} loadingLabel="Deleting…" onClick={() => void remove()} data-cy="confirm-delete-role">
              Delete role
            </Button>
          </>
        }
      />
    </div>
  );
}
