import { Navigate, Outlet } from "react-router";
import { getSession } from "@/lib/session";
import { AppShell } from "./app-shell";

export const ProtectedLayout = ({ allow }: { allow?: string[] }) => {
    const session = getSession();

    if (!session) {
        return <Navigate to="/login" replace />;
    }

    // Backend has no per-role access control on these actions (shared queues,
    // no reviewer-pool model - see lib/review_engine's own comment) - this is
    // a UX guard only, not a real security boundary.
    if (allow && !allow.includes(session.role)) {
        return <Navigate to="/dashboard" replace />;
    }

    return (
        <AppShell>
            <Outlet />
        </AppShell>
    );
};
