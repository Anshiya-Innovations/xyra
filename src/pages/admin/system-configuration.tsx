import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ClockRewind, Edit01, Plus, RefreshCw01, SearchLg, Trash01 } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import type { BadgeColors } from "@/components/base/badges/badge-types";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { Toggle } from "@/components/base/toggle/toggle";
import { Table, TableCard } from "@/components/application/table/table";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Tabs } from "@/components/application/tabs/tabs";
import { notify } from "@/components/application/notification/notification";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Breadcrumbs } from "@/components/application/breadcrumbs/breadcrumbs";
import { type AuditLogEntry, type Organization, type SystemEntry, type SystemInput, auditLogApi, organizationApi, systemConfigApi } from "@/lib/api-client";

const SYS_TYPE_OPTIONS = ["Development", "Quality", "Production"];
const CLIENT_TYPE_OPTIONS = ["ABAP", "JAVA", "S4/HANA"];

const SYS_TYPE_BADGE_COLOR: Record<string, BadgeColors> = { Production: "error", Quality: "warning" };

const SYSTEM_HISTORY_ACTION_LABELS: Record<string, string> = {
    SYSTEM_CREATE: "System Created",
    SYSTEM_UPDATE: "System Modified",
    SYSTEM_DELETE: "System Deleted",
};

type HealthStatus = "Online" | "Offline" | "Degraded" | "Unknown";

type HealthRow = {
    id: string;
    sysId: string;
    client: string;
    sysType: string;
    status: HealthStatus;
    lastCheck: string;
    connectionStatus: string;
    isDummy?: boolean;
};

const STATUS_BADGE_COLOR: Record<HealthStatus, BadgeColors> = { Online: "success", Offline: "error", Degraded: "warning", Unknown: "gray" };

// Shown only when the tenant has zero Systems on file yet, so a fresh
// install's Health tab isn't blank - mirrors xyra-web's DUMMY_HEALTH_SYSTEMS.
const DUMMY_HEALTH_SYSTEMS: HealthRow[] = [
    { id: "dummy-1", isDummy: true, sysId: "MY8", client: "000", sysType: "Development", status: "Online", lastCheck: "—", connectionStatus: "Example data — add a real system to test connectivity." },
    { id: "dummy-2", isDummy: true, sysId: "MQ8", client: "100", sysType: "Quality", status: "Degraded", lastCheck: "—", connectionStatus: "Example data — add a real system to test connectivity." },
    { id: "dummy-3", isDummy: true, sysId: "MP8", client: "800", sysType: "Production", status: "Offline", lastCheck: "—", connectionStatus: "Example data — add a real system to test connectivity." },
    { id: "dummy-4", isDummy: true, sysId: "BW1", client: "100", sysType: "Production", status: "Unknown", lastCheck: "—", connectionStatus: "Example data — add a real system to test connectivity." },
];

const DEGRADED_LATENCY_MS = 1000;

type FormState = {
    sysId: string;
    client: string;
    organizationId: string;
    sysType: string;
    hostName: string;
    sysDetails: string;
    sector: string;
    platform: string;
    region: string;
    clientType: string;
    sysVersion: string;
    logonGroup: string;
    portNumber: string;
    instanceNo: string;
    endpoint: string;
    credUserId: string;
    credPassword: string;
};

const ADD_DEFAULTS: FormState = {
    sysId: "",
    client: "100",
    organizationId: "",
    sysType: "Quality",
    hostName: "",
    sysDetails: "",
    sector: "MedTech",
    platform: "USROTC",
    region: "North America",
    clientType: "ABAP",
    sysVersion: "750",
    logonGroup: "PUBLIC",
    portNumber: "3600",
    instanceNo: "00",
    endpoint: "",
    credUserId: "",
    credPassword: "",
};

function toFormState(sys: SystemEntry): FormState {
    return {
        sysId: sys.sysId,
        client: sys.client,
        organizationId: sys.organizationId,
        sysType: sys.sysType,
        hostName: sys.hostName,
        sysDetails: sys.sysDetails,
        sector: sys.sector,
        platform: sys.platform,
        region: sys.region,
        clientType: sys.clientType,
        sysVersion: sys.sysVersion,
        logonGroup: sys.logonGroup,
        portNumber: String(sys.portNumber ?? ""),
        instanceNo: sys.instanceNo,
        endpoint: sys.endpoint,
        credUserId: "",
        credPassword: "",
    };
}

function toSystemInput(form: FormState): SystemInput {
    return { ...form, portNumber: Number(form.portNumber) || 0 };
}

function nowFormatted(): string {
    return new Date().toLocaleString();
}

export const SystemConfigurationPage = () => {
    const [activeTab, setActiveTab] = useState<"landscape" | "health">("landscape");
    const [systems, setSystems] = useState<SystemEntry[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const showFeedback = (type: "success" | "error", text: string) => {
        setFeedback({ type, text });
        setTimeout(() => setFeedback((f) => (f?.text === text ? null : f)), 4000);
    };

    // LANDSCAPE state
    const [query, setQuery] = useState("");
    const [formOpen, setFormOpen] = useState(false);
    const [formMode, setFormMode] = useState<"add" | "edit">("add");
    const [form, setForm] = useState<FormState>(ADD_DEFAULTS);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<SystemEntry | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [testingId, setTestingId] = useState<string | null>(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [historyEntries, setHistoryEntries] = useState<AuditLogEntry[]>([]);

    // HEALTH state
    const [health, setHealth] = useState<HealthRow[]>([]);
    const [healthQuery, setHealthQuery] = useState("");
    const [healthStatusFilter, setHealthStatusFilter] = useState<HealthStatus | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [isRefreshingHealth, setIsRefreshingHealth] = useState(false);
    const autoRefreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    const load = () => {
        setIsLoading(true);
        systemConfigApi
            .list()
            .then((res) => {
                if (!res.success) {
                    setError(res.message || "Could not load systems.");
                    return;
                }
                setError(null);
                setSystems(res.systems);
            })
            .catch(() => setError("Could not reach the server. Is xyra-core running?"))
            .finally(() => setIsLoading(false));
    };

    useEffect(() => {
        load();
        organizationApi.list().then((res) => res.success && setOrganizations(res.organizations)).catch(() => {});
    }, []);

    // Rebuilds the health table from the real Systems list - every row starts
    // "Unknown" until a real test has run against it, but keeps existing test
    // results for systems that were already checked (e.g. after a plain
    // reload). Falls back to DUMMY_HEALTH_SYSTEMS when there are no systems.
    useEffect(() => {
        if (systems.length === 0) {
            setHealth(DUMMY_HEALTH_SYSTEMS.map((r) => ({ ...r })));
            return;
        }
        setHealth((prev) => {
            const existingById = new Map(prev.map((row) => [row.id, row]));
            return systems.map((sys) => {
                const existing = existingById.get(sys.id);
                return {
                    id: sys.id,
                    sysId: sys.sysId,
                    client: sys.client,
                    sysType: sys.sysType,
                    status: existing?.status ?? "Unknown",
                    lastCheck: existing?.lastCheck ?? "Never",
                    connectionStatus: existing?.connectionStatus ?? "Not yet tested",
                };
            });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [systems]);

    useEffect(() => {
        return () => {
            if (autoRefreshInterval.current) clearInterval(autoRefreshInterval.current);
        };
    }, []);

    const filteredSystems = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return systems;
        return systems.filter((s) => [s.sysId, s.hostName, s.sysType, s.sysDetails].join(" ").toLowerCase().includes(q));
    }, [systems, query]);

    const kpis = useMemo(() => {
        const counts = { Online: 0, Offline: 0, Degraded: 0, Unknown: 0 };
        health.forEach((row) => counts[row.status]++);
        return counts;
    }, [health]);

    const filteredHealth = useMemo(() => {
        const q = healthQuery.trim().toLowerCase();
        return health.filter((row) => {
            if (healthStatusFilter && row.status !== healthStatusFilter) return false;
            if (q && !`${row.sysId} ${row.sysType} ${row.connectionStatus}`.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [health, healthQuery, healthStatusFilter]);

    const isDummyData = health.length > 0 && health[0].isDummy === true;

    // One real connection test, shared by the Landscape row action and every
    // Health tab test (single/refresh/auto-refresh) - never duplicated.
    const runTest = async (id: string): Promise<{ success: boolean; message?: string; latencyMs?: number }> => {
        try {
            const res = await systemConfigApi.testConnection(id);
            return res;
        } catch {
            return { success: false, message: "Could not reach xyra-core to run the test." };
        }
    };

    const applyHealthResult = (id: string, result: { success: boolean; message?: string; latencyMs?: number }) => {
        setHealth((prev) =>
            prev.map((row) => {
                if (row.id !== id) return row;
                const status: HealthStatus = !result.success ? "Offline" : result.latencyMs != null && result.latencyMs >= DEGRADED_LATENCY_MS ? "Degraded" : "Online";
                return { ...row, status, lastCheck: nowFormatted(), connectionStatus: result.message || (result.success ? "OK" : "Connection test failed.") };
            }),
        );
    };

    const onTestLandscapeRow = async (sys: SystemEntry) => {
        setTestingId(sys.id);
        const result = await runTest(sys.id);
        setTestingId(null);
        const latency = result.latencyMs != null ? ` (${result.latencyMs}ms)` : "";
        if (result.success) {
            notify("success", `Connection to ${sys.sysId} succeeded${latency}.`);
        } else {
            notify("error", (result.message || "Connection test failed.") + latency);
        }
    };

    const onTestHealthRow = async (row: HealthRow) => {
        if (row.isDummy) {
            notify("error", "Showing example data — add a real system under System Landscape to run live checks.");
            return;
        }
        setTestingId(row.id);
        const result = await runTest(row.id);
        setTestingId(null);
        applyHealthResult(row.id, result);
        const latency = result.latencyMs != null ? ` (${result.latencyMs}ms)` : "";
        if (result.success) {
            notify("success", `Connection to ${row.sysId} succeeded${latency}.`);
        } else {
            notify("error", (result.message || "Connection test failed.") + latency);
        }
    };

    const refreshHealth = async (silent = false) => {
        if (isDummyData) {
            if (!silent) notify("error", "Showing example data — add a real system under System Landscape to run live checks.");
            return;
        }
        if (health.length === 0) return;
        setIsRefreshingHealth(true);
        const results = await Promise.all(health.map(async (row) => ({ id: row.id, result: await runTest(row.id) })));
        results.forEach(({ id, result }) => applyHealthResult(id, result));
        setIsRefreshingHealth(false);
        if (!silent) {
            const ok = results.filter((r) => r.result.success).length;
            notify(ok === results.length ? "success" : "error", `Connectivity check complete: ${ok}/${results.length} systems reachable.`);
        }
    };

    const onToggleAutoRefresh = (selected: boolean) => {
        setAutoRefresh(selected);
        if (selected) {
            showFeedback("success", "Auto Refresh Enabled (15s Interval)");
            autoRefreshInterval.current = setInterval(() => refreshHealth(true), 15000);
        } else {
            if (autoRefreshInterval.current) {
                clearInterval(autoRefreshInterval.current);
                autoRefreshInterval.current = null;
            }
            showFeedback("success", "Auto Refresh Disabled");
        }
    };

    const onKpiCardClick = (status: HealthStatus) => {
        setHealthStatusFilter((prev) => (prev === status ? null : status));
    };

    const openAdd = () => {
        setFormMode("add");
        setForm(ADD_DEFAULTS);
        setEditingId(null);
        setFormOpen(true);
    };

    const openEdit = (sys: SystemEntry) => {
        setFormMode("edit");
        setForm(toFormState(sys));
        setEditingId(sys.id);
        setFormOpen(true);
    };

    const onSaveForm = async () => {
        if (!form.sysId || !form.client || !form.organizationId || !form.hostName) {
            showFeedback("error", "Please fill in mandatory fields: System ID, Client, Organization, and Host Name.");
            return;
        }
        setIsSaving(true);
        try {
            const res =
                formMode === "add"
                    ? await systemConfigApi.create(toSystemInput(form))
                    : await systemConfigApi.update(editingId as string, toSystemInput(form));
            if (!res.success) {
                showFeedback("error", res.message || "Could not save this system.");
                return;
            }
            setFormOpen(false);
            showFeedback("success", `SAP System '${form.sysId}' ${formMode === "add" ? "created" : "updated"} successfully!`);
            load();
        } catch {
            showFeedback("error", "Could not reach the server. Is xyra-core running?");
        } finally {
            setIsSaving(false);
        }
    };

    const onConfirmDelete = async () => {
        if (!pendingDelete) return;
        setIsDeleting(true);
        try {
            const res = await systemConfigApi.delete(pendingDelete.id);
            if (!res.success) {
                showFeedback("error", res.message || "Could not delete system.");
                return;
            }
            showFeedback("success", `SAP System '${pendingDelete.sysId}' deleted.`);
            setPendingDelete(null);
            load();
        } catch {
            showFeedback("error", "Could not reach the server. Is xyra-core running?");
        } finally {
            setIsDeleting(false);
        }
    };

    const openHistory = () => {
        setIsHistoryOpen(true);
        setIsHistoryLoading(true);
        auditLogApi
            .list()
            .then((res) => {
                if (!res.success) {
                    showFeedback("error", "Could not reach the server to load System History.");
                    setHistoryEntries([]);
                    return;
                }
                setHistoryEntries(res.logs.filter((l) => l.objectType === "System"));
            })
            .catch(() => {
                showFeedback("error", "Could not reach the server to load System History.");
                setHistoryEntries([]);
            })
            .finally(() => setIsHistoryLoading(false));
    };

    const set = <K extends keyof FormState>(key: K) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

    return (
        <div className="flex flex-col gap-6">
            <Breadcrumbs items={[{ label: "System Configuration" }]} />
            <div className="flex flex-col gap-1">
                <h1 className="text-display-xs font-semibold text-primary">System Configuration</h1>
                <p className="text-md text-tertiary">Manage and configure SAP S/4HANA & ERP System Landscape connections.</p>
            </div>

            {error && <p className="rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}
            {feedback && (
                <p className={`rounded-lg px-4 py-3 text-sm ${feedback.type === "success" ? "bg-success-secondary text-success-primary" : "bg-error-secondary text-error-primary"}`}>
                    {feedback.text}
                </p>
            )}

            <Tabs selectedKey={activeTab} onSelectionChange={(k) => setActiveTab(k as "landscape" | "health")}>
                <Tabs.List
                    type="underline"
                    items={[
                        { id: "landscape", label: "System Landscape" },
                        { id: "health", label: "System Health" },
                    ]}
                />

                <Tabs.Panel id="landscape" className="pt-6">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-end gap-3">
                            <Input size="sm" aria-label="Search systems" icon={SearchLg} placeholder="Search System ID / Host..." value={query} onChange={setQuery} />
                            <Button color="secondary" iconLeading={ClockRewind} onClick={openHistory}>
                                System History
                            </Button>
                            <Button iconLeading={Plus} onClick={openAdd}>
                                Add New System
                            </Button>
                        </div>

                        {isLoading ? (
                            <div className="flex min-h-60 items-center justify-center">
                                <LoadingIndicator type="line-simple" size="md" label="Loading systems…" />
                            </div>
                        ) : filteredSystems.length === 0 ? (
                            <div className="rounded-xl bg-primary p-8 ring-1 ring-secondary">
                                <EmptyState size="sm">
                                    <EmptyState.Header>
                                        <EmptyState.FeaturedIcon icon={SearchLg} color="gray" theme="modern" />
                                    </EmptyState.Header>
                                    <EmptyState.Content>
                                        <EmptyState.Title>{query ? "No matching systems" : "No systems yet"}</EmptyState.Title>
                                        <EmptyState.Description>{query ? "Try a different search term." : "Click Add New System to register one."}</EmptyState.Description>
                                    </EmptyState.Content>
                                </EmptyState>
                            </div>
                        ) : (
                            <TableCard.Root>
                                <Table aria-label="SAP system landscape">
                                    <Table.Header>
                                        <Table.Head id="sysId" label="System ID" isRowHeader />
                                        <Table.Head id="client" label="Client" />
                                        <Table.Head id="org" label="Organization" />
                                        <Table.Head id="sysType" label="System Type" />
                                        <Table.Head id="host" label="Host Name" />
                                        <Table.Head id="details" label="System Details" />
                                        <Table.Head id="sector" label="Sector" />
                                        <Table.Head id="platform" label="Platform" />
                                        <Table.Head id="region" label="Region" />
                                        <Table.Head id="clientType" label="Client Type" />
                                        <Table.Head id="version" label="Version" />
                                        <Table.Head id="logonGroup" label="Logon Group" />
                                        <Table.Head id="actions" className="sticky right-0 z-10 bg-secondary" />
                                    </Table.Header>
                                    <Table.Body items={filteredSystems}>
                                        {(sys) => (
                                            <Table.Row id={sys.id}>
                                                <Table.Cell className="font-medium text-primary">{sys.sysId}</Table.Cell>
                                                <Table.Cell>{sys.client}</Table.Cell>
                                                <Table.Cell>{sys.organizationCode}</Table.Cell>
                                                <Table.Cell>
                                                    <Badge color={SYS_TYPE_BADGE_COLOR[sys.sysType] ?? "brand"} size="sm">
                                                        {sys.sysType}
                                                    </Badge>
                                                </Table.Cell>
                                                <Table.Cell>{sys.hostName}</Table.Cell>
                                                <Table.Cell className="max-w-xs truncate">{sys.sysDetails}</Table.Cell>
                                                <Table.Cell>{sys.sector}</Table.Cell>
                                                <Table.Cell>{sys.platform}</Table.Cell>
                                                <Table.Cell>{sys.region}</Table.Cell>
                                                <Table.Cell>{sys.clientType}</Table.Cell>
                                                <Table.Cell>{sys.sysVersion}</Table.Cell>
                                                <Table.Cell>{sys.logonGroup}</Table.Cell>
                                                <Table.Cell className="sticky right-0 z-10 bg-primary shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)]">
                                                    <div className="flex justify-end gap-1">
                                                        <ButtonUtility
                                                            size="sm"
                                                            color="tertiary"
                                                            icon={Activity}
                                                            tooltip="Test Connection"
                                                            isDisabled={testingId === sys.id}
                                                            onClick={() => onTestLandscapeRow(sys)}
                                                        />
                                                        <ButtonUtility size="sm" color="tertiary" icon={Edit01} tooltip="Edit System" onClick={() => openEdit(sys)} />
                                                        <ButtonUtility size="sm" color="tertiary" icon={Trash01} tooltip="Delete System" onClick={() => setPendingDelete(sys)} />
                                                    </div>
                                                </Table.Cell>
                                            </Table.Row>
                                        )}
                                    </Table.Body>
                                </Table>
                            </TableCard.Root>
                        )}
                    </div>
                </Tabs.Panel>

                <Tabs.Panel id="health" className="pt-6">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col gap-1">
                                <h2 className="text-lg font-semibold text-primary">SAP Landscape Live Health & Telemetry</h2>
                                <p className="text-sm text-tertiary">Real-time availability, connection latency & status monitoring.</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <Toggle label="Auto Refresh" isSelected={autoRefresh} onChange={onToggleAutoRefresh} />
                                <Button iconLeading={RefreshCw01} isLoading={isRefreshingHealth} onClick={() => refreshHealth(false)}>
                                    Refresh
                                </Button>
                            </div>
                        </div>

                        {isDummyData && (
                            <p className="rounded-lg bg-secondary px-4 py-3 text-sm text-secondary ring-1 ring-secondary">
                                No systems configured yet — showing example data below. Add a system under System Landscape to see live health.
                            </p>
                        )}

                        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                            {(["Online", "Offline", "Degraded", "Unknown"] as const).map((status) => (
                                <button
                                    key={status}
                                    type="button"
                                    onClick={() => onKpiCardClick(status)}
                                    className={`flex flex-col gap-2 rounded-xl bg-primary p-5 text-left ring-1 transition ${healthStatusFilter === status ? "ring-2 ring-brand" : "ring-secondary"}`}
                                >
                                    <span className="text-sm text-tertiary">{status} Systems</span>
                                    <span className="text-display-sm font-semibold text-primary">{kpis[status]}</span>
                                    <Badge color={STATUS_BADGE_COLOR[status]} size="sm">
                                        {status === "Online" && "Reachable, authenticated OK"}
                                        {status === "Offline" && "Unreachable or auth rejected"}
                                        {status === "Degraded" && "Reachable, high latency"}
                                        {status === "Unknown" && "No check run yet"}
                                    </Badge>
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center justify-between">
                            <Input size="sm" aria-label="Search health" icon={SearchLg} placeholder="Search System ID / Type..." value={healthQuery} onChange={setHealthQuery} />
                            <Button
                                color="secondary"
                                size="sm"
                                onClick={() => {
                                    setHealthQuery("");
                                    setHealthStatusFilter(null);
                                }}
                            >
                                Reset
                            </Button>
                        </div>

                        {filteredHealth.length === 0 ? (
                            <div className="rounded-xl bg-primary p-8 ring-1 ring-secondary">
                                <EmptyState size="sm">
                                    <EmptyState.Header>
                                        <EmptyState.FeaturedIcon icon={SearchLg} color="gray" theme="modern" />
                                    </EmptyState.Header>
                                    <EmptyState.Content>
                                        <EmptyState.Title>No systems match</EmptyState.Title>
                                        <EmptyState.Description>Try a different search term or filter.</EmptyState.Description>
                                    </EmptyState.Content>
                                </EmptyState>
                            </div>
                        ) : (
                            <TableCard.Root>
                                <TableCard.Header title="SAP Landscape Runtime Health & Availability Matrix" />
                                <Table aria-label="System health">
                                    <Table.Header>
                                        <Table.Head id="sysId" label="System ID" isRowHeader />
                                        <Table.Head id="sysType" label="System Type" />
                                        <Table.Head id="client" label="Client" />
                                        <Table.Head id="status" label="Status" />
                                        <Table.Head id="lastCheck" label="Last Health Check" />
                                        <Table.Head id="connectionStatus" label="Connection Status" />
                                        <Table.Head id="actions" className="sticky right-0 z-10 bg-secondary" />
                                    </Table.Header>
                                    <Table.Body items={filteredHealth}>
                                        {(row) => (
                                            <Table.Row id={row.id}>
                                                <Table.Cell className="font-medium text-primary">{row.sysId}</Table.Cell>
                                                <Table.Cell>
                                                    <Badge color={SYS_TYPE_BADGE_COLOR[row.sysType] ?? "brand"} size="sm">
                                                        {row.sysType}
                                                    </Badge>
                                                </Table.Cell>
                                                <Table.Cell>{row.client}</Table.Cell>
                                                <Table.Cell>
                                                    <Badge color={STATUS_BADGE_COLOR[row.status]} size="sm">
                                                        {row.status}
                                                    </Badge>
                                                </Table.Cell>
                                                <Table.Cell className="text-tertiary">{row.lastCheck}</Table.Cell>
                                                <Table.Cell className="max-w-xs truncate text-tertiary">{row.connectionStatus}</Table.Cell>
                                                <Table.Cell className="sticky right-0 z-10 bg-primary shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)]">
                                                    <div className="flex justify-end">
                                                        <ButtonUtility
                                                            size="sm"
                                                            color="tertiary"
                                                            icon={Activity}
                                                            tooltip="Test Connection"
                                                            isDisabled={testingId === row.id}
                                                            onClick={() => onTestHealthRow(row)}
                                                        />
                                                    </div>
                                                </Table.Cell>
                                            </Table.Row>
                                        )}
                                    </Table.Body>
                                </Table>
                            </TableCard.Root>
                        )}
                    </div>
                </Tabs.Panel>
            </Tabs>

            {/* ADD / EDIT SYSTEM MODAL */}
            <ModalOverlay isOpen={formOpen} onOpenChange={setFormOpen}>
                <Modal>
                    <Dialog>
                        <div className="w-full max-w-4xl rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                            <h3 className="text-lg font-semibold text-primary">{formMode === "add" ? "Add New SAP System Configuration" : "Edit SAP System Configuration"}</h3>
                            <p className="mt-1 text-sm text-tertiary">
                                {formMode === "add" ? "Fill in SAP System connectivity and environment details below." : "Modify SAP System connectivity and environment details."}
                            </p>

                            <div className="mt-5 flex flex-col gap-5">
                                <div>
                                    <h4 className="mb-3 text-sm font-semibold text-primary">System Identification</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <Input label="System ID (SID)" isRequired isReadOnly={formMode === "edit"} placeholder="e.g. MY8, MQ8, MP8" value={form.sysId} onChange={set("sysId")} />
                                        <Input label="Client" isRequired placeholder="e.g. 100, 000" value={form.client} onChange={set("client")} />
                                        <Select label="Organization" isRequired placeholder="Select organization" selectedKey={form.organizationId || null} onSelectionChange={(k) => set("organizationId")(k as string)} items={organizations.map((o) => ({ id: o.id, label: `${o.orgCode} - ${o.name}` }))}>
                                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                        </Select>
                                        <Select label="System Type" isRequired selectedKey={form.sysType} onSelectionChange={(k) => set("sysType")(k as string)} items={SYS_TYPE_OPTIONS.map((v) => ({ id: v, label: v }))}>
                                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                        </Select>
                                        <Input label="Host Name" isRequired placeholder="e.g. asmy800.xyra.com" value={form.hostName} onChange={set("hostName")} />
                                        <Input label="System Details" placeholder="e.g. EHP4 FOR SAP CRM 7.0" value={form.sysDetails} onChange={set("sysDetails")} />
                                    </div>
                                </div>

                                <div>
                                    <h4 className="mb-3 text-sm font-semibold text-primary">Environment & Network</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <Input label="Sector" value={form.sector} onChange={set("sector")} />
                                        <Input label="Platform" value={form.platform} onChange={set("platform")} />
                                        <Input label="Region" value={form.region} onChange={set("region")} />
                                        <Select label="Client Type" selectedKey={form.clientType} onSelectionChange={(k) => set("clientType")(k as string)} items={CLIENT_TYPE_OPTIONS.map((v) => ({ id: v, label: v }))}>
                                            {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                        </Select>
                                        <Input label="System Version" value={form.sysVersion} onChange={set("sysVersion")} />
                                        <Input label="Logon Group" value={form.logonGroup} onChange={set("logonGroup")} />
                                        <Input label="Port Number" value={form.portNumber} onChange={set("portNumber")} />
                                        <Input label="Instance Number" value={form.instanceNo} onChange={set("instanceNo")} />
                                    </div>
                                </div>

                                <div>
                                    <h4 className="mb-3 text-sm font-semibold text-primary">Connection & Credentials</h4>
                                    {formMode === "edit" && <p className="mb-3 text-sm text-tertiary">Leave User ID / Password blank to keep the credentials already on file.</p>}
                                    <div className="grid grid-cols-2 gap-4">
                                        <Input label="Endpoint (base URL)" className="col-span-2" placeholder="e.g. http://localhost:8000" value={form.endpoint} onChange={set("endpoint")} />
                                        <Input label="User ID" placeholder="Basic Auth user" value={form.credUserId} onChange={set("credUserId")} />
                                        <Input label="Password" type="password" placeholder="Basic Auth password" value={form.credPassword} onChange={set("credPassword")} />
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6 flex justify-end gap-3">
                                <Button color="secondary" onClick={() => setFormOpen(false)}>
                                    Cancel
                                </Button>
                                <Button isLoading={isSaving} onClick={onSaveForm}>
                                    {formMode === "add" ? "Save System" : "Save Changes"}
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
                        <div className="w-full max-w-md rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                            <h3 className="text-lg font-semibold text-primary">Delete SAP System</h3>
                            <p className="mt-2 text-sm text-tertiary">
                                Are you sure you want to delete SAP System <span className="font-semibold text-primary">{pendingDelete?.sysId}</span> (Client {pendingDelete?.client})?
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

            {/* SYSTEM HISTORY MODAL */}
            <ModalOverlay isOpen={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                <Modal>
                    <Dialog>
                        <div className="w-full max-w-3xl rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                            <h3 className="text-lg font-semibold text-primary">SAP System Landscape Audit History</h3>
                            {isHistoryLoading ? (
                                <div className="flex min-h-40 items-center justify-center">
                                    <LoadingIndicator type="line-simple" size="md" label="Loading history…" />
                                </div>
                            ) : historyEntries.length === 0 ? (
                                <p className="mt-4 text-sm text-tertiary">No system history recorded yet.</p>
                            ) : (
                                <Table aria-label="System history" className="mt-4">
                                    <Table.Header>
                                        <Table.Head id="timestamp" label="Timestamp" isRowHeader />
                                        <Table.Head id="action" label="Action Type" />
                                        <Table.Head id="sysId" label="System ID" />
                                        <Table.Head id="user" label="User" />
                                        <Table.Head id="status" label="Status" />
                                    </Table.Header>
                                    <Table.Body items={historyEntries}>
                                        {(entry) => (
                                            <Table.Row id={entry.id}>
                                                <Table.Cell className="text-tertiary">{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "—"}</Table.Cell>
                                                <Table.Cell>{SYSTEM_HISTORY_ACTION_LABELS[entry.action] || entry.action}</Table.Cell>
                                                <Table.Cell className="font-medium text-primary">{entry.systemId}</Table.Cell>
                                                <Table.Cell>{entry.performedBy}</Table.Cell>
                                                <Table.Cell>
                                                    <Badge color={entry.result === "SUCCESS" ? "success" : "error"} size="sm">
                                                        {entry.result === "SUCCESS" ? "Success" : "Failure"}
                                                    </Badge>
                                                </Table.Cell>
                                            </Table.Row>
                                        )}
                                    </Table.Body>
                                </Table>
                            )}
                            <div className="mt-6 flex justify-end">
                                <Button color="secondary" onClick={() => setIsHistoryOpen(false)}>
                                    Close
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </div>
    );
};
