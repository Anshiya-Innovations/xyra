import type { ReactNode } from "react";
import { SearchLg } from "@untitledui/icons";
import { Input } from "@/components/base/input/input";
import { XyraLogoDark } from "@/components/foundations/logo/xyra-logo";
import { cx } from "@/utils/cx";
import { MobileNavigationHeader } from "../base-components/mobile-header";
import { NavAccountCard, type NavAccountType } from "../base-components/nav-account-card";
import { NavItemBase } from "../base-components/nav-item";
import { NavList } from "../base-components/nav-list";
import type { NavItemType } from "../config";

interface SidebarNavigationProps {
    /** URL of the currently active item. */
    activeUrl?: string;
    /** List of items to display. */
    items: NavItemType[];
    /** List of footer items to display. */
    footerItems?: NavItemType[];
    /** Feature card to display. */
    featureCard?: ReactNode;
    /** Whether to show the account card. */
    showAccountCard?: boolean;
    /** Whether to hide the right side border. */
    hideBorder?: boolean;
    /** Additional CSS classes to apply to the sidebar. */
    className?: string;
    /** Whether to round the account card avatar. */
    avatarRounded?: boolean;
    /** Account shown in the account card - defaults to the library's demo account. */
    account?: NavAccountType;
    /** Called when "Sign out" is pressed in the account card. */
    onSignOut?: () => void;
}

export const SidebarNavigationSimple = ({
    activeUrl,
    items,
    footerItems = [],
    featureCard,
    showAccountCard = true,
    hideBorder = false,
    className,
    account,
    onSignOut,
}: SidebarNavigationProps) => {
    const MAIN_SIDEBAR_WIDTH = 280;

    const content = (
        <aside
            style={
                {
                    "--width": `${MAIN_SIDEBAR_WIDTH}px`,
                } as React.CSSProperties
            }
            className={cx(
                // Sidebar chrome is always dark, independent of the app-wide
                // light/dark theme (matches the SAPUI5 app's Fiori shell) -
                // "dark-mode" scopes every semantic color token (text-primary,
                // border-secondary, etc.) used below to their dark values, see
                // theme.css's ".dark-mode" block. bg-[#0f172a] pins the exact
                // navy xyra-web's sidebar uses (see webapp/css/style.css's
                // .sapTntSideNavigation), not just "whatever dark token Untitled
                // UI ships".
                "dark-mode xyra-sidebar flex h-full w-full max-w-full flex-col justify-between overflow-auto bg-[#0f172a] pt-4 lg:w-(--width) lg:pt-5",
                !hideBorder && "border-secondary md:border-r",
                className,
            )}
        >
            <div className="flex flex-col gap-5 px-4 lg:px-5">
                {/* self-start: this flex-col defaults to align-items:stretch, which
                    stretches the img to the full sidebar width and then
                    object-contain re-centers the visible logo inside that
                    invisible stretched box - self-start stops the stretch.
                    w-25 (100px) matches xyra-web's own logo width exactly. */}
                <XyraLogoDark className="h-auto w-25 self-start" />

                {/* wrapperClassName: bg-primary is transparent in .xyra-sidebar (so
                    default nav rows blend into the navy), so these need their
                    own fill or they'd disappear entirely. */}
                {/* Mobile search input */}
                <Input
                    size="md"
                    aria-label="Search"
                    placeholder="Search"
                    icon={SearchLg}
                    className="md:hidden"
                    wrapperClassName="bg-white/5! ring-white/10!"
                />

                {/* Desktop search input */}
                <Input
                    shortcut
                    size="sm"
                    aria-label="Search"
                    placeholder="Search"
                    icon={SearchLg}
                    className="max-md:hidden"
                    wrapperClassName="bg-white/5! ring-white/10!"
                />
            </div>

            <NavList activeUrl={activeUrl} items={items} />

            <div className="mt-auto flex flex-col gap-3 px-4 py-4 lg:py-5">
                {footerItems.length > 0 && (
                    <ul className="flex flex-col">
                        {footerItems.map((item) => (
                            <li key={item.label} className="py-px">
                                <NavItemBase badge={item.badge} icon={item.icon} href={item.href} type="link" current={item.href === activeUrl}>
                                    {item.label}
                                </NavItemBase>
                            </li>
                        ))}
                    </ul>
                )}

                {featureCard}

                {showAccountCard && account && (
                    <NavAccountCard items={[account]} selectedAccountId={account.id} onSignOut={onSignOut} />
                )}
            </div>
        </aside>
    );

    return (
        <>
            {/* Mobile header navigation */}
            <MobileNavigationHeader>{content}</MobileNavigationHeader>

            {/* Desktop sidebar navigation */}
            <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex">{content}</div>

            {/* Placeholder to take up physical space because the real sidebar has `fixed` position. */}
            <div
                style={{
                    paddingLeft: MAIN_SIDEBAR_WIDTH,
                }}
                className="invisible hidden lg:sticky lg:top-0 lg:bottom-0 lg:left-0 lg:block"
            />
        </>
    );
};
