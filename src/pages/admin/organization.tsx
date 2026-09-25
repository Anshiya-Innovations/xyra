import { useEffect, useMemo, useState } from "react";
import { Plus, SearchLg } from "@untitledui/icons";
import { useNavigate } from "react-router";
import { Badge } from "@/components/base/badges/badges";
import type { BadgeColors } from "@/components/base/badges/badge-types";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { Table, TableCard } from "@/components/application/table/table";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Breadcrumbs } from "@/components/application/breadcrumbs/breadcrumbs";
import { notify } from "@/components/application/notification/notification";
import { type OrgInput, type Organization, organizationApi } from "@/lib/api-client";

const INDUSTRY_OPTIONS = [
    "Conglomerate & Technology",
    "IT Consulting & Services",
    "Enterprise Software",
    "Manufacturing & Automotive",
    "Banking & Financial Services",
    "Energy & Retail",
    "Healthcare & Pharmaceuticals",
    "Custom",
];

const REGION_OPTIONS = [
    { id: "Asia Pacific", label: "Asia Pacific (APAC)" },
    { id: "North America", label: "North America (NA)" },
    { id: "Europe", label: "Europe (EMEA)" },
    { id: "Latin America", label: "Latin America (LATAM)" },
    { id: "Middle East & Africa", label: "Middle East & Africa (MEA)" },
];

const STATUS_OPTIONS = ["Active", "Pending Setup", "Inactive"];

const STATUS_BADGE_COLOR: Record<string, BadgeColors> = {
    "Pending Setup": "warning",
    "Under Audit Review": "brand",
    Inactive: "error",
};

type FilterOption = { id: string; label: string };
const ALL: FilterOption = { id: "All", label: "All" };

const DEFAULT_FORM: OrgInput = {
    orgCode: "",
    name: "",
    industry: "Conglomerate & Technology",
    region: "Asia Pacific",
    country: "",
    primaryContact: "",
    email: "",
    phone: "",
    status: "Active",
};

export const OrganizationPage = () => {
    const navigate = useNavigate();
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");
    const [regionFilter, setRegionFilter] = useState("All");

    const [isAddOpen, setIsAddOpen] = useState(false);
    const [form, setForm] = useState<OrgInput>(DEFAULT_FORM);
    const [isSaving, setIsSaving] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<Organization | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const load = () => {
        setIsLoading(true);
        organizationApi
            .list()
            .then((res) => {
                if (!res.success) {
                    setError(res.message || "Could not load organizations.");
                    return;
                }
                setError(null);
                setOrganizations(res.organizations);
            })
            .catch(() => setError("Could not reach the server. Is xyra-core running?"))
            .finally(() => setIsLoading(false));
    };

    useEffect(load, []);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return organizations.filter((org) => {
            if (q && ![org.orgCode, org.name, org.industry].join(" ").toLowerCase().includes(q)) return false;
            if (statusFilter !== "All" && org.status !== statusFilter) return false;
            if (regionFilter !== "All" && org.region !== regionFilter) return false;
            return true;
        });
    }, [organizations, query, statusFilter, regionFilter]);

    const set = <K extends keyof OrgInput>(key: K) => (value: OrgInput[K]) => setForm((f) => ({ ...f, [key]: value }));

    const openAdd = () => {
        setForm(DEFAULT_FORM);
        setIsAddOpen(true);
    };

    const onSubmitAdd = async () => {
        if (!form.orgCode.trim() || !form.name.trim() || !form.country.trim() || !form.primaryContact.trim() || !form.email.includes("@")) {
            notify("error", "Please fill in all mandatory fields correctly before saving.");
            return;
        }
        setIsSaving(true);
        try {
            const res = await organizationApi.create(form);
            if (!res.success) {
                notify("error", res.message || "Could not create organization.");
                return;
            }
            setIsAddOpen(false);
            notify("success", `Organization '${form.name}' created successfully!`);
            load();
        } catch {
            notify("error", "Could not reach the server. Is xyra-core running?");
        } finally {
            setIsSaving(false);
        }
    };

    const onConfirmDelete = async () => {
        if (!pendingDelete) return;
        setIsDeleting(true);
        try {
            const res = await organizationApi.delete(pendingDelete.id);
            if (!res.success) {
                notify("error", res.message || "Could not delete organization.");
                return;
            }
            notify("success", `Organization '${pendingDelete.orgCode}' deleted.`);
            setPendingDelete(null);
            load();
        } catch {
            notify("error", "Could not reach the server. Is xyra-core running?");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <Breadcrumbs items={[{ label: "Organization" }]} />
            <div className="flex flex-col gap-1">
                <h1 className="text-display-xs font-semibold text-primary">Organization Management</h1>
                <p className="text-md text-tertiary">Manage organizations, company access and organization-specific configurations.</p>
            </div>

            {error && <p className="rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}

            <TableCard.Root>
                <TableCard.Header
                    title="Managed Companies & Client Entities"
                    badge={
                        <Badge color="gray" size="sm">
                            {filtered.length}
                        </Badge>
                    }
                    contentTrailing={
                        <div className="flex items-center gap-3">
                            <Input size="sm" aria-label="Search organizations" icon={SearchLg} placeholder="Search Organization / Company ID..." value={query} onChange={setQuery} />
                            <Select
                                size="sm"
                                aria-label="Status filter"
                                selectedKey={statusFilter}
                                onSelectionChange={(k) => setStatusFilter(k as string)}
                                items={[ALL, ...["Active", "Pending Setup", "Under Audit Review", "Inactive"].map((s) => ({ id: s, label: s }))]}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                            <Select
                                size="sm"
                                aria-label="Region filter"
                                selectedKey={regionFilter}
                                onSelectionChange={(k) => setRegionFilter(k as string)}
                                items={[ALL, ...REGION_OPTIONS.map((r) => ({ id: r.id, label: r.id }))]}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                            <Button size="md" iconLeading={Plus} onClick={openAdd}>
                                Add Organization
                            </Button>
                        </div>
                    }
                />

                {isLoading ? (
                    <div className="flex min-h-60 items-center justify-center p-8">
                        <LoadingIndicator type="line-simple" size="md" label="Loading organizations…" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex min-h-60 items-center justify-center p-8">
                        <EmptyState size="sm">
                            <EmptyState.Header>
                                <EmptyState.FeaturedIcon icon={SearchLg} color="gray" theme="modern" />
                            </EmptyState.Header>
                            <EmptyState.Content>
                                <EmptyState.Title>{query ? "No matching organizations" : "No organizations yet"}</EmptyState.Title>
                                <EmptyState.Description>{query ? "Try a different search term." : "Click Add Organization to register one."}</EmptyState.Description>
                            </EmptyState.Content>
                        </EmptyState>
                    </div>
                ) : (
                    <Table aria-label="Organizations">
                        <Table.Header>
                            <Table.Head id="orgId" label="Organization ID" isRowHeader />
                            <Table.Head id="name" label="Company Name" />
                            <Table.Head id="industry" label="Industry" />
                            <Table.Head id="region" label="Region" />
                            <Table.Head id="systems" label="System" />
                            <Table.Head id="status" label="Status" />
                            <Table.Head id="created" label="Created Date" />
                            <Table.Head id="actions" />
                        </Table.Header>
                        <Table.Body items={filtered}>
                            {(org) => (
                                <Table.Row id={org.id}>
                                    <Table.Cell className="font-medium text-primary">
                                        {org.orgCode}
                                        <div className="text-xs text-tertiary">{org.country}</div>
                                    </Table.Cell>
                                    <Table.Cell>
                                        <div className="font-medium text-primary">{org.name}</div>
                                        <div className="text-xs text-tertiary">{org.primaryContact}</div>
                                    </Table.Cell>
                                    <Table.Cell>{org.industry}</Table.Cell>
                                    <Table.Cell>{org.region}</Table.Cell>
                                    <Table.Cell>
                                        <Badge color="brand" size="sm">
                                            {org.systemCount} {org.systemCount === 1 ? "System" : "Systems"}
                                        </Badge>
                                    </Table.Cell>
                                    <Table.Cell>
                                        <Badge color={STATUS_BADGE_COLOR[org.status] ?? "success"} size="sm">
                                            {org.status}
                                        </Badge>
                                    </Table.Cell>
                                    <Table.Cell className="text-tertiary">{org.createdAt ? new Date(org.createdAt).toISOString().split("T")[0] : ""}</Table.Cell>
                                    <Table.Cell>
                                        <div className="flex justify-end gap-2">
                                            <Button color="secondary" size="sm" onClick={() => navigate(`/organization/${org.id}`)}>
                                                View Details
                                            </Button>
                                            <Button color="secondary-destructive" size="sm" onClick={() => setPendingDelete(org)}>
                                                Delete
                                            </Button>
                                        </div>
                                    </Table.Cell>
                                </Table.Row>
                            )}
                        </Table.Body>
                    </Table>
                )}
            </TableCard.Root>

            {/* ADD ORGANIZATION MODAL */}
            <ModalOverlay isOpen={isAddOpen} onOpenChange={setIsAddOpen}>
                <Modal>
                    <Dialog>
                        <div className="w-full max-w-2xl rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                            <h3 className="text-lg font-semibold text-primary">Create Organization</h3>
                            <p className="mt-1 text-sm text-tertiary">
                                Register a new enterprise customer or company unit. Detailed SAP configurations and policies can be assigned inside Organization Details.
                            </p>

                            <div className="mt-5 grid grid-cols-2 gap-4">
                                <Input label="Organization ID" isRequired placeholder="e.g. ORG-TATA-01, ORG-ACCN-02" value={form.orgCode} onChange={set("orgCode")} />
                                <Input label="Company Name" isRequired placeholder="e.g. Tata Sons & Group" value={form.name} onChange={set("name")} />
                                <Select label="Industry" isRequired selectedKey={form.industry} onSelectionChange={(k) => set("industry")(k as string)} items={INDUSTRY_OPTIONS.map((v) => ({ id: v, label: v }))}>
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                                <Select label="Region" isRequired selectedKey={form.region} onSelectionChange={(k) => set("region")(k as string)} items={REGION_OPTIONS}>
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                                <Input label="Country" isRequired placeholder="e.g. India, United States, Germany" value={form.country} onChange={set("country")} />
                                <Input label="Primary Contact" isRequired placeholder="e.g. Ratan Sharma (VP GRC)" value={form.primaryContact} onChange={set("primaryContact")} />
                                <Input label="Email" isRequired type="email" placeholder="e.g. grc@tata.com" value={form.email} onChange={set("email")} />
                                <Input label="Phone" placeholder="e.g. +91 22 6665 8282" value={form.phone} onChange={set("phone")} />
                                <Select label="Organization Status" isRequired selectedKey={form.status} onSelectionChange={(k) => set("status")(k as string)} items={STATUS_OPTIONS.map((v) => ({ id: v, label: v }))}>
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                            </div>

                            <div className="mt-6 flex justify-end gap-3">
                                <Button color="secondary" onClick={() => setIsAddOpen(false)}>
                                    Cancel
                                </Button>
                                <Button isLoading={isSaving} onClick={onSubmitAdd}>
                                    Save
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>

            {/* DELETE CONFIRMATION MODAL */}
            <ModalOverlay isOpen={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
                <Modal>
                    <Dialog>
                        <div className="w-full max-w-lg rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                            <h3 className="text-lg font-semibold text-primary">Delete Organization</h3>
                            <p className="mt-2 text-sm text-tertiary">
                                Are you sure you want to delete Organization <span className="font-semibold text-primary">{pendingDelete?.orgCode}</span> ({pendingDelete?.name})? This
                                permanently deletes its {pendingDelete?.systemCount} {pendingDelete?.systemCount === 1 ? "system" : "systems"} and everything tied to them — control runs,
                                alerts, reviews and history. This cannot be undone.
                            </p>
                            <div className="mt-6 flex justify-end gap-3">
                                <Button color="secondary" onClick={() => setPendingDelete(null)}>
                                    Cancel
                                </Button>
                                <Button color="primary-destructive" isLoading={isDeleting} onClick={onConfirmDelete}>
                                    Delete
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </div>
    );
};
