import { XyraLogo } from "@/components/foundations/logo/xyra-logo";
import type { NavAccountType } from "./base-components/nav-account-card";
import { NavButton } from "./base-components/nav-button";
import type { NavItemType } from "./config";
import { NotificationBell } from "./notification-bell";
import { ProfileMenu } from "./profile-menu";

interface HeaderNavigationSimpleProps {
    /** URL of the currently active item. */
    activeUrl?: string;
    /** List of items to display. */
    items: NavItemType[];
    /** Account shown at the trailing end of the header. */
    account?: NavAccountType;
    /** Called when the sign-out button is pressed. */
    onSignOut?: () => void;
}

// Sidebar-free top bar for single/few-destination personas (Reviewer,
// Escalation Manager) - a full SidebarNavigationSimple (search box, account
// card, collapsible sections) is built for the admin app's ~10 sections and
// is overkill when there's only one real page to link to.
export const HeaderNavigationSimple = ({ activeUrl, items, account, onSignOut }: HeaderNavigationSimpleProps) => {
    return (
        <header className="flex h-16 w-full shrink-0 items-center justify-between border-b border-secondary bg-primary px-4 lg:px-8">
            <div className="flex items-center gap-6">
                <XyraLogo className="h-8" />
                <nav>
                    <ul className="flex items-center gap-1">
                        {items.map((item) => (
                            <li key={item.label}>
                                <NavButton href={item.href} icon={item.icon} current={item.href === activeUrl}>
                                    {item.label}
                                </NavButton>
                            </li>
                        ))}
                    </ul>
                </nav>
            </div>

            <div className="flex items-center gap-2">
                <NotificationBell />
                <ProfileMenu account={account} onSignOut={onSignOut} />
            </div>
        </header>
    );
};
