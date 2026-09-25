import { useEffect, useMemo, useState } from "react";
import { getLocalTimeZone } from "@internationalized/date";
import { InfoCircle, RefreshCw01, SearchLg } from "@untitledui/icons";
import type { DateValue } from "react-aria-components";
import { Breadcrumbs } from "@/components/application/breadcrumbs/breadcrumbs";
import { DateRangePicker } from "@/components/application/date-picker/date-range-picker";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { PaginationPageDefault } from "@/components/application/pagination/pagination";
import { Table, TableCard } from "@/components/application/table/table";
import type { BadgeColors } from "@/components/base/badges/badge-types";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { type AuditLogEntry, auditLogApi, controlApi, systemConfigApi } from "@/lib/api-client";
import { getSession } from "@/lib/session";

const PAGE_SIZE = 10;

const NON_ADMIN_ROLES = new Set(["REVIEWER", "REV1", "REV2", "AUDITOR", "ESCALATION_MANAGER", "USER"]);

type FilterOption = { id: string; label: string };
const ALL: FilterOption = { id: "All", label: "All" };

const ACTION_OPTIONS: FilterOption[] = [
    { id: "LOGIN", label: "Login" },
    { id: "VIEW_ALERT", label: "View Alert" },
    { id: "VIEW_REPORT", label: "View Report" },
    { id: "REVIEW_APPROVE", label: "Review Approved" },
    { id: "REVIEW_REJECT", label: "Review Rejected" },
    { id: "TICKET_CREATED", label: "Ticket Created" },
    { id: "CONTROL_CREATE", label: "Control Created" },
    { id: "CONTROL_UPDATE", label: "Control Updated" },
    { id: "CONTROL_DELETE", label: "Control Deleted" },
    { id: "CONTROL_RUN", label: "Control Run Now" },
    { id: "SYSTEM_CREATE", label: "System Created" },
    { id: "SYSTEM_UPDATE", label: "System Updated" },
];

const MODULE_OPTIONS: FilterOption[] = [
    { id: "Authentication", label: "Authentication" },
    { id: "Control Management", label: "Control Management" },
    { id: "System Configuration", label: "System Configuration" },
    { id: "Deviation Report", label: "Deviation Report" },
    { id: "Review", label: "Review" },
];

const RESULT_OPTIONS: FilterOption[] = [
    { id: "Success", label: "Success" },
    { id: "Failure", label: "Failure" },
];

const ACTION_BADGE_COLOR = (action: string): BadgeColors => {
    if (action.includes("DELETE") || action.includes("REJECT")) return "error";
    if (action.includes("CREATE") || action.includes("APPROVE") || action.includes("ACTIVATE")) return "success";
    if (action.includes("UPDATE")) return "brand";
    return "warning";
};

type Filters = {
    searchQuery: string;
    action: string;
    module: string;
    performedBy: string;
    systemId: string;
    controlId: string;
    result: string;
};

const DEFAULT_FILTERS: Filters = {
    searchQuery: "",
    action: "All",
    module: "All",
    performedBy: "All",
    systemId: "All",
    controlId: "All",
    result: "All",
};

function distinctOptions(entries: string[]): FilterOption[] {
    const seen = new Set<string>();
    const out: FilterOption[] = [];
    entries.forEach((v) => {
        if (v && !seen.has(v)) {
            seen.add(v);
            out.push({ id: v, label: v });
        }
    });
    return out;
}

function toCsvCell(value: string): string {
    return `"${(value || "").replace(/"/g, '""')}"`;
}

export const AuditLogsPage = () => {
    const session = getSession();
    const isAdmin = !session?.role || !NON_ADMIN_ROLES.has(session.role.toUpperCase());

    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [systemOptions, setSystemOptions] = useState<FilterOption[]>([]);
    const [controlOptions, setControlOptions] = useState<FilterOption[]>([]);
    const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
    const [dateRange, setDateRange] = useState<{ start: DateValue; end: DateValue } | null>(null);
    const [page, setPage] = useState(1);
    const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);

    const loadLogs = () => {
        setIsLoading(true);
        return auditLogApi
            .list()
            .then((res) => {
                if (!res.success) {
                    setError(res.message || "Could not load audit logs.");
                    setLogs([]);
                    return;
                }
                setError(null);
                setLogs(res.logs);
            })
            .catch(() => {
                setError("Could not reach the server. Is xyra-core running?");
                setLogs([]);
            })
            .finally(() => setIsLoading(false));
    };

    useEffect(() => {
        if (!isAdmin) return;
        loadLogs();
        systemConfigApi
            .list()
            .then((res) => res.success && setSystemOptions(res.systems.map((s) => ({ id: s.sysId, label: s.sysId }))))
            .catch(() => {});
        controlApi
            .list()
            .then((res) => res.success && setControlOptions(res.controls.map((c) => ({ id: c.code, label: c.code }))))
            .catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const performedByOptions = useMemo(() => distinctOptions(logs.map((l) => l.performedBy)), [logs]);

    const filteredLogs = useMemo(() => {
        const query = filters.searchQuery.toLowerCase().trim();
        const start = dateRange?.start.toDate(getLocalTimeZone()) ?? null;
        const end = dateRange?.end.toDate(getLocalTimeZone()) ?? null;

        return logs.filter((log) => {
            if (query) {
                const haystack = `${log.id} ${log.performedBy} ${log.action} ${log.module} ${log.objectId} ${log.description}`.toLowerCase();
                if (!haystack.includes(query)) return false;
            }
            if (filters.action !== "All" && log.action !== filters.action) return false;
            if (filters.module !== "All" && log.module !== filters.module) return false;
            if (filters.performedBy !== "All" && log.performedBy.toLowerCase() !== filters.performedBy.toLowerCase()) return false;
            if (filters.systemId !== "All" && log.systemId !== filters.systemId) return false;
            if (filters.controlId !== "All" && log.controlId !== filters.controlId) return false;
            if (filters.result !== "All") {
                const displayResult = log.result === "SUCCESS" ? "Success" : "Failure";
                if (displayResult !== filters.result) return false;
            }
            if (start || end) {
                const logDate = new Date(log.createdAt);
                if (!isNaN(logDate.getTime())) {
                    if (start && logDate < start) return false;
                    if (end) {
                        const endOfDay = new Date(end.getTime());
                        endOfDay.setHours(23, 59, 59, 999);
                        if (logDate > endOfDay) return false;
                    }
                }
            }
            return true;
        });
    }, [logs, filters, dateRange]);

    const set =
        <K extends keyof Filters>(key: K) =>
        (value: Filters[K]) => {
            setFilters((f) => ({ ...f, [key]: value }));
            setPage(1);
        };

    const onReset = () => {
        setFilters(DEFAULT_FILTERS);
        setDateRange(null);
        setPage(1);
    };

    const onRefresh = () => {
        loadLogs().then(onReset);
    };

    const onExportCsv = () => {
        if (filteredLogs.length === 0) return;
        const header = ["Log ID", "Timestamp", "Admin User", "Action", "Module", "Object ID", "Description", "Previous Value", "New Value", "Result"].join(",");
        const rows = filteredLogs.map((log) =>
            [
                toCsvCell(log.id),
                toCsvCell(log.createdAt),
                toCsvCell(log.performedBy),
                toCsvCell(log.action),
                toCsvCell(log.module),
                toCsvCell(log.objectId),
                toCsvCell(log.description),
                toCsvCell(log.previousValue),
                toCsvCell(log.newValue),
                toCsvCell(log.result === "SUCCESS" ? "Success" : "Failure"),
            ].join(","),
        );
        const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `XYRA_Admin_Audit_Logs_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const openDetails = (log: AuditLogEntry) => {
        setSelectedLog(log);
        setIsDetailsOpen(true);
    };

    const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
    const pagedLogs = filteredLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    if (!isAdmin) {
        return (
            <div className="flex flex-col gap-6">
                <Breadcrumbs items={[{ label: "Audit Logs" }]} />
                <p className="rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">
                    Access Denied: You do not have Administrative privileges to view XYRA Audit Logs. This module is restricted to Admin users only.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <Breadcrumbs items={[{ label: "Audit Logs" }]} />
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <h1 className="text-display-xs font-semibold text-primary">Audit Logs</h1>
                    <p className="text-md text-tertiary">Admin Activity History</p>
                </div>
                <Button color="secondary" iconLeading={RefreshCw01} onClick={onRefresh}>
                    Refresh
                </Button>
            </div>

            {error && <p className="rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}

            {/* FILTERS */}
            <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-primary">Admin Activity Filters</h2>
                    <Button color="link-gray" size="sm" onClick={onReset}>
                        Reset
                    </Button>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                    <Input label="Search" icon={SearchLg} placeholder="Search Log ID, Admin..." value={filters.searchQuery} onChange={set("searchQuery")} />
                    <Select label="Action" selectedKey={filters.action} onSelectionChange={(k) => set("action")(k as string)} items={[ALL, ...ACTION_OPTIONS]}>
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <Select label="Module" selectedKey={filters.module} onSelectionChange={(k) => set("module")(k as string)} items={[ALL, ...MODULE_OPTIONS]}>
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <Select
                        label="Performed By"
                        selectedKey={filters.performedBy}
                        onSelectionChange={(k) => set("performedBy")(k as string)}
                        items={[ALL, ...performedByOptions]}
                    >
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <Select
                        label="System"
                        selectedKey={filters.systemId}
                        onSelectionChange={(k) => set("systemId")(k as string)}
                        items={[ALL, ...systemOptions]}
                    >
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <Select
                        label="Control"
                        selectedKey={filters.controlId}
                        onSelectionChange={(k) => set("controlId")(k as string)}
                        items={[ALL, ...controlOptions]}
                    >
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <Select label="Result" selectedKey={filters.result} onSelectionChange={(k) => set("result")(k as string)} items={[ALL, ...RESULT_OPTIONS]}>
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <div className="col-span-2 flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-secondary">Date Range</span>
                        <DateRangePicker value={dateRange} onChange={setDateRange} onApply={() => setPage(1)} />
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="flex min-h-60 items-center justify-center">
                    <LoadingIndicator type="line-simple" size="md" label="Loading audit logs…" />
                </div>
            ) : filteredLogs.length === 0 ? (
                <div className="rounded-xl bg-primary p-8 ring-1 ring-secondary">
                    <EmptyState size="sm">
                        <EmptyState.Header>
                            <EmptyState.FeaturedIcon icon={SearchLg} color="gray" theme="modern" />
                        </EmptyState.Header>
                        <EmptyState.Content>
                            <EmptyState.Title>No audit logs found</EmptyState.Title>
                            <EmptyState.Description>No audit logs match the selected filter criteria.</EmptyState.Description>
                        </EmptyState.Content>
                    </EmptyState>
                </div>
            ) : (
                <TableCard.Root>
                    <TableCard.Header
                        title="Admin Activity Audit Trail"
                        badge={
                            <Badge color="gray" size="sm">
                                {filteredLogs.length}
                            </Badge>
                        }
                        contentTrailing={
                            <Button color="secondary" size="sm" onClick={onExportCsv}>
                                Export CSV
                            </Button>
                        }
                    />
                    <Table aria-label="Audit logs">
                        <Table.Header>
                            <Table.Head id="timestamp" label="Timestamp" isRowHeader />
                            <Table.Head id="admin" label="Admin User" />
                            <Table.Head id="action" label="Action" />
                            <Table.Head id="module" label="Module" />
                            <Table.Head id="objectId" label="Object ID" />
                            <Table.Head id="description" label="Description" />
                            <Table.Head id="result" label="Result" />
                            <Table.Head id="details" label="Details" />
                        </Table.Header>
                        <Table.Body items={pagedLogs}>
                            {(log) => (
                                <Table.Row id={log.id}>
                                    <Table.Cell className="text-tertiary">{log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}</Table.Cell>
                                    <Table.Cell>{log.performedBy}</Table.Cell>
                                    <Table.Cell>
                                        <Badge color={ACTION_BADGE_COLOR(log.action)} size="sm">
                                            {log.action}
                                        </Badge>
                                    </Table.Cell>
                                    <Table.Cell>{log.module}</Table.Cell>
                                    <Table.Cell>{log.objectLabel || log.objectId}</Table.Cell>
                                    <Table.Cell className="max-w-xs truncate">{log.description}</Table.Cell>
                                    <Table.Cell>
                                        <Badge color={log.result === "SUCCESS" ? "success" : "error"} size="sm">
                                            {log.result === "SUCCESS" ? "Success" : "Failure"}
                                        </Badge>
                                    </Table.Cell>
                                    <Table.Cell>
                                        <Button
                                            color="tertiary"
                                            size="sm"
                                            iconLeading={InfoCircle}
                                            aria-label="View log details"
                                            onClick={() => openDetails(log)}
                                        />
                                    </Table.Cell>
                                </Table.Row>
                            )}
                        </Table.Body>
                    </Table>
                    {totalPages > 1 && (
                        <div className="px-4 py-4 md:px-6">
                            <PaginationPageDefault page={page} total={totalPages} onPageChange={setPage} />
                        </div>
                    )}
                </TableCard.Root>
            )}

            <ModalOverlay isOpen={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                <Modal>
                    <Dialog>
                        <div className="w-full max-w-2xl rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                            <div className="mb-4 flex items-start justify-between">
                                <div>
                                    <h3 className="text-lg font-semibold text-primary">{selectedLog?.id}</h3>
                                    <p className="text-sm text-tertiary">Administrative Action Evidence Record</p>
                                </div>
                                {selectedLog && (
                                    <Badge color={selectedLog.result === "SUCCESS" ? "success" : "error"} size="sm">
                                        {selectedLog.result === "SUCCESS" ? "Success" : "Failure"}
                                    </Badge>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <DetailField label="Log ID" value={selectedLog?.id} />
                                <DetailField label="Timestamp" value={selectedLog?.createdAt ? new Date(selectedLog.createdAt).toLocaleString() : ""} />
                                <DetailField label="Admin User" value={selectedLog?.performedBy} />
                                <DetailField label="Action" value={selectedLog?.action} />
                                <DetailField label="Module" value={selectedLog?.module} />
                                <DetailField label="Object ID" value={selectedLog?.objectLabel || selectedLog?.objectId} />
                            </div>

                            <div className="mt-4 flex flex-col gap-1.5">
                                <span className="text-sm font-medium text-secondary">Description</span>
                                <TextArea value={selectedLog?.description || ""} isReadOnly rows={2} />
                            </div>

                            {(selectedLog?.previousValue || selectedLog?.newValue) && (
                                <div className="mt-4 flex flex-col gap-4">
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-sm font-medium text-secondary">Previous Value</span>
                                        <TextArea value={selectedLog?.previousValue || ""} isReadOnly rows={3} />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-sm font-medium text-secondary">New Value</span>
                                        <TextArea value={selectedLog?.newValue || ""} isReadOnly rows={3} />
                                    </div>
                                </div>
                            )}

                            <div className="mt-6 flex justify-end">
                                <Button color="primary" onClick={() => setIsDetailsOpen(false)}>
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

function DetailField({ label, value }: { label: string; value?: string }) {
    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-secondary">{label}</span>
            <Input value={value || ""} isReadOnly />
        </div>
    );
}
