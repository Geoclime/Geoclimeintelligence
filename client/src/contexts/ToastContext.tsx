import { createContext, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { ToastViewport } from "../components/shared/Toast";

export type ToastType = "success" | "error" | "info";

/** A button on a toast, such as "Undo". Pressing it runs `onClick` and dismisses the toast. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastInput {
  type: ToastType;
  message: string;
  /** Milliseconds before it disappears on its own. Errors stay longer by default, and so does a toast with a button. */
  durationMs?: number;
  action?: ToastAction;
}

export interface Toast extends Required<Omit<ToastInput, "action">> {
  id: number;
  action?: ToastAction;
}

export interface ToastContextValue {
  showToast: (toast: ToastInput) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 4;

/**
 * Transient notices ("Access updated", "Couldn't save"). Together with the shared Modal this
 * replaces every native alert/confirm/prompt (standard section 20).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(({ type, message, durationMs, action }: ToastInput) => {
    const toast: Toast = {
      id: nextId.current++,
      type,
      message,
      // Long enough to notice a slip and reach for the button.
      durationMs: durationMs ?? (action ? 10_000 : type === "error" ? 8_000 : 5_000),
      action,
    };
    setToasts((current) => [...current, toast].slice(-MAX_VISIBLE));
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
