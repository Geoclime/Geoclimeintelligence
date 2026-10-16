import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "../../components/shared/Button";
import { EmptyState } from "../../components/shared/EmptyState";
import { ErrorState } from "../../components/shared/ErrorState";
import { Icon } from "../../components/shared/Icon";
import { LoadingSpinner } from "../../components/shared/LoadingSpinner";
import { Pagination } from "../../components/shared/Pagination";
import { UserAccessDialog } from "../../components/users/UserAccessDialog";
import { UserTable } from "../../components/users/UserTable";
import { useAuth } from "../../hooks/useAuth";
import { useDebounce } from "../../hooks/useDebounce";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useToast } from "../../hooks/useToast";
import { useUpdateUserAccess } from "../../hooks/useUpdateUserAccess";
import { useUsers } from "../../hooks/useUsers";
import { USER_ROLES, type UserRole } from "../../types/auth.types";
import type { ManagedUser } from "../../types/user.types";
import { parsePageParam } from "../../utils/pagination";
import { roleLabel } from "../../utils/roles";

/**
 * Administrator user management: list accounts and change their role and region scope.
 * The page number, search text and role filter live in the URL (?page=2&q=ada&role=researcher),
 * so a refresh or a shared link keeps the view.
 */
export function AdminUsersPage() {
  useDocumentTitle("Users");
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parsePageParam(searchParams.get("page"));
  const roleParam = searchParams.get("role");
  const role = USER_ROLES.includes(roleParam as UserRole) ? (roleParam as UserRole) : undefined;
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const q = useDebounce(query.trim(), 300);
  const [editing, setEditing] = useState<ManagedUser | null>(null);

  // A new search starts from the first page.
  useEffect(() => {
    setSearchParams(
      (params) => {
        if ((params.get("q") ?? "") === q) return params;
        if (q) params.set("q", q);
        else params.delete("q");
        params.delete("page");
        return params;
      },
      { replace: true },
    );
  }, [q, setSearchParams]);

  const setRole = (next: string) =>
    setSearchParams((params) => {
      if (next) params.set("role", next);
      else params.delete("role");
      params.delete("page");
      return params;
    });

  const filtered = Boolean(q || role);
  const { users, loading, error, total, pageSize, hasNext, hasPrev, refetch, replaceUser } = useUsers({ page, q, role });
  const { saveAccess } = useUpdateUserAccess();

  const goToPage = useCallback(
    (next: number) => {
      setSearchParams((params) => {
        params.set("page", String(next));
        return params;
      });
    },
    [setSearchParams],
  );

  const handleSaved = useCallback(
    (updated: ManagedUser) => {
      replaceUser(updated);
      setEditing(null);
      const name = updated.displayName || updated.email || "The account";
      showToast({ type: "success", message: `${name} is now ${roleLabel(updated.role)}.` });
    },
    [replaceUser, showToast],
  );

  const renderBody = () => {
    if (loading && users.length === 0) return <LoadingSpinner message="Loading accounts…" />;
    if (error) return <ErrorState message={error} onRetry={() => void refetch()} />;
    if (users.length === 0 && total > 0) {
      return (
        <EmptyState
          title="This page is empty"
          message={`There are only ${total.toLocaleString()} accounts.`}
          action={
            <Button variant="secondary" onClick={() => goToPage(1)}>
              Go to the first page
            </Button>
          }
        />
      );
    }
    if (users.length === 0 && filtered) {
      return (
        <EmptyState
          icon="search"
          title="No matching accounts"
          message="Nobody matches this search and role. Try part of a name, email or organisation."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                setRole("");
              }}
            >
              Clear filters
            </Button>
          }
        />
      );
    }
    if (users.length === 0) {
      return <EmptyState icon="users" title="No accounts yet" message="Accounts appear here after someone signs up." />;
    }
    return (
      <>
        <UserTable users={users} currentUserId={currentUser?.id ?? ""} onEdit={setEditing} />
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          hasPrev={hasPrev}
          hasNext={hasNext}
          onPageChange={goToPage}
          itemLabel="accounts"
          disabled={loading}
        />
      </>
    );
  };

  return (
    <div className="page" data-cy="admin-users-page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Administration</p>
          <h1 className="page__title">Users</h1>
          <p className="page__lead">
            Every new account starts as General Public. Grant staff roles here, and limit responders and officials to
            a region where needed.
          </p>
        </div>
      </header>

      <section className="card" aria-busy={loading} aria-label="Accounts">
        <div className="toolbar">
          <label className="toolbar__search">
            <span className="visually-hidden">Search accounts</span>
            <Icon name="search" size={16} />
            <input
              type="search"
              className="field__input"
              placeholder="Search name, email or organisation"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              data-cy="user-search"
            />
          </label>
          <label className="toolbar__filter">
            <span className="visually-hidden">Filter by role</span>
            <select
              className="field__input"
              value={role ?? ""}
              onChange={(event) => setRole(event.target.value)}
              data-cy="user-role-filter"
            >
              <option value="">All roles</option>
              {USER_ROLES.map((value) => (
                <option key={value} value={value}>
                  {roleLabel(value)}
                </option>
              ))}
            </select>
          </label>
          {!loading && total > 0 && (
            <p className="toolbar__meta" aria-live="polite">
              {total.toLocaleString()} {total === 1 ? "account" : "accounts"}
              {filtered ? " match" : ""}
            </p>
          )}
        </div>
        {renderBody()}
      </section>

      <UserAccessDialog
        key={editing?.id ?? "closed"}
        user={editing}
        onClose={() => setEditing(null)}
        onSave={saveAccess}
        onSaved={handleSaved}
      />
    </div>
  );
}
