import { LogOut01, User01 } from "@untitledui/icons";
import { Button as AriaButton } from "react-aria-components";
import { useNavigate } from "react-router";
import { Avatar } from "@/components/base/avatar/avatar";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import type { NavAccountType } from "./base-components/nav-account-card";

interface ProfileMenuProps {
    /** Account shown in the trigger avatar and the popover. */
    account?: NavAccountType;
    /** Called when "Sign out" is pressed. */
    onSignOut?: () => void;
}

// Avatar trigger + popover (name/email, View Profile, Sign out) - shared by
// every shell (admin top bar, Reviewer/Escalation Manager header) so the
// account menu looks and behaves the same everywhere.
export const ProfileMenu = ({ account, onSignOut }: ProfileMenuProps) => {
    const navigate = useNavigate();

    if (!account) return null;

    return (
        <Dropdown.Root>
            <AriaButton
                aria-label="Profile"
                className="cursor-pointer rounded-full outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:outline-offset-2"
            >
                <Avatar size="sm" initials={account.initials} status={account.status} />
            </AriaButton>
            <Dropdown.Popover placement="bottom right">
                <div className="flex items-center gap-3 px-4 py-3">
                    <Avatar size="md" initials={account.initials} status={account.status} />
                    <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-semibold text-primary">{account.name}</span>
                        <span className="truncate text-xs text-tertiary">{account.email}</span>
                    </div>
                </div>
                <Dropdown.Separator />
                <Dropdown.Menu>
                    <Dropdown.Item icon={User01} onAction={() => navigate("/profile")}>
                        View Profile
                    </Dropdown.Item>
                    <Dropdown.Item icon={LogOut01} onAction={onSignOut}>
                        Sign out
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown.Root>
    );
};
