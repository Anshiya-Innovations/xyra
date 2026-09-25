import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Edit01, Plus, RefreshCw01, Trash01 } from "@untitledui/icons";
import { useNavigate, useParams } from "react-router";
import { Badge } from "@/components/base/badges/badges";
import type { BadgeColors } from "@/components/base/badges/badge-types";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { Toggle } from "@/components/base/toggle/toggle";
import { Table } from "@/components/application/table/table";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Tabs } from "@/components/application/tabs/tabs";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Breadcrumbs } from "@/components/application/breadcrumbs/breadcrumbs";
import { notify } from "@/components/application/notification/notification";
import {
    type JiraSettings,
    type OrgInput,
    type Organization,
    type SlaSettings,
    type SystemEntry,
    jiraApi,
    organizationApi,
    systemConfigApi,
} from "@/lib/api-client";

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

const REGION_OPTIONS = ["Asia Pacific", "North America", "Europe", "Latin America", "Middle East & Africa"];
const STATUS_OPTIONS = ["Active", "Pending Setup", "Under Audit Review", "Inactive"];
const STATUS_BADGE_COLOR: Record<string, BadgeColors> = { "Pending Setup": "warning", "Under Audit Review": "brand", Inactive: "error" };
const CONNECTION_BADGE_COLOR: Record<string, BadgeColors> = { ONLINE: "success", OFFLINE: "error" };

// ponytail: Parameters tab has no backend (ported 1:1 from xyra-web's
// OrganizationDetails.controller.js, which seeds this same mock array and
// keeps add/remove in-memory only - see its own comment there). Intentional
// demo content, not a gap - add a real ParametersService if this is ever
// meant to persist.
type ParamRow = { id: string; paramType: "SET/GET Parameter" | "User Default Value"; paramIdName: string; value: string; status: string };

const SEED_PARAMETERS: Omit<ParamRow, "id">[] = [
    { paramType: "SET/GET Parameter", paramIdName: "BUK - Company Code", value: "1000", status: "Enforced" },
    { paramType: "SET/GET Parameter", paramIdName: "WRK - Plant", value: "1010", status: "Active" },
    { paramType: "SET/GET Parameter", paramIdName: "VKO - Sales Organization", value: "1000", status: "Active" },
    { paramType: "SET/GET Parameter", paramIdName: "VTEG - Distribution Channel", value: "10", status: "Active" },
    { paramType: "SET/GET Parameter", paramIdName: "SPA - Memory ID", value: "MEM_TATA_PRD", status: "Enforced" },
    { paramType: "SET/GET Parameter", paramIdName: "KOK - Cost Center", value: "CC_2000", status: "Active" },
    { paramType: "SET/GET Parameter", paramIdName: "EKO - Purchasing Organization", value: "PO_1000", status: "Active" },
    { paramType: "User Default Value", paramIdName: "Decimal Notation", value: "1,234,567.89", status: "Enforced" },
    { paramType: "User Default Value", paramIdName: "Date Format", value: "DD.MM.YYYY", status: "Enforced" },
    { paramType: "User Default Value", paramIdName: "Time Zone", value: "IST (UTC+5:30)", status: "Active" },
    { paramType: "User Default Value", paramIdName: "Logon Language", value: "EN", status: "Active" },
    { paramType: "User Default Value", paramIdName: "Spool Output (DEST)", value: "LOCL", status: "Active" },
    { paramType: "User Default Value", paramIdName: "Output Device (PRINTER)", value: "PRN01_MUMBAI", status: "Pending Verification" },
];

const SET_GET_PARAM_IDS = ["BUK - Company Code", "WRK - Plant", "VKO - Sales Organization", "VTEG - Distribution Channel", "SPA - Memory ID", "KOK - Cost Center", "EKO - Purchasing Organization", "Custom"];
const USER_DEFAULT_PARAM_IDS = ["Decimal Notation", "Date Format", "Time Zone", "Logon Language", "Spool Output (DEST)", "Output Device (PRINTER)", "Custom"];
const PARAM_STATUS_OPTIONS = ["Active", "Enforced", "Pending Verification"];

const DEFAULT_JIRA: JiraSettings = { enabled: false, siteUrl: "", email: "", projectKey: "", issueType: "Task", hasToken: false, statusCreated: "", statusInProgress: "", statusResolved: "" };
const DEFAULT_OPTION = { key: "", text: "-- Use Jira's default category --" };

function toOrgForm(org: Organization): Omit<OrgInput, "orgCode"> {
    return { name: org.name, industry: org.industry, region: org.region, country: org.country, primaryContact: org.primaryContact, email: org.email, phone: org.phone, status: org.status };
}

function slaSummaryText(s: SlaSettings): string {
    return `Reviewer 1: ${s.reviewer1Days} business days  ·  Reviewer 2: ${s.reviewer2Days} business days  ·  Escalation delay: ${s.escalationDelayDays} business days past Reviewer 2 SLA`;
}

export const OrganizationDetailsPage = () => {
    const navigate = useNavigate();
    const { orgId } = useParams();

    const [activeTab, setActiveTab] = useState("details");
    const [org, setOrg] = useState<Organization | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [systems, setSystems] = useState<SystemEntry[]>([]);

    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editForm, setEditForm] = useState<Omit<OrgInput, "orgCode">>({ name: "", industry: INDUSTRY_OPTIONS[0], region: REGION_OPTIONS[0], country: "", primaryContact: "", email: "", phone: "", status: "Active" });
    const [isSavingEdit, setIsSavingEdit] = useState(false);

    const [parameters, setParameters] = useState<ParamRow[]>([]);
    const [paramTypeFilter, setParamTypeFilter] = useState("All");
    const [isAddParamOpen, setIsAddParamOpen] = useState(false);
    const [newParamType, setNewParamType] = useState<"SET/GET Parameter" | "User Default Value">("SET/GET Parameter");
    const [newParamIdName, setNewParamIdName] = useState(SET_GET_PARAM_IDS[0]);
    const [newParamValue, setNewParamValue] = useState("");
    const [newParamStatus, setNewParamStatus] = useState("Active");

    const [slaSettings, setSlaSettings] = useState<SlaSettings | null>(null);
    const [isSlaOpen, setIsSlaOpen] = useState(false);
    const [slaForm, setSlaForm] = useState<SlaSettings>({ reviewer1Days: 3, reviewer2Days: 3, escalationDelayDays: 2 });
    const [isSavingSla, setIsSavingSla] = useState(false);

    const [jira, setJira] = useState<JiraSettings>(DEFAULT_JIRA);
    const [jiraApiToken, setJiraApiToken] = useState("");
    const [jiraStatusOptions, setJiraStatusOptions] = useState([DEFAULT_OPTION]);
    const [isSavingJira, setIsSavingJira] = useState(false);
    const [isFetchingStatuses, setIsFetchingStatuses] = useState(false);

    const load = () => {
        if (!orgId) return;
        setIsLoading(true);
        organizationApi
            .get(orgId)
            .then((res) => {
                if (!res.success || !res.organization) {
                    setError(res.message || "Could not load organization.");
                    return;
                }
                setError(null);
                setOrg(res.organization);
                setParameters(SEED_PARAMETERS.map((p, i) => ({ ...p, id: `seed-${i}` })));
            })
            .catch(() => setError("Could not reach the server. Is xyra-core running?"))
            .finally(() => setIsLoading(false));

        systemConfigApi.list().then((res) => res.success && setSystems(res.systems.filter((s) => s.organizationId === orgId))).catch(() => {});

        systemConfigApi.getSlaSettings().then((res) => res.success && setSlaSettings(res.settings)).catch(() => {});

        jiraApi
            .getSettings(orgId)
            .then((res) => {
                if (!res.success) return;
                setJira(res.settings);
                mergeJiraStatusOptions([res.settings.statusCreated, res.settings.statusInProgress, res.settings.statusResolved].filter(Boolean));
            })
            .catch(() => {});
    };

    useEffect(load, [orgId]);

    // Keeps the blank "use default category" option plus every distinct
    // status name seen so far (saved mapping + last live fetch) - switching
    // back to an already-mapped value never goes blank.
    const mergeJiraStatusOptions = (names: string[]) => {
        setJiraStatusOptions((existing) => {
            const seen = new Set<string>();
            const merged = [DEFAULT_OPTION];
            [...existing, ...names.map((n) => ({ key: n, text: n }))].forEach((o) => {
                if (o.key && !seen.has(o.key)) {
                    seen.add(o.key);
                    merged.push(o);
                }
            });
            return merged;
        });
    };

    const filteredParameters = useMemo(() => (paramTypeFilter === "All" ? parameters : parameters.filter((p) => p.paramType === paramTypeFilter)), [parameters, paramTypeFilter]);

    const openEdit = () => {
        if (!org) return;
        setEditForm(toOrgForm(org));
        setIsEditOpen(true);
    };

    const onSubmitEdit = async () => {
        if (!org) return;
        if (!editForm.name.trim() || !editForm.country.trim() || !editForm.primaryContact.trim() || !editForm.email.includes("@")) {
            notify("error", "Please fill in all required fields before saving.");
            return;
        }
        setIsSavingEdit(true);
        try {
            const res = await organizationApi.update(org.id, editForm);
            if (!res.success) {
                notify("error", res.message || "Could not update organization.");
                return;
            }
            setOrg({ ...org, ...editForm });
            setIsEditOpen(false);
            notify("success", "Company Executive Summary updated successfully!");
        } catch {
            notify("error", "Could not reach the server. Is xyra-core running?");
        } finally {
            setIsSavingEdit(false);
        }
    };

    const openAddParam = () => {
        setNewParamType("SET/GET Parameter");
        setNewParamIdName(SET_GET_PARAM_IDS[0]);
        setNewParamValue("");
        setNewParamStatus("Active");
        setIsAddParamOpen(true);
    };

    const onSubmitAddParam = () => {
        if (!newParamValue.trim()) {
            notify("error", "Please enter a configured value for the parameter.");
            return;
        }
        setParameters((prev) => [{ id: crypto.randomUUID(), paramType: newParamType, paramIdName: newParamIdName, value: newParamValue.trim(), status: newParamStatus }, ...prev]);
        setIsAddParamOpen(false);
        notify("success", `Parameter '${newParamIdName}' added successfully!`);
    };

    const onRemoveParameter = (id: string) => {
        setParameters((prev) => prev.filter((p) => p.id !== id));
        notify("success", "Parameter removed.");
    };

    const openSla = () => {
        if (slaSettings) setSlaForm(slaSettings);
        setIsSlaOpen(true);
    };

    const onSaveSla = async () => {
        setIsSavingSla(true);
        try {
            const res = await systemConfigApi.updateSlaSettings(slaForm);
            if (!res.success) {
                notify("error", res.message || "Could not update SLA settings.");
                return;
            }
            setSlaSettings(slaForm);
            setIsSlaOpen(false);
            notify("success", "SLA settings updated.");
        } catch {
            notify("error", "Could not reach the server. Is xyra-core running?");
        } finally {
            setIsSavingSla(false);
        }
    };

    const onFetchJiraStatuses = async () => {
        if (!orgId) return;
        if (!jira.siteUrl.trim() || !jira.email.trim() || !jira.projectKey.trim()) {
            notify("error", "Fill in Site URL, Email, and Project Key first.");
            return;
        }
        setIsFetchingStatuses(true);
        try {
            const res = await jiraApi.getStatusOptions({ organizationId: orgId, siteUrl: jira.siteUrl.trim(), email: jira.email.trim(), apiToken: jiraApiToken, projectKey: jira.projectKey.trim() });
            if (!res.success) {
                notify("error", res.message || "Could not fetch statuses from Jira.");
                return;
            }
            mergeJiraStatusOptions(res.statuses);
            notify("success", `${res.statuses.length} status(es) loaded from Jira.`);
        } catch {
            notify("error", "Could not reach the server. Is xyra-core running?");
        } finally {
            setIsFetchingStatuses(false);
        }
    };

    const onSaveJira = async () => {
        if (!orgId) return;
        if (jira.enabled && (!jira.siteUrl.trim() || !jira.email.trim() || !jira.projectKey.trim())) {
            notify("error", "Site URL, Email, and Project Key are required to enable Jira ticket creation.");
            return;
        }
        setIsSavingJira(true);
        try {
            const res = await jiraApi.updateSettings(orgId, { ...jira, apiToken: jiraApiToken });
            if (!res.success) {
                notify("error", res.message || "Could not update Jira settings.");
                return;
            }
            setJiraApiToken("");
            notify("success", "Jira settings updated.");
            jiraApi.getSettings(orgId).then((res) => res.success && setJira(res.settings));
        } catch {
            notify("error", "Could not reach the server. Is xyra-core running?");
        } finally {
            setIsSavingJira(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex min-h-100 items-center justify-center">
                <LoadingIndicator type="line-simple" size="md" label="Loading organization…" />
            </div>
        );
    }

    if (!org) {
        return (
            <div className="flex flex-col gap-4">
                <p className="rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">{error || "Organization not found."}</p>
                <Button color="secondary" iconLeading={ArrowLeft} onClick={() => navigate("/organization")} className="w-fit">
                    Back to Organizations
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <Breadcrumbs items={[{ label: "Organization", href: "/organization" }, { label: org.name }]} />
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <Button color="link-gray" size="sm" iconLeading={ArrowLeft} onClick={() => navigate("/organization")} className="w-fit">
                        Back to Organizations
                    </Button>
                    <h1 className="text-display-xs font-semibold text-primary">
                        {org.name} ({org.orgCode})
                    </h1>
                    <p className="text-md text-tertiary">Enterprise Governance & Configuration Sub-Page</p>
                </div>
                <Badge color={STATUS_BADGE_COLOR[org.status] ?? "success"} size="lg">
                    {org.status}
                </Badge>
            </div>

            {error && <p className="rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}

            <Tabs selectedKey={activeTab} onSelectionChange={(k) => setActiveTab(k as string)}>
                <Tabs.List
                    type="underline"
                    items={[
                        { id: "details", label: "Company Details" },
                        { id: "config", label: "Configurations" },
                        { id: "parameters", label: "Parameters" },
                        { id: "policies", label: "Policies" },
                        { id: "ticketing", label: "Ticketing Integration" },
                    ]}
                />

                {/* TAB 1: COMPANY DETAILS */}
                <Tabs.Panel id="details" className="pt-6">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-primary">Organization Profile</h2>
                                <Button color="secondary" size="sm" iconLeading={Edit01} onClick={openEdit}>
                                    Edit
                                </Button>
                            </div>
                            <div className="flex flex-col gap-3">
                                <Field label="Company Name" value={org.name} />
                                <Field label="Organization ID" value={org.orgCode} />
                                <Field label="Industry" value={org.industry} />
                                <Field label="Region & Country" value={`${org.region} (${org.country})`} />
                            </div>
                        </div>

                        <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                            <h2 className="mb-4 text-lg font-semibold text-primary">Contact & Status</h2>
                            <div className="flex flex-col gap-3">
                                <Field label="Primary Contact" value={org.primaryContact} />
                                <Field label="Email Address" value={org.email} />
                                <Field label="Phone Number" value={org.phone} />
                                <div>
                                    <div className="text-xs font-semibold text-tertiary">Status</div>
                                    <div className="mt-1">
                                        <Badge color={STATUS_BADGE_COLOR[org.status] ?? "success"} size="sm">
                                            {org.status}
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </Tabs.Panel>

                {/* TAB 2: CONFIGURATIONS */}
                <Tabs.Panel id="config" className="pt-6">
                    <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-primary">SAP Systems under this Organization</h2>
                            <Badge color="gray" size="sm">
                                {systems.length} System(s)
                            </Badge>
                        </div>
                        {systems.length === 0 ? (
                            <p className="py-6 text-center text-sm text-tertiary">No Systems are assigned to this Organization yet - add one from System Configuration.</p>
                        ) : (
                            <Table aria-label="Organization systems">
                                <Table.Header>
                                    <Table.Head id="sysId" label="System ID" isRowHeader />
                                    <Table.Head id="client" label="Client" />
                                    <Table.Head id="sysType" label="Type" />
                                    <Table.Head id="hostName" label="Host Name" />
                                    <Table.Head id="platform" label="Platform" />
                                    <Table.Head id="region" label="Region" />
                                    <Table.Head id="sector" label="Sector" />
                                    <Table.Head id="connection" label="Connection" />
                                </Table.Header>
                                <Table.Body items={systems}>
                                    {(sys) => (
                                        <Table.Row id={sys.id}>
                                            <Table.Cell className="font-medium text-primary">{sys.sysId}</Table.Cell>
                                            <Table.Cell>{sys.client}</Table.Cell>
                                            <Table.Cell>{sys.sysType}</Table.Cell>
                                            <Table.Cell>{sys.hostName}</Table.Cell>
                                            <Table.Cell>{sys.platform}</Table.Cell>
                                            <Table.Cell>{sys.region}</Table.Cell>
                                            <Table.Cell>{sys.sector}</Table.Cell>
                                            <Table.Cell>
                                                <Badge color={CONNECTION_BADGE_COLOR[sys.lastConnectionStatus] ?? "gray"} size="sm">
                                                    {sys.lastConnectionStatus || "UNKNOWN"}
                                                </Badge>
                                            </Table.Cell>
                                        </Table.Row>
                                    )}
                                </Table.Body>
                            </Table>
                        )}
                    </div>
                </Tabs.Panel>

                {/* TAB 3: PARAMETERS */}
                <Tabs.Panel id="parameters" className="pt-6">
                    <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-primary">Organization-Specific SAP Parameters</h2>
                            <div className="flex items-center gap-3">
                                <Select
                                    size="sm"
                                    aria-label="Parameter type filter"
                                    selectedKey={paramTypeFilter}
                                    onSelectionChange={(k) => setParamTypeFilter(k as string)}
                                    items={[{ id: "All", label: "All Parameter Types" }, { id: "SET/GET Parameter", label: "SET/GET Parameter" }, { id: "User Default Value", label: "User Default Value" }]}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                                <Button size="sm" iconLeading={Plus} onClick={openAddParam}>
                                    Add Parameter
                                </Button>
                            </div>
                        </div>
                        <Table aria-label="Organization parameters">
                            <Table.Header>
                                <Table.Head id="type" label="Parameter Type" isRowHeader />
                                <Table.Head id="idName" label="Parameter ID / Name" />
                                <Table.Head id="value" label="Configured Value" />
                                <Table.Head id="status" label="Status" />
                                <Table.Head id="actions" />
                            </Table.Header>
                            <Table.Body items={filteredParameters}>
                                {(p) => (
                                    <Table.Row id={p.id}>
                                        <Table.Cell>
                                            <Badge color="brand" size="sm">
                                                {p.paramType}
                                            </Badge>
                                        </Table.Cell>
                                        <Table.Cell className="font-medium text-primary">{p.paramIdName}</Table.Cell>
                                        <Table.Cell>{p.value}</Table.Cell>
                                        <Table.Cell>
                                            <Badge color={p.status === "Pending Verification" ? "warning" : "success"} size="sm">
                                                {p.status}
                                            </Badge>
                                        </Table.Cell>
                                        <Table.Cell>
                                            <div className="flex justify-end">
                                                <ButtonUtility size="sm" color="tertiary" icon={Trash01} tooltip="Remove Parameter" onClick={() => onRemoveParameter(p.id)} />
                                            </div>
                                        </Table.Cell>
                                    </Table.Row>
                                )}
                            </Table.Body>
                        </Table>
                    </div>
                </Tabs.Panel>

                {/* TAB 4: POLICIES */}
                <Tabs.Panel id="policies" className="pt-6">
                    <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-primary">Review SLA Policy</h2>
                            <Button size="sm" iconLeading={Edit01} onClick={openSla}>
                                Edit SLA Settings
                            </Button>
                        </div>
                        <p className="mb-4 rounded-lg bg-secondary px-4 py-3 text-sm text-secondary ring-1 ring-secondary">
                            The one governance policy this organization currently enforces: business-day deadlines for the Reviewer 1 → Reviewer 2 deviation review chain, and when an
                            overdue item gets flagged for the Escalation Manager.
                        </p>
                        <div className="text-xs font-semibold text-tertiary">Reviewer Escalation SLA Window</div>
                        <div className="mt-1 text-sm text-primary">{slaSettings ? slaSummaryText(slaSettings) : "Loading…"}</div>
                    </div>
                </Tabs.Panel>

                {/* TAB 5: TICKETING INTEGRATION */}
                <Tabs.Panel id="ticketing" className="pt-6">
                    <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-primary">Ticketing Integration</h2>
                            <Button size="sm" isLoading={isSavingJira} onClick={onSaveJira}>
                                Save
                            </Button>
                        </div>

                        <p className="mb-4 rounded-lg bg-secondary px-4 py-3 text-sm text-secondary ring-1 ring-secondary">
                            When enabled, rejecting a deviation for a System under this Organization creates a real Jira issue instead of a local placeholder ticket number. The API token
                            is never shown back once saved.
                        </p>

                        <div className="mb-4 flex items-center gap-2">
                            <Toggle isSelected={jira.enabled} onChange={(enabled) => setJira((j) => ({ ...j, enabled }))} />
                            <span className="text-sm text-primary">Enable Jira ticket creation for this Organization</span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <Input label="Jira Site URL" isRequired placeholder="https://yourcompany.atlassian.net" value={jira.siteUrl} onChange={(v) => setJira((j) => ({ ...j, siteUrl: v }))} />
                            <Input label="Project (Space) Key" isRequired placeholder="e.g. XS" value={jira.projectKey} onChange={(v) => setJira((j) => ({ ...j, projectKey: v }))} />
                            <Input label="Atlassian Account Email" isRequired type="email" placeholder="you@company.com" value={jira.email} onChange={(v) => setJira((j) => ({ ...j, email: v }))} />
                            <Input label="Issue Type" placeholder="Task" value={jira.issueType} onChange={(v) => setJira((j) => ({ ...j, issueType: v }))} />
                            <Input
                                label="API Token"
                                type="password"
                                placeholder={jira.hasToken ? "Token on file - leave blank to keep it" : "Paste your Atlassian API token"}
                                value={jiraApiToken}
                                onChange={setJiraApiToken}
                            />
                        </div>

                        <h3 className="mt-6 mb-2 text-md font-semibold text-primary">Status Mapping</h3>
                        <p className="mb-4 rounded-lg bg-secondary px-4 py-3 text-sm text-secondary ring-1 ring-secondary">
                            Every Jira board names its own statuses. Fetch this board's real statuses, then map which one means each stage below - unmapped stages fall back to Jira's own
                            To Do / In Progress / Done categories.
                        </p>
                        <Button color="secondary" size="sm" iconLeading={RefreshCw01} isLoading={isFetchingStatuses} onClick={onFetchJiraStatuses} className="mb-4 w-fit">
                            Fetch Live Statuses from Jira
                        </Button>

                        <div className="grid grid-cols-3 gap-4">
                            <Select label="Ticket Created" selectedKey={jira.statusCreated} onSelectionChange={(k) => setJira((j) => ({ ...j, statusCreated: k as string }))} items={jiraStatusOptions.map((o) => ({ id: o.key, label: o.text }))}>
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                            <Select label="In Progress" selectedKey={jira.statusInProgress} onSelectionChange={(k) => setJira((j) => ({ ...j, statusInProgress: k as string }))} items={jiraStatusOptions.map((o) => ({ id: o.key, label: o.text }))}>
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                            <Select label="Resolved" selectedKey={jira.statusResolved} onSelectionChange={(k) => setJira((j) => ({ ...j, statusResolved: k as string }))} items={jiraStatusOptions.map((o) => ({ id: o.key, label: o.text }))}>
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                        </div>
                    </div>
                </Tabs.Panel>
            </Tabs>

            {/* EDIT COMPANY SUMMARY MODAL */}
            <ModalOverlay isOpen={isEditOpen} onOpenChange={setIsEditOpen}>
                <Modal>
                    <Dialog>
                        <div className="w-full max-w-2xl rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                            <h3 className="text-lg font-semibold text-primary">Edit Company Executive Summary</h3>
                            <div className="mt-5 grid grid-cols-2 gap-4">
                                <Input label="Organization ID" isReadOnly value={org.orgCode} />
                                <Input label="Company Name" isRequired value={editForm.name} onChange={(v) => setEditForm((f) => ({ ...f, name: v }))} />
                                <Select label="Industry" isRequired selectedKey={editForm.industry} onSelectionChange={(k) => setEditForm((f) => ({ ...f, industry: k as string }))} items={INDUSTRY_OPTIONS.map((v) => ({ id: v, label: v }))}>
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                                <Select label="Region" isRequired selectedKey={editForm.region} onSelectionChange={(k) => setEditForm((f) => ({ ...f, region: k as string }))} items={REGION_OPTIONS.map((v) => ({ id: v, label: v }))}>
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                                <Input label="Country" isRequired value={editForm.country} onChange={(v) => setEditForm((f) => ({ ...f, country: v }))} />
                                <Input label="Primary Contact" isRequired value={editForm.primaryContact} onChange={(v) => setEditForm((f) => ({ ...f, primaryContact: v }))} />
                                <Input label="Email Address" isRequired type="email" value={editForm.email} onChange={(v) => setEditForm((f) => ({ ...f, email: v }))} />
                                <Input label="Phone Number" value={editForm.phone} onChange={(v) => setEditForm((f) => ({ ...f, phone: v }))} />
                                <Select label="Status" isRequired selectedKey={editForm.status} onSelectionChange={(k) => setEditForm((f) => ({ ...f, status: k as string }))} items={STATUS_OPTIONS.map((v) => ({ id: v, label: v }))}>
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                            </div>
                            <div className="mt-6 flex justify-end gap-3">
                                <Button color="secondary" onClick={() => setIsEditOpen(false)}>
                                    Cancel
                                </Button>
                                <Button isLoading={isSavingEdit} onClick={onSubmitEdit}>
                                    Save Changes
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>

            {/* ADD PARAMETER MODAL */}
            <ModalOverlay isOpen={isAddParamOpen} onOpenChange={setIsAddParamOpen}>
                <Modal>
                    <Dialog>
                        <div className="w-full max-w-md rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                            <h3 className="text-lg font-semibold text-primary">Add Organization Parameter</h3>
                            <div className="mt-5 flex flex-col gap-4">
                                <Select
                                    label="Parameter Type"
                                    isRequired
                                    selectedKey={newParamType}
                                    onSelectionChange={(k) => {
                                        const type = k as "SET/GET Parameter" | "User Default Value";
                                        setNewParamType(type);
                                        setNewParamIdName(type === "SET/GET Parameter" ? SET_GET_PARAM_IDS[0] : USER_DEFAULT_PARAM_IDS[0]);
                                    }}
                                    items={[{ id: "SET/GET Parameter", label: "SET/GET Parameter" }, { id: "User Default Value", label: "User Default Value" }]}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                                <Select
                                    label="Parameter ID / Name"
                                    isRequired
                                    selectedKey={newParamIdName}
                                    onSelectionChange={(k) => setNewParamIdName(k as string)}
                                    items={(newParamType === "SET/GET Parameter" ? SET_GET_PARAM_IDS : USER_DEFAULT_PARAM_IDS).map((v) => ({ id: v, label: v }))}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                                <Input label="Configured Value" isRequired placeholder="e.g. 1000, DD.MM.YYYY, IST" value={newParamValue} onChange={setNewParamValue} />
                                <Select label="Status" isRequired selectedKey={newParamStatus} onSelectionChange={(k) => setNewParamStatus(k as string)} items={PARAM_STATUS_OPTIONS.map((v) => ({ id: v, label: v }))}>
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                            </div>
                            <div className="mt-6 flex justify-end gap-3">
                                <Button color="secondary" onClick={() => setIsAddParamOpen(false)}>
                                    Cancel
                                </Button>
                                <Button iconLeading={Plus} onClick={onSubmitAddParam}>
                                    Add Parameter
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>

            {/* SLA SETTINGS MODAL */}
            <ModalOverlay isOpen={isSlaOpen} onOpenChange={setIsSlaOpen}>
                <Modal>
                    <Dialog>
                        <div className="w-full max-w-md rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                            <h3 className="text-lg font-semibold text-primary">Reviewer Escalation SLA Settings</h3>
                            <p className="mt-2 mb-4 rounded-lg bg-secondary px-4 py-3 text-sm text-secondary ring-1 ring-secondary">
                                Business-day deadlines for the review chain. The Reviewer 1 clock starts when a deviation is detected; the Reviewer 2 clock starts once Reviewer 1
                                approves. Escalation Manager has no decision of their own - they're flagged once a Level 2 item is overdue by more than the escalation delay below.
                            </p>
                            <div className="flex flex-col gap-4">
                                <Input label="Reviewer 1 SLA (business days)" isRequired type="number" value={String(slaForm.reviewer1Days)} onChange={(v) => setSlaForm((f) => ({ ...f, reviewer1Days: Number(v) || 0 }))} />
                                <Input label="Reviewer 2 SLA (business days)" isRequired type="number" value={String(slaForm.reviewer2Days)} onChange={(v) => setSlaForm((f) => ({ ...f, reviewer2Days: Number(v) || 0 }))} />
                                <Input
                                    label="Escalation delay past Reviewer 2 SLA (business days)"
                                    isRequired
                                    type="number"
                                    value={String(slaForm.escalationDelayDays)}
                                    onChange={(v) => setSlaForm((f) => ({ ...f, escalationDelayDays: Number(v) || 0 }))}
                                />
                            </div>
                            <div className="mt-6 flex justify-end gap-3">
                                <Button color="secondary" onClick={() => setIsSlaOpen(false)}>
                                    Cancel
                                </Button>
                                <Button isLoading={isSavingSla} onClick={onSaveSla}>
                                    Save Changes
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </div>
    );
};

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="text-xs font-semibold text-tertiary">{label}</div>
            <div className="mt-1 text-sm text-primary">{value}</div>
        </div>
    );
}
