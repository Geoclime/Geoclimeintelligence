import { lazy } from "react";
import { createBrowserRouter } from "react-router";
import { AppShell, type RouteHandle } from "./components/layout/AppShell";
import { AuthLayout } from "./components/layout/AuthLayout";
import { GuestOnly } from "./components/routing/GuestOnly";
import { RequireAuth } from "./components/routing/RequireAuth";
import { RequireRole } from "./components/routing/RequireRole";
import { RouteErrorPage } from "./pages/RouteErrorPage";

// Route-level code splitting (standard section 13): a signed-out visitor never downloads the
// app screens, and nobody downloads the admin import screens until they open one.
const page = <M,>(load: () => Promise<M>, pick: (m: M) => React.ComponentType) =>
  lazy(() => load().then((m) => ({ default: pick(m) })));

const SignInPage = page(() => import("./pages/auth/SignInPage"), (m) => m.SignInPage);
const SignUpPage = page(() => import("./pages/auth/SignUpPage"), (m) => m.SignUpPage);
const ForgotPasswordPage = page(() => import("./pages/auth/ForgotPasswordPage"), (m) => m.ForgotPasswordPage);
const MapPage = page(() => import("./pages/map/MapPage"), (m) => m.MapPage);
const AccountPage = page(() => import("./pages/account/AccountPage"), (m) => m.AccountPage);
const PlacesPage = page(() => import("./pages/places/PlacesPage"), (m) => m.PlacesPage);
const LgaProfilePage = page(() => import("./pages/places/LgaProfilePage"), (m) => m.LgaProfilePage);
const WardPage = page(() => import("./pages/places/WardPage"), (m) => m.WardPage);
const AdminUsersPage = page(() => import("./pages/admin/AdminUsersPage"), (m) => m.AdminUsersPage);
const AdminCountriesPage = page(() => import("./pages/admin/countries/AdminCountriesPage"), (m) => m.AdminCountriesPage);
const CountryFormPage = page(() => import("./pages/admin/countries/CountryFormPage"), (m) => m.CountryFormPage);
const CountryDetailPage = page(() => import("./pages/admin/countries/CountryDetailPage"), (m) => m.CountryDetailPage);
const ImportHistoryPage = page(() => import("./pages/admin/imports/ImportHistoryPage"), (m) => m.ImportHistoryPage);
const ImportNewPage = page(() => import("./pages/admin/imports/ImportNewPage"), (m) => m.ImportNewPage);
const ImportReviewPage = page(() => import("./pages/admin/imports/ImportReviewPage"), (m) => m.ImportReviewPage);
const NotFoundPage = page(() => import("./pages/NotFoundPage"), (m) => m.NotFoundPage);

const fullBleed: RouteHandle = { fullBleed: true };

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
              { index: true, element: <MapPage />, handle: fullBleed },
              { path: "account", element: <AccountPage /> },
              { path: "places", element: <PlacesPage /> },
              { path: "places/:id", element: <LgaProfilePage /> },
              { path: "places/:id/wards/:wardId", element: <WardPage /> },
              {
                path: "admin",
                element: <RequireRole roles={["administrator"]} />,
                children: [
                  { path: "users", element: <AdminUsersPage /> },
                  { path: "countries", element: <AdminCountriesPage /> },
                  { path: "countries/new", element: <CountryFormPage /> },
                  { path: "countries/:code", element: <CountryDetailPage /> },
                  { path: "countries/:code/edit", element: <CountryFormPage /> },
                  { path: "imports", element: <ImportHistoryPage /> },
                  { path: "imports/new", element: <ImportNewPage /> },
                  { path: "imports/:id", element: <ImportReviewPage /> },
                ],
              },
              { path: "*", element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]);
