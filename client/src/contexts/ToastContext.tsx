import { createContext, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { ToastViewport } from "../components/shared/Toast";

export type ToastType = "success" | "error" | "info";

export interface ToastInput {
  type: ToastType;
  message: string;
  /** Milliseconds before it disappears on its own. Errors stay longer by default. */
  durationMs?: number;
}

export interface Toast extends Required<ToastInput> {
  id: number;
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

  const showToast = useCallback(({ type, message, durationMs }: ToastInput) => {
    const toast: Toast = {
      id: nextId.current++,
      type,
      message,
      durationMs: durationMs ?? (type === "error" ? 8_000 : 5_000),
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
