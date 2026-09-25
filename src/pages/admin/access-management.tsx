import { useEffect, useState } from "react";
import { Plus, Server05, Trash01 } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { Table, TableCard } from "@/components/application/table/table";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Tabs } from "@/components/application/tabs/tabs";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Breadcrumbs } from "@/components/application/breadcrumbs/breadcrumbs";
import { notify } from "@/components/application/notification/notification";
import { type AdminUser, type Organization, adminApi, organizationApi } from "@/lib/api-client";

const PERSONA_TO_ROLE: Record<string, string> = {
    "Escalation Manager": "ESCALATION_MANAGER",
    "Reviewer 1": "REVIEWER",
    "Reviewer 2": "REVIEWER",
    Auditor: "AUDITOR",
};
const PERSONA_OPTIONS = Object.keys(PERSONA_TO_ROLE);

const ROLE_TO_PERSONA: Record<string, string> = {
    ADMIN: "Admin",
    ESCALATION_MANAGER: "Escalation Manager",
    REVIEWER: "Reviewer",
    AUDITOR: "Auditor",
};

// xyra-web never collects a password on this form - new accounts are
// provisioned with this fixed temp password and reset via "Reset Password"
// afterward. Ported as-is rather than inventing a password field.
const TEMP_PASSWORD = "TemporaryPassword123!";

const DEFAULT_CREATE_FORM = { name: "", email: "", organization: "", persona: "" };

export const AccessManagementPage = () => {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [createForm, setCreateForm] = useState(DEFAULT_CREATE_FORM);
    const [isCreating, setIsCreating] = useState(false);

    const [removeTarget, setRemoveTarget] = useState<AdminUser | null>(null);
    const [isRemoving, setIsRemoving] = useState(false);

    const loadUsers = () => {
        setIsLoading(true);
        adminApi
            .listUsers()
            .then((res) => {
                setError(null);
                setUsers(res.value || []);
            })
            .catch(() => setError("Could not reach the server. Is xyra-core running?"))
            .finally(() => setIsLoading(false));
    };

    useEffect(loadUsers, []);
    useEffect(() => {
        organizationApi
            .list()
            .then((res) => setOrganizations(res.success ? res.organizations : []))
            .catch(() => setOrganizations([]));
    }, []);

    const set = <K extends keyof typeof DEFAULT_CREATE_FORM>(key: K) => (value: (typeof DEFAULT_CREATE_FORM)[K]) =>
        setCreateForm((f) => ({ ...f, [key]: value }));

    const openCreate = () => {
        setCreateForm(DEFAULT_CREATE_FORM);
        setIsCreateOpen(true);
    };

    const onSubmitCreate = async () => {
        if (!createForm.name.trim() || !createForm.email.trim() || !createForm.organization || !createForm.persona) {
            notify("error", "Please fill in Name, Email, Organization, and select a Persona.");
            return;
        }
        const roleCode = PERSONA_TO_ROLE[createForm.persona];
        setIsCreating(true);
        try {
            const res = await adminApi.createUser({
                name: createForm.name.trim(),
                email: createForm.email.trim(),
                password: TEMP_PASSWORD,
                roleCode,
                organization: createForm.organization,
            });
            if (!res.success) {
                notify("error", res.message || "Could not create user.");
                return;
            }
            setIsCreateOpen(false);
            notify("success", `User provisioned successfully: ${createForm.email} as ${createForm.persona}`);
            loadUsers();
        } catch {
            notify("error", "Could not reach the server. Is xyra-core running?");
        } finally {
            setIsCreating(false);
        }
    };

    const onConfirmRemove = async () => {
        if (!removeTarget) return;
        setIsRemoving(true);
        try {
            const res = await adminApi.removeUser(removeTarget.id);
            if (!res.success) {
                notify("error", res.message || "Could not remove user.");
                return;
            }
            notify("success", `User access removed for ${removeTarget.email}`);
            setRemoveTarget(null);
            loadUsers();
        } catch {
            notify("error", "Could not reach the server. Is xyra-core running?");
        } finally {
            setIsRemoving(false);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <Breadcrumbs items={[{ label: "Access Management" }]} />
            <div className="flex flex-col gap-1">
                <h1 className="text-display-xs font-semibold text-primary">Access Management</h1>
                <p className="text-md text-tertiary">User access provisioning &amp; persona management.</p>
            </div>

            {error && <p className="rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}

            <Tabs>
                <Tabs.List
                    type="underline"
                    items={[
                        { id: "users", label: "Users" },
                        { id: "ad", label: "AD Management" },
                    ]}
                />

                <Tabs.Panel id="users" className="pt-6">
                    <TableCard.Root>
                        <TableCard.Header
                            title="Provisioned Enterprise Users"
                            badge={
                                <Badge color="gray" size="sm">
                                    {users.length}
                                </Badge>
                            }
                            contentTrailing={
                                <Button size="md" iconLeading={Plus} onClick={openCreate}>
                                    Create User
                                </Button>
                            }
                        />

                        {isLoading ? (
                            <div className="flex min-h-60 items-center justify-center p-8">
                                <LoadingIndicator type="line-simple" size="md" label="Loading users…" />
                            </div>
                        ) : (
                            <Table aria-label="Provisioned users">
                                <Table.Header>
                                    <Table.Head id="name" label="Name" isRowHeader />
                                    <Table.Head id="email" label="Email ID" />
                                    <Table.Head id="organization" label="Organization" />
                                    <Table.Head id="persona" label="Persona / Role" />
                                    <Table.Head id="status" label="Status" />
                                    <Table.Head id="created" label="Created Date" />
                                    <Table.Head id="actions" />
                                </Table.Header>
                                <Table.Body items={users}>
                                    {(user) => (
                                        <Table.Row id={user.id}>
                                            <Table.Cell className="font-medium text-primary">{user.name}</Table.Cell>
                                            <Table.Cell>{user.email}</Table.Cell>
                                            <Table.Cell>
                                                <Badge color="gray" size="sm">
                                                    {user.organization}
                                                </Badge>
                                            </Table.Cell>
                                            <Table.Cell>
                                                <Badge color="brand" size="sm">
                                                    {ROLE_TO_PERSONA[user.role] || user.role}
                                                </Badge>
                                            </Table.Cell>
                                            <Table.Cell>
                                                <Badge color="success" size="sm">
                                                    {user.status}
                                                </Badge>
                                            </Table.Cell>
                                            <Table.Cell className="text-tertiary">{user.createdAt ? new Date(user.createdAt).toISOString().split("T")[0] : ""}</Table.Cell>
                                            <Table.Cell>
                                                <div className="flex justify-end gap-2">
                                                    <Button color="secondary-destructive" size="sm" iconLeading={Trash01} onClick={() => setRemoveTarget(user)}>
                                                        Remove
                                                    </Button>
                                                </div>
                                            </Table.Cell>
                                        </Table.Row>
                                    )}
                                </Table.Body>
                            </Table>
                        )}
                    </TableCard.Root>
                </Tabs.Panel>

                <Tabs.Panel id="ad" className="pt-6">
                    <div className="flex min-h-[40vh] items-center justify-center">
                        <EmptyState size="md">
                            <EmptyState.Header>
                                <EmptyState.FeaturedIcon icon={Server05} color="brand" theme="light" />
                            </EmptyState.Header>
                            <EmptyState.Content>
                                <EmptyState.Title>AD Management</EmptyState.Title>
                                <EmptyState.Description>Active Directory sync and group mapping will live here. This section is coming soon.</EmptyState.Description>
                            </EmptyState.Content>
                        </EmptyState>
                    </div>
                </Tabs.Panel>
            </Tabs>

            {/* CREATE USER / PROVISION ACCESS MODAL */}
            <ModalOverlay isOpen={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <Modal>
                    <Dialog>
                        <div className="w-full max-w-lg rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                            <h3 className="text-lg font-semibold text-primary">Create User / Provision Access</h3>

                            <div className="mt-5 flex flex-col gap-4">
                                <Input label="User Name" isRequired placeholder="e.g. Jane Doe" value={createForm.name} onChange={set("name")} />
                                <Input label="User Email" isRequired type="email" placeholder="e.g. user@xyra.ai" value={createForm.email} onChange={set("email")} />
                                <Select
                                    label="Organization / Company"
                                    isRequired
                                    placeholder="Select an organization"
                                    selectedKey={createForm.organization || null}
                                    onSelectionChange={(k) => set("organization")((k as string) ?? "")}
                                    items={organizations.map((org) => ({ id: org.name, label: `${org.orgCode} - ${org.name}` }))}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                                <Select
                                    label="Persona / Role"
                                    isRequired
                                    placeholder="Select a persona"
                                    selectedKey={createForm.persona || null}
                                    onSelectionChange={(k) => set("persona")((k as string) ?? "")}
                                    items={PERSONA_OPTIONS.map((p) => ({ id: p, label: p }))}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                            </div>

                            <div className="mt-6 flex justify-end gap-3">
                                <Button color="secondary" onClick={() => setIsCreateOpen(false)}>
                                    Cancel
                                </Button>
                                <Button isLoading={isCreating} onClick={onSubmitCreate}>
                                    Create User
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>

            {/* REMOVE USER CONFIRMATION MODAL */}
            <ModalOverlay isOpen={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
                <Modal>
                    <Dialog>
                        <div className="w-full max-w-md rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                            <h3 className="text-lg font-semibold text-primary">Remove User Access</h3>
                            <p className="mt-2 text-sm text-tertiary">
                                Are you sure you want to remove user access for <span className="font-semibold text-primary">{removeTarget?.email}</span>?
                            </p>
                            <div className="mt-6 flex justify-end gap-3">
                                <Button color="secondary" onClick={() => setRemoveTarget(null)}>
                                    Cancel
                                </Button>
                                <Button color="primary-destructive" isLoading={isRemoving} onClick={onConfirmRemove}>
                                    Remove
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </div>
    );
};
