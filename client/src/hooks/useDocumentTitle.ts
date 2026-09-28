import { useEffect } from "react";

const APP_NAME = "GeoClime Intelligence";

/** Sets the browser tab title, so screen-reader users hear where they landed after navigating. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}
