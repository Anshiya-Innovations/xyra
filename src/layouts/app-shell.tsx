import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { HeaderNavigationSimple } from "@/components/application/app-navigation/header-navigation-simple";
import { NotificationBell } from "@/components/application/app-navigation/notification-bell";
import { ProfileMenu } from "@/components/application/app-navigation/profile-menu";
import { SidebarNavigationSimple } from "@/components/application/app-navigation/sidebar-navigation/sidebar-simple";
import { NotificationRegion } from "@/components/application/notification/notification";
import { ESCALATION_MANAGER_NAV_ITEMS, NAV_ITEMS, reviewerNavItems } from "@/lib/nav-items";
import { clearSession, getSession } from "@/lib/session";

export const AppShell = ({ children }: { children: ReactNode }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const session = getSession();

    const onSignOut = () => {
        clearSession();
        navigate("/login");
    };

    const account = session
        ? {
              id: session.userId,
              name: session.name,
              email: session.email,
              initials: session.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase(),
              status: "online" as const,
          }
        : undefined;

    // Reviewer/Escalation Manager have only one real destination each - a
    // full sidebar (search box, ~10 collapsible sections) is built for the
    // admin app and would be empty chrome around a single link here.
    if (session?.role === "REVIEWER" || session?.role === "ESCALATION_MANAGER") {
        const items = session.role === "REVIEWER" ? reviewerNavItems(location.pathname.startsWith("/reviewer-2") ? 2 : 1) : ESCALATION_MANAGER_NAV_ITEMS;
        return (
            <div className="flex min-h-dvh flex-col bg-secondary">
                <HeaderNavigationSimple activeUrl={location.pathname} items={items} account={account} onSignOut={onSignOut} />
                <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
                <NotificationRegion />
            </div>
        );
    }

    return (
        <div className="flex min-h-dvh bg-secondary">
            <SidebarNavigationSimple activeUrl={location.pathname} items={NAV_ITEMS} showAccountCard={false} />
            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex h-14 shrink-0 items-center justify-end gap-2 border-b border-secondary bg-primary px-4 lg:px-8">
                    <NotificationBell />
                    <ProfileMenu account={account} onSignOut={onSignOut} />
                </div>
                <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
            </div>
            <NotificationRegion />
        </div>
    );
};
