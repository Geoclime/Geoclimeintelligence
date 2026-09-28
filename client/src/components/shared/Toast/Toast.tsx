import { useEffect, useState } from "react";
import type { Toast as ToastData } from "../../../contexts/ToastContext";
import { Icon, type IconName } from "../Icon";
import "./Toast.css";

const ICONS: Record<ToastData["type"], IconName> = { success: "check", error: "alert", info: "info" };

function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: number) => void }) {
  // Pause the countdown while the pointer or keyboard focus is on the toast, so it can't vanish
  // mid-read.
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.durationMs);
    return () => window.clearTimeout(timer);
  }, [paused, toast.id, toast.durationMs, onDismiss]);

  return (
    <li
      className={`toast toast--${toast.type}`}
      role={toast.type === "error" ? "alert" : "status"}
      data-cy={`toast-${toast.type}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="toast__icon">
        <Icon name={ICONS[toast.type]} size={18} />
      </span>
      <p className="toast__message">{toast.message}</p>
      <button type="button" className="toast__dismiss" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
        <Icon name="close" size={16} />
      </button>
    </li>
  );
}

interface ToastViewportProps {
  toasts: ToastData[];
  onDismiss: (id: number) => void;
}

/** Rendered once by ToastProvider. Use useToast() to show a toast; never render this directly. */
export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  return (
    <ol className="toast-viewport" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </ol>
  );
}
