import { useEffect, useState } from "react";
import { RefreshCw01, Save01 } from "@untitledui/icons";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Breadcrumbs } from "@/components/application/breadcrumbs/breadcrumbs";
import { notify } from "@/components/application/notification/notification";
import { type ProfileEntry, profileApi } from "@/lib/api-client";
import { getSession } from "@/lib/session";

type FormState = { name: string; phone: string; department: string; organization: string };

function toForm(p: ProfileEntry): FormState {
    return { name: p.name || "", phone: p.phone || "", department: p.department || "", organization: p.organization || "" };
}

export const ProfilePage = () => {
    const session = getSession();
    const [profile, setProfile] = useState<ProfileEntry | null>(null);
    const [form, setForm] = useState<FormState>({ name: "", phone: "", department: "", organization: "" });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isChangingPassword, setIsChangingPassword] = useState(false);

    const load = () => {
        setIsLoading(true);
        profileApi
            .get()
            .then((res) => {
                if (!res.success) {
                    setError(res.message || "Could not load profile.");
                    return;
                }
                setError(null);
                setProfile(res);
                setForm(toForm(res));
            })
            .catch(() => setError("Could not reach the server. Is xyra-core running?"))
            .finally(() => setIsLoading(false));
    };

    useEffect(load, []);

    const set = <K extends keyof FormState>(key: K) => (value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

    const onReset = () => {
        if (profile) setForm(toForm(profile));
        notify("success", "Personal & account details reset to original values.");
    };

    const onSave = async () => {
        if (!form.name.trim()) {
            notify("error", "Full Name is required.");
            return;
        }
        setIsSaving(true);
        try {
            const res = await profileApi.update(form);
            if (!res.success) {
                notify("error", res.message || "Could not save profile.");
                return;
            }
            notify("success", "Personal & account details saved successfully.");
            load();
        } catch {
            notify("error", "Could not reach the server. Is xyra-core running?");
        } finally {
            setIsSaving(false);
        }
    };

    const onSavePassword = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            notify("error", "Please enter Current Password, New Password, and Confirm Password.");
            return;
        }
        if (newPassword !== confirmPassword) {
            notify("error", "New Password and Confirm Password do not match.");
            return;
        }
        setIsChangingPassword(true);
        try {
            const res = await profileApi.changePassword(currentPassword, newPassword);
            if (!res.success) {
                notify("error", res.message || "Could not change password.");
                return;
            }
            notify("success", "Password updated successfully!");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch {
            notify("error", "Could not reach the server. Is xyra-core running?");
        } finally {
            setIsChangingPassword(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex min-h-100 items-center justify-center">
                <LoadingIndicator type="line-simple" size="md" label="Loading profile…" />
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="flex flex-col gap-4">
                <p className="rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">{error || "Could not load your profile."}</p>
                <Button color="secondary" iconLeading={RefreshCw01} onClick={load} className="w-fit">
                    Retry
                </Button>
            </div>
        );
    }

    const initials = (profile.name || "?")
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

    return (
        <div className="flex flex-col gap-6">
            <Breadcrumbs items={[{ label: "Profile" }]} />
            <div className="flex flex-col gap-1">
                <h1 className="text-display-xs font-semibold text-primary">User Profile & Account Settings</h1>
                <p className="text-md text-tertiary">Manage your user details and security credentials.</p>
            </div>

            {error && <p className="rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}

            {/* HEADER CARD */}
            <div className="flex items-center gap-4 rounded-xl bg-primary p-6 ring-1 ring-secondary">
                <Avatar size="xl" initials={initials} />
                <div className="flex flex-col gap-1">
                    <h2 className="text-lg font-semibold text-primary">{profile.name}</h2>
                    <div className="flex items-center gap-2">
                        <Badge color="brand" size="sm">
                            {profile.role}
                        </Badge>
                        <span className="text-sm text-tertiary">User ID: {profile.id.slice(0, 8).toUpperCase()}</span>
                    </div>
                </div>
            </div>

            {/* PERSONAL & ACCOUNT DETAILS */}
            <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                <h2 className="mb-4 text-lg font-semibold text-primary">Personal & Account Details</h2>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <Input label="Full Name" isRequired value={form.name} onChange={set("name")} />
                    <Field label="Email Address" value={profile.email} />
                    <Input label="Phone Number" type="tel" value={form.phone} onChange={set("phone")} />
                    <Field label="Role" value={profile.role} />
                    <Input label="Department" value={form.department} onChange={set("department")} />
                    <Field label="Enterprise Subdomain" value={session?.subdomain || "—"} />
                    <Input label="Organization" value={form.organization} onChange={set("organization")} />
                </div>
                <div className="mt-6 flex justify-end gap-3">
                    <Button color="secondary" onClick={onReset}>
                        Reset
                    </Button>
                    <Button iconLeading={Save01} isLoading={isSaving} onClick={onSave}>
                        Save Profile Changes
                    </Button>
                </div>
            </div>

            {/* CHANGE PASSWORD */}
            <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                <h2 className="mb-1 text-lg font-semibold text-primary">Change Password</h2>
                <p className="mb-4 text-sm text-tertiary">Update the password used to sign in.</p>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                    <Input label="Current Password" isRequired type="password" value={currentPassword} onChange={setCurrentPassword} />
                    <Input label="New Password" isRequired type="password" value={newPassword} onChange={setNewPassword} />
                    <Input label="Confirm New Password" isRequired type="password" value={confirmPassword} onChange={setConfirmPassword} />
                </div>
                <div className="mt-6 flex justify-end">
                    <Button iconLeading={Save01} isLoading={isChangingPassword} onClick={onSavePassword}>
                        Update Password
                    </Button>
                </div>
            </div>
        </div>
    );
};

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-secondary">{label}</span>
            <Input value={value} isReadOnly />
        </div>
    );
}
