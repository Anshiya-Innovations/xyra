import { useEffect, useState } from "react";
import { AlertTriangle, Bell01, Check, CheckCircle, Clock, LogIn03, Trash01 } from "@untitledui/icons";
import type { FC } from "react";
import { Button as AriaButton, Dialog as AriaDialog, DialogTrigger as AriaDialogTrigger, Popover as AriaPopover } from "react-aria-components";
import { useNavigate } from "react-router";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { cx } from "@/utils/cx";
import { type NotificationEntry, notificationApi } from "@/lib/api-client";
import { getSession } from "@/lib/session";

// xyra-web's UI5 route names (see notify() call sites across xyra-core) ->
// this app's actual paths. SystemHealth folded into Configuration's Health
// tab (see system-configuration.tsx); Profile has no page here yet, so it's
// left unmapped - the click still marks the notification read, it just
// doesn't navigate anywhere.
const TARGET_PAGE_ROUTES: Record<string, string> = {
    DeviationReport: "/deviation-report",
    Reviewer1: "/reviewer-1",
    Reviewer2: "/reviewer-2",
    Configuration: "/configuration",
    SystemHealth: "/configuration",
    Profile: "/profile",
};

// Colored by what kind of thing happened, not by the backend's iconClass -
// that field colors by business outcome (e.g. a rejection's ticket is always
// "red" even though a ticket was successfully created), which made every
// notification a REVIEWER/ADMIN can see (ALERT + TICKET - see
// VISIBLE_CATEGORIES_FOR_RESTRICTED below) render identically red. This
// colors by category instead: TICKET = something was created (green), ALERT
// = a deviation was found (red), TASK/REMINDER = informational (neutral).
const CATEGORY_META: Record<string, { circle: string; icon: FC<{ className?: string }> }> = {
    ALERT: { circle: "bg-error-secondary text-error-primary", icon: AlertTriangle },
    TICKET: { circle: "bg-success-secondary text-success-primary", icon: CheckCircle },
    TASK: { circle: "bg-brand-secondary text-brand-secondary", icon: LogIn03 },
    REMINDER: { circle: "bg-warning-secondary text-warning-primary", icon: Clock },
};
const DEFAULT_META = { circle: "bg-secondary text-tertiary", icon: Bell01 };

// Reviewer1/Reviewer2 are both the REVIEWER role (separate accounts, not
// separate roles - see lib/provisioning/seed.js), so filtering on role alone
// covers both personas plus Admin. Escalation Manager/Auditor see everything
// - matches xyra-web's NotificationService.js exactly.
const RESTRICTED_ROLES = new Set(["REVIEWER", "ADMIN"]);
const VISIBLE_CATEGORIES_FOR_RESTRICTED = new Set(["ALERT", "TICKET"]);

function filterForRole(notifications: NotificationEntry[], role: string | undefined): NotificationEntry[] {
    if (!role || !RESTRICTED_ROLES.has(role)) return notifications;
    return notifications.filter((n) => VISIBLE_CATEGORIES_FOR_RESTRICTED.has(n.category));
}

function formatRelativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return "Just now";
    if (min < 60) return `${min} min ago`;
    const hour = Math.floor(min / 60);
    if (hour < 24) return `${hour} ${hour === 1 ? "hour" : "hours"} ago`;
    const day = Math.floor(hour / 24);
    if (day === 1) return "Yesterday";
    return `${day} days ago`;
}

const POLL_INTERVAL_MS = 20000;
type Tab = "ALL" | "TICKET" | "ALERT";
const TAB_LABEL: Record<Tab, string> = { ALL: "All", TICKET: "Ticket", ALERT: "Control Execution" };

export const NotificationBell = () => {
    const navigate = useNavigate();
    const session = getSession();
    const [items, setItems] = useState<NotificationEntry[]>([]);
    const [activeTab, setActiveTab] = useState<Tab>("ALL");
    const [isOpen, setIsOpen] = useState(false);

    const load = () => {
        notificationApi
            .list()
            .then((res) => {
                if (!res.success) return;
                const unread = filterForRole(res.notifications, session?.role).filter((n) => !n.read);
                setItems(unread);
            })
            .catch(() => {});
    };

    useEffect(() => {
        load();
        const interval = setInterval(load, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const markAsRead = (id: string) => {
        setItems((prev) => prev.filter((n) => n.id !== id));
        notificationApi.markAsRead(id).catch(() => {});
    };

    const clearAll = () => {
        setItems([]);
        notificationApi.clearAll().catch(() => {});
    };

    const onItemClick = (item: NotificationEntry) => {
        markAsRead(item.id);
        setIsOpen(false);
        const route = item.targetPage ? TARGET_PAGE_ROUTES[item.targetPage] : null;
        if (route) navigate(route);
    };

    const displayedItems = activeTab === "ALL" ? items : items.filter((n) => n.category === activeTab);

    return (
        <AriaDialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
            <AriaButton
                aria-label="Notifications"
                className="relative flex size-9 cursor-pointer items-center justify-center rounded-full text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2 focus-visible:outline-offset-2"
            >
                <Bell01 className="size-5" />
                {items.length > 0 && (
                    <span className="absolute top-1 right-1 flex size-3.5 items-center justify-center rounded-full bg-fg-error-primary text-[10px] font-bold text-white">
                        {items.length > 9 ? "9+" : items.length}
                    </span>
                )}
            </AriaButton>

            <AriaPopover placement="bottom right" offset={8} className="w-105 max-w-[calc(100vw-2rem)]">
                <AriaDialog className="rounded-xl bg-primary shadow-lg ring-1 ring-secondary_alt outline-hidden">
                    <div className="flex items-center justify-between border-b border-secondary px-4 py-3">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-primary">Your Notifications</h3>
                            {items.length > 0 && (
                                <Badge color="brand" size="sm">
                                    {items.length} New
                                </Badge>
                            )}
                        </div>
                        <Button color="link-destructive" size="sm" iconLeading={Trash01} onClick={clearAll} isDisabled={items.length === 0}>
                            Clear All
                        </Button>
                    </div>

                    <div className="flex items-center gap-1 border-b border-secondary px-4 py-2">
                        {(["ALL", "TICKET", "ALERT"] as const).map((tab) => (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => setActiveTab(tab)}
                                className={cx(
                                    "cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold transition duration-100 ease-linear",
                                    activeTab === tab ? "bg-brand-secondary text-brand-secondary" : "text-tertiary hover:bg-primary_hover",
                                )}
                            >
                                {TAB_LABEL[tab]}
                            </button>
                        ))}
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                        {displayedItems.length === 0 ? (
                            <p className="px-4 py-8 text-center text-sm text-tertiary">No new notifications.</p>
                        ) : (
                            displayedItems.map((item) => {
                                const meta = CATEGORY_META[item.category] ?? DEFAULT_META;
                                const Icon = meta.icon;
                                return (
                                    <div key={item.id} className="flex items-start gap-3 border-b border-secondary px-4 py-3 last:border-0 hover:bg-primary_hover">
                                        <button type="button" onClick={() => onItemClick(item)} className="flex flex-1 cursor-pointer items-start gap-3 text-left">
                                            <span className={cx("flex size-8 shrink-0 items-center justify-center rounded-full", meta.circle)}>
                                                <Icon className="size-4" />
                                            </span>
                                            <div className="min-w-0">
                                                <p className="text-sm text-primary">
                                                    <span className="font-semibold">{item.title}</span> — {item.message}
                                                </p>
                                                <p className="mt-1 text-xs text-tertiary uppercase">{formatRelativeTime(item.createdAt)}</p>
                                            </div>
                                        </button>
                                        <ButtonUtility size="sm" color="tertiary" icon={Check} tooltip="Mark as read" onClick={() => markAsRead(item.id)} />
                                    </div>
                                );
                            })
                        )}
                    </div>
                </AriaDialog>
            </AriaPopover>
        </AriaDialogTrigger>
    );
};
