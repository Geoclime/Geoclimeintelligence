import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router/dom";
import { queryClient } from "./cache/queryClient";
import { LiveUpdates } from "./components/layout/LiveUpdates";
import { AuthProvider } from "./contexts/AuthContext";
import { FloodAheadProvider } from "./contexts/FloodAheadContext";
import { LiveLocationProvider } from "./contexts/LiveLocationContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ToastProvider } from "./contexts/ToastContext";
import { router } from "./routes";

/** Cross-cutting providers only (standard section 12); feature data lives in feature hooks. */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <LiveLocationProvider>
              <FloodAheadProvider>
                <LiveUpdates />
                <RouterProvider router={router} />
              </FloodAheadProvider>
            </LiveLocationProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
