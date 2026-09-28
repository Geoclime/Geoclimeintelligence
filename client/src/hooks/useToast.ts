import { useContext } from "react";
import { ToastContext, type ToastContextValue } from "../contexts/ToastContext";

/** `showToast({ type: "success", message: "Saved" })`: the replacement for window.alert. */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}
