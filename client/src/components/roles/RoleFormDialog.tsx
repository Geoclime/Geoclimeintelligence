import { useId, useState } from "react";
import { errorMessage } from "../../transport/api-error";
import type { Permission } from "../../types/auth.types";
import type { NewRoleBody, PermissionCatalog, Role, RolePatch } from "../../types/role.types";
import { Button } from "../shared/Button";
import { Callout } from "../shared/Callout";
import { Modal } from "../shared/Modal";
import { TextAreaField } from "../shared/TextAreaField";
import { TextField } from "../shared/TextField";
import "../users/users.css";
import "./roles.css";

interface RoleFormDialogProps {
  /** The role being changed, or null to create one. */
  role: Role | null;
  catalog: PermissionCatalog;
  onClose: () => void;
  onCreate: (body: NewRoleBody) => Promise<unknown>;
  onUpdate: (code: string, patch: RolePatch) => Promise<unknown>;
}

/** "Field inspector" → "field_inspector": a code suggested from the name, which the administrator can change. */
const codeFrom = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "r_$1")
    .slice(0, 32);

/**
 * Create a role, or change one: its name and description, whether its users may be limited to an area,
 * and exactly which permissions it holds (ticked here, grouped as on the Roles screen). Render it with a
 * fresh `key` each time it opens.
 */
export function RoleFormDialog({ role, catalog, onClose, onCreate, onUpdate }: RoleFormDialogProps) {
  const formId = useId();
  const creating = role === null;
  const [name, setName] = useState(role?.name ?? "");
  const [code, setCode] = useState(role?.code ?? "");
  const [codeTouched, setCodeTouched] = useState(false);
  const [description, setDescription] = useState(role?.description ?? "");
  const [canBeScoped, setCanBeScoped] = useState(role?.canBeScoped ?? false);
  const [permissions, setPermissions] = useState<Set<Permission>>(new Set(role?.permissions ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = [...new Set(catalog.permissions.map((entry) => entry.group))];
  const toggle = (key: Permission, on: boolean) =>
    setPermissions((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const finalCode = creating ? (codeTouched ? code : codeFrom(name)) : code;
    if (name.trim().length < 2 || !description.trim() || (creating && !/^[a-z][a-z0-9_]{1,31}$/.test(finalCode))) {
      setError("Give the role a name, say who it is for, and a code of lower-case letters, digits and underscores.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const chosen = [...permissions];
      if (creating) await onCreate({ code: finalCode, name: name.trim(), description: description.trim(), canBeScoped, permissions: chosen });
      else await onUpdate(code, { name: name.trim(), description: description.trim(), canBeScoped, permissions: chosen });
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={creating ? "New role" : `Edit ${role.name}`}
      description={creating ? "A role is a set of permissions. Give it to people on the Users screen." : `Changes apply to everyone with this role at once (${role.userCount} ${role.userCount === 1 ? "person" : "people"}).`}
      onClose={onClose}
      dismissible={!busy}
      dataCy="role-form-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy} loadingLabel="Saving…" data-cy="save-role">
            {creating ? "Create role" : "Save changes"}
          </Button>
        </>
      }
    >
      <form id={formId} className="access-form" onSubmit={(event) => void submit(event)} noValidate>
        {error && (
          <Callout tone="danger" dataCy="form-error">
            {error}
          </Callout>
        )}
        <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Field inspector" maxLength={64} data-cy="role-name" />
        {creating && (
          <TextField
            label="Code"
            value={codeTouched ? code : codeFrom(name)}
            onChange={(event) => {
              setCodeTouched(true);
              setCode(event.target.value);
            }}
            hint="How the platform refers to it. It can't be changed later."
            className="mono-input"
            spellCheck={false}
            data-cy="role-code"
          />
        )}
        <TextAreaField label="Who it is for" rows={2} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} data-cy="role-description" />
        <label className="check-field">
          <input type="checkbox" checked={canBeScoped} onChange={(event) => setCanBeScoped(event.target.checked)} data-cy="role-scopable" />
          <span>People with this role can be limited to one area (an LGA or ward)</span>
        </label>

        {groups.map((group) => (
          <fieldset key={group} className="role-picker">
            <legend className="role-picker__legend">{group}</legend>
            {catalog.permissions
              .filter((entry) => entry.group === group)
              .map((entry) => (
                <label key={entry.key} className="role-picker__option" data-cy={`permission-${entry.key}`}>
                  <input type="checkbox" checked={permissions.has(entry.key)} onChange={(event) => toggle(entry.key, event.target.checked)} />
                  <span className="role-picker__text">
                    <span className="role-picker__label">{entry.label}</span>
                    <span className="role-picker__description">{entry.description}</span>
                  </span>
                </label>
              ))}
          </fieldset>
        ))}
        <p className="access-form__note">Only administrators can ever: {catalog.adminOnly.join("; ")}.</p>
      </form>
    </Modal>
  );
}
