import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { ProtectedLayout } from "@/layouts/protected-layout";
import { NotFound } from "@/pages/not-found";
import { LoginPage } from "@/pages/login";
import { ProfilePage } from "@/pages/profile";
import { AccessManagementPage } from "@/pages/admin/access-management";
import { AlertItemPage } from "@/pages/admin/alert-item";
import { AuditLogsPage } from "@/pages/admin/audit-logs";
import { ControlEditorPage } from "@/pages/admin/control-editor";
import { ControlsPage } from "@/pages/admin/controls";
import { DashboardPage } from "@/pages/admin/dashboard";
import { DeviationReportPage } from "@/pages/admin/deviation-report";
import { OrganizationPage } from "@/pages/admin/organization";
import { OrganizationDetailsPage } from "@/pages/admin/organization-details";
import { PlaceholderPage } from "@/pages/admin/placeholder-page";
import { ReportsPage } from "@/pages/admin/reports";
import { SystemConfigurationPage } from "@/pages/admin/system-configuration";
import { SystemControlConfigPage } from "@/pages/admin/system-control-config";
import { SystemControlConfigDetailsPage } from "@/pages/admin/system-control-config-details";
import { EscalationManagerPage } from "@/pages/escalation-manager/escalation-manager";
import { Reviewer1Page } from "@/pages/reviewer/reviewer1";
import { Reviewer2Page } from "@/pages/reviewer/reviewer2";
import { RouteProvider } from "@/providers/router-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import "@/styles/globals.css";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        {/* ponytail: locked to light for now, no dark-mode toggle exposed yet - revisit when asked. */}
        <ThemeProvider defaultTheme="light">
            {/* import.meta.env.BASE_URL mirrors vite.config.ts's `base` - "/"
            locally, "/xyra/" in the GitHub Pages build (VITE_BASE_PATH) -
            without it every route is matched against the wrong prefix and
            falls through to the catch-all 404 below. */}
            <BrowserRouter basename={import.meta.env.BASE_URL}>
                <RouteProvider>
                    <Routes>
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
                        <Route path="/login" element={<LoginPage />} />

                        <Route element={<ProtectedLayout />}>
                            <Route path="/dashboard" element={<DashboardPage />} />
                            <Route path="/controls" element={<ControlsPage />} />
                            <Route path="/controls/new" element={<ControlEditorPage />} />
                            <Route path="/controls/:controlId" element={<ControlEditorPage />} />
                            <Route path="/system-control-config" element={<SystemControlConfigPage />} />
                            <Route path="/system-control-config/:configId" element={<SystemControlConfigDetailsPage />} />
                            <Route path="/deviation-report" element={<DeviationReportPage />} />
                            <Route path="/deviation-report/:alertId" element={<AlertItemPage />} />
                            <Route path="/ai-insights" element={<PlaceholderPage title="AI Insights" />} />
                            <Route path="/sox-compliance" element={<PlaceholderPage title="SOX Compliance" />} />
                            <Route path="/reports" element={<ReportsPage />} />
                            <Route path="/audit-logs" element={<AuditLogsPage />} />
                            <Route path="/configuration" element={<SystemConfigurationPage />} />
                            <Route path="/access-management" element={<AccessManagementPage />} />
                            <Route path="/organization" element={<OrganizationPage />} />
                            <Route path="/organization/:orgId" element={<OrganizationDetailsPage />} />
                            <Route path="/risk-analytics" element={<PlaceholderPage title="Risk Analytics" />} />
                        </Route>

                        <Route element={<ProtectedLayout />}>
                            <Route path="/profile" element={<ProfilePage />} />
                        </Route>

                        <Route element={<ProtectedLayout allow={["REVIEWER"]} />}>
                            <Route path="/reviewer-1" element={<Reviewer1Page />} />
                            <Route path="/reviewer-2" element={<Reviewer2Page />} />
                        </Route>

                        <Route element={<ProtectedLayout allow={["ESCALATION_MANAGER"]} />}>
                            <Route path="/escalation-manager" element={<EscalationManagerPage />} />
                        </Route>

                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </RouteProvider>
            </BrowserRouter>
        </ThemeProvider>
    </StrictMode>,
);
