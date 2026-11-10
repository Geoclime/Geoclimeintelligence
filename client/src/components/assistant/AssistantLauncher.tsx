import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useMatches } from "react-router";
import type { AuthUser } from "../../types/auth.types";
import { Icon } from "../shared/Icon";
import { AssistantPanel } from "./AssistantPanel";
import { FAB_GAP, panelPlacement, useDockPosition } from "./useDockPosition";
import "./assistant.css";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Set on <html> while the button rests in its usual bottom-right corner, so toasts, banners and map panels
 * keep clear of it. Dragged anywhere else, nothing needs to move.
 */
const CORNER_CLASS = "has-assistant";
const EXPANDED_KEY = "geoclime.assistant.expanded";

function loadExpanded(): boolean {
  try {
    return localStorage.getItem(EXPANDED_KEY) === "1";
  } catch {
    return false;
  }
}

interface AssistantLauncherProps {
  user: AuthUser;
}

/**
 * The AI assistant widget: a round button that starts in the bottom-right corner and can be dragged to any
 * height on either side, and the chat it opens beside it. The AppShell renders it only for people whose
 * role holds "Use AI assistance" (ai.use); the backend checks the same permission on every question.
 */
export function AssistantLauncher({ user }: AssistantLauncherProps) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(loadExpanded);
  const button = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const matches = useMatches();
  const dock = useDockPosition();

  const inCorner = dock.docked.side === "right" && dock.docked.offset <= FAB_GAP + 4;
  useEffect(() => {
    document.documentElement.classList.toggle(CORNER_CLASS, inCorner);
    return () => document.documentElement.classList.remove(CORNER_CLASS);
  }, [inCorner]);

  // A place or ward page tells the assistant which area is on screen; elsewhere it gets the home area.
  const params = matches[matches.length - 1]?.params ?? {};
  const onScreen = [params.wardId, params.id].find((value): value is string => typeof value === "string" && UUID.test(value)) ?? null;
  const areaId = onScreen ?? user.homeAdminUnitId ?? null;

  const close = useCallback(() => {
    setOpen(false);
    button.current?.focus();
  }, []);

  const toggleExpanded = useCallback(() => {
    setExpanded((value) => {
      try {
        localStorage.setItem(EXPANDED_KEY, value ? "0" : "1");
      } catch {
        // Not remembered next time.
      }
      return !value;
    });
  }, []);

  const classes = ["assistant-fab", open && "is-open", dock.docked.side === "left" && "is-left", dock.dragging && "is-dragging", dock.settling && "is-settling"]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      {open && (
        <AssistantPanel
          onClose={close}
          areaId={areaId}
          areaOnScreen={onScreen !== null}
          page={location.pathname}
          isAdmin={user.role === "administrator"}
          expanded={expanded}
          onToggleExpanded={toggleExpanded}
          placement={panelPlacement(dock.docked, dock.viewport, expanded)}
        />
      )}
      <button
        ref={button}
        type="button"
        className={classes}
        {...dock.buttonProps}
        onClick={() => {
          if (dock.wasDrag()) return;
          if (open) close();
          else setOpen(true);
        }}
        aria-label={open ? "Close the AI assistant" : "Ask the AI assistant"}
        aria-description="Drag to move it, or press Alt and an arrow key."
        title={open ? "Close" : "Ask the AI assistant (drag to move)"}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-cy="assistant-open"
      >
        <Icon name={open ? "close" : "chat"} size={24} />
      </button>
    </>
  );
}
