import { lazy } from "react";
import { createBrowserRouter } from "react-router";
import { AppShell } from "./components/layout/AppShell";
import { AuthLayout } from "./components/layout/AuthLayout";
import { GuestOnly } from "./components/routing/GuestOnly";
import { RequireAuth } from "./components/routing/RequireAuth";
import { RequireRole } from "./components/routing/RequireRole";
import { RouteErrorPage } from "./pages/RouteErrorPage";

// Route-level code splitting (standard section 13): a signed-out visitor never downloads the
// admin screens, and a public user never downloads them either.
const SignInPage = lazy(() => import("./pages/auth/SignInPage").then((m) => ({ default: m.SignInPage })));
const SignUpPage = lazy(() => import("./pages/auth/SignUpPage").then((m) => ({ default: m.SignUpPage })));
const ForgotPasswordPage = lazy(() =>
  import("./pages/auth/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })),
);
const HomePage = lazy(() => import("./pages/home/HomePage").then((m) => ({ default: m.HomePage })));
const AdminUsersPage = lazy(() => import("./pages/admin/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })));

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: "/sign-in", element: <SignInPage /> },
              { path: "/sign-up", element: <SignUpPage /> },
              { path: "/forgot-password", element: <ForgotPasswordPage /> },
            ],
          },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: <HomePage /> },
              {
                path: "admin",
                element: <RequireRole roles={["administrator"]} />,
                children: [{ path: "users", element: <AdminUsersPage /> }],
              },
              { path: "*", element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]);
