import { lazy } from "react";
import { createBrowserRouter } from "react-router";
import { AppShell, type RouteHandle } from "./components/layout/AppShell";
import { AuthLayout } from "./components/layout/AuthLayout";
import { PublicLayout } from "./components/layout/PublicLayout";
import { GuestOnly } from "./components/routing/GuestOnly";
import { RequireAuth } from "./components/routing/RequireAuth";
import { RequireCompleteProfile } from "./components/routing/RequireCompleteProfile";
import { RequireRole } from "./components/routing/RequireRole";
import { RouteErrorPage } from "./pages/RouteErrorPage";

// Route-level code splitting (standard section 13): a signed-out visitor never downloads the
// app screens, and nobody downloads the admin import screens until they open one.
const page = <M,>(load: () => Promise<M>, pick: (m: M) => React.ComponentType) =>
  lazy(() => load().then((m) => ({ default: pick(m) })));

const LandingPage = page(() => import("./pages/landing/LandingPage"), (m) => m.LandingPage);
const AboutPage = page(() => import("./pages/public/AboutPage"), (m) => m.AboutPage);
const ContactPage = page(() => import("./pages/public/ContactPage"), (m) => m.ContactPage);
const AccessibilityPage = page(() => import("./pages/public/AccessibilityPage"), (m) => m.AccessibilityPage);
const PrivacyPage = page(() => import("./pages/public/PrivacyPage"), (m) => m.PrivacyPage);
const TermsPage = page(() => import("./pages/public/TermsPage"), (m) => m.TermsPage);
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
const ConfigurationPage = page(() => import("./pages/admin/configuration/ConfigurationPage"), (m) => m.ConfigurationPage);
const ImportHistoryPage = page(() => import("./pages/admin/imports/ImportHistoryPage"), (m) => m.ImportHistoryPage);
const ImportNewPage = page(() => import("./pages/admin/imports/ImportNewPage"), (m) => m.ImportNewPage);
const ImportReviewPage = page(() => import("./pages/admin/imports/ImportReviewPage"), (m) => m.ImportReviewPage);
const AlertsPage = page(() => import("./pages/alerts/AlertsPage"), (m) => m.AlertsPage);
const ReportFloodPage = page(() => import("./pages/reports/ReportFloodPage"), (m) => m.ReportFloodPage);
const ReviewReportsPage = page(() => import("./pages/reports/ReviewReportsPage"), (m) => m.ReviewReportsPage);
const WelcomePage = page(() => import("./pages/onboarding/WelcomePage"), (m) => m.WelcomePage);
const NotificationsPage = page(() => import("./pages/notifications/NotificationsPage"), (m) => m.NotificationsPage);
const HelpPage = page(() => import("./pages/help/HelpPage"), (m) => m.HelpPage);
const NotFoundPage = page(() => import("./pages/NotFoundPage"), (m) => m.NotFoundPage);

const fullBleed: RouteHandle = { fullBleed: true };

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      // The public site: open to everyone, signed in or not, so it sits outside both guards.
      {
        element: <PublicLayout />,
        children: [
          { index: true, element: <LandingPage /> },
          { path: "about", element: <AboutPage /> },
          { path: "contact", element: <ContactPage /> },
          { path: "accessibility", element: <AccessibilityPage /> },
          { path: "privacy", element: <PrivacyPage /> },
          { path: "terms", element: <TermsPage /> },
        ],
      },
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
          // Finish setting up: signed in, but before the app (RequireCompleteProfile sends people here).
          {
            element: <AuthLayout />,
            children: [{ path: "welcome", element: <WelcomePage /> }],
          },
          {
            element: <RequireCompleteProfile />,
            children: [
              {
                element: <AppShell />,
                children: [
                  { path: "map", element: <MapPage />, handle: fullBleed },
                  { path: "account", element: <AccountPage /> },
                  { path: "notifications", element: <NotificationsPage /> },
                  { path: "help", element: <HelpPage /> },
                  { path: "alerts", element: <AlertsPage /> },
                  { path: "report", element: <ReportFloodPage /> },
                  {
                    path: "reports/review",
                    element: <RequireRole roles={["emergency_responder", "government_official"]} />,
                    children: [{ index: true, element: <ReviewReportsPage /> }],
                  },
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
                      { path: "configuration", element: <ConfigurationPage /> },
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
    ],
  },
]);
