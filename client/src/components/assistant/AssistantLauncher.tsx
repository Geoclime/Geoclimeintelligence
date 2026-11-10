import { useCallback, useRef, useState } from "react";
import { useLocation, useMatches } from "react-router";
import type { AuthUser } from "../../types/auth.types";
import { Icon } from "../shared/Icon";
import { AssistantPanel } from "./AssistantPanel";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface AssistantLauncherProps {
  user: AuthUser;
}

/**
 * The top bar's "Ask AI" button and the panel it opens. The AppShell renders it only for people whose
 * role holds "Use AI assistance" (ai.use); the backend checks the same permission on every question.
 */
export function AssistantLauncher({ user }: AssistantLauncherProps) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const matches = useMatches();

  // A place or ward page tells the assistant which area is on screen; elsewhere it gets the home area.
  const params = matches[matches.length - 1]?.params ?? {};
  const onScreen = [params.wardId, params.id].find((value): value is string => typeof value === "string" && UUID.test(value)) ?? null;
  const areaId = onScreen ?? user.homeAdminUnitId ?? null;

  const close = useCallback(() => {
    setOpen(false);
    button.current?.focus();
  }, []);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="app-topbar__help"
        onClick={() => setOpen((value) => !value)}
        aria-label="Ask the AI assistant"
        title="Ask the AI assistant"
        aria-expanded={open}
        data-cy="assistant-open"
      >
        <Icon name="chat" size={18} />
      </button>
      {open && (
        <AssistantPanel
          onClose={close}
          areaId={areaId}
          areaOnScreen={onScreen !== null}
          page={location.pathname}
          isAdmin={user.role === "administrator"}
        />
      )}
    </>
  );
}
