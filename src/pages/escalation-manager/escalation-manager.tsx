import { useEffect, useMemo, useState } from "react";
import { Download01, RefreshCw01, SearchLg } from "@untitledui/icons";
import type { DateValue } from "react-aria-components";
import { Breadcrumbs } from "@/components/application/breadcrumbs/breadcrumbs";
import { DateRangePicker } from "@/components/application/date-picker/date-range-picker";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { notify } from "@/components/application/notification/notification";
import { Table, TableCard } from "@/components/application/table/table";
import { Tabs } from "@/components/application/tabs/tabs";
import type { BadgeColors } from "@/components/base/badges/badge-types";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { type ReviewEntry, type SystemEntry, reviewApi, systemConfigApi } from "@/lib/api-client";
import { formatTimestamp } from "@/pages/reviewer/alert-context";
import { DECISION_BADGE_COLOR, DECISION_LABEL, ReviewReport, badgeColorFor, terminalAt, terminalStatus } from "@/pages/reviewer/review-report";

type FilterOption = { id: string; label: string };
const ALL: FilterOption = { id: "All", label: "All" };

function distinctOptions(values: string[]): FilterOption[] {
    const seen = new Set<string>();
    const out: FilterOption[] = [];
    values.forEach((v) => {
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

export const EscalationManagerPage = () => {
    const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");
    const [pending, setPending] = useState<ReviewEntry[]>([]);
    const [history, setHistory] = useState<ReviewEntry[]>([]);
    const [systems, setSystems] = useState<SystemEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [pendingQuery, setPendingQuery] = useState("");
    const [pendingSystem, setPendingSystem] = useState("All");

    const [historyQuery, setHistoryQuery] = useState("");
    const [historySystem, setHistorySystem] = useState("All");
    const [historyDecision, setHistoryDecision] = useState("All");
    const [historyTicketStatus, setHistoryTicketStatus] = useState("All");
    const [dateRange, setDateRange] = useState<{ start: DateValue; end: DateValue } | null>(null);

    const [selected, setSelected] = useState<ReviewEntry | null>(null);

    const load = () => {
        setIsLoading(true);
        Promise.all([reviewApi.listLevel1Queue(), reviewApi.listLevel2Queue(), reviewApi.listLevel1History(), reviewApi.listLevel2History()])
            .then(([l1q, l2q, l1h, l2h]) => {
                if (!l1q.success || !l2q.success || !l1h.success || !l2h.success) {
                    setError(l1q.message || l2q.message || l1h.message || l2h.message || "Could not load reviews.");
                    return;
                }
                setError(null);
                setPending([...l1q.reviews, ...l2q.reviews]);
                setHistory([...l1h.reviews.filter((r) => r.reviewer1Status === "REMEDIATE"), ...l2h.reviews]);
            })
            .catch(() => setError("Could not reach the server. Is xyra-core running?"))
            .finally(() => setIsLoading(false));
    };

    useEffect(() => {
        load();
        systemConfigApi
            .list()
            .then((res) => res.success && setSystems(res.systems))
            .catch(() => {});
    }, []);

    const filteredPending = useMemo(() => {
        const q = pendingQuery.trim().toLowerCase();
        return pending.filter((r) => {
            if (q && !`${r.controlId} ${r.controlDescription} ${r.systemId}`.toLowerCase().includes(q)) return false;
            if (pendingSystem !== "All" && r.systemId !== pendingSystem) return false;
            return true;
        });
    }, [pending, pendingQuery, pendingSystem]);

    const pendingKpis = useMemo(() => ({ pending: pending.length, escalationsDue: pending.filter((r) => r.escalationDue).length }), [pending]);

    const historyTicketStatusOptions = useMemo(() => distinctOptions(history.map((r) => r.ticketStatus)), [history]);

    const filteredHistory = useMemo(() => {
        const q = historyQuery.trim().toLowerCase();
        const start = dateRange?.start.toDate(Intl.DateTimeFormat().resolvedOptions().timeZone);
        const end = dateRange?.end.toDate(Intl.DateTimeFormat().resolvedOptions().timeZone);
        return history.filter((r) => {
            if (q && !`${r.controlId} ${r.controlDescription} ${r.ticketNumber}`.toLowerCase().includes(q)) return false;
            if (historySystem !== "All" && r.systemId !== historySystem) return false;
            if (historyDecision !== "All" && (DECISION_LABEL[terminalStatus(r)] || "") !== historyDecision) return false;
            if (historyTicketStatus !== "All" && r.ticketStatus !== historyTicketStatus) return false;
            if (start || end) {
                const at = terminalAt(r);
                if (!at) return false;
                const d = new Date(at);
                if (isNaN(d.getTime())) return false;
                if (start && d < start) return false;
                if (end) {
                    const endOfDay = new Date(end.getTime());
                    endOfDay.setHours(23, 59, 59, 999);
                    if (d > endOfDay) return false;
                }
            }
            return true;
        });
    }, [history, historyQuery, historySystem, historyDecision, historyTicketStatus, dateRange]);

    const historyKpis = useMemo(() => {
        let approved = 0;
        let rejected = 0;
        history.forEach((r) => {
            const status = terminalStatus(r);
            if (status === "APPROVE") approved++;
            else if (status === "REMEDIATE") rejected++;
        });
        return { approved, rejected, pending: pending.length };
    }, [history, pending]);

    const onResetPendingFilters = () => {
        setPendingQuery("");
        setPendingSystem("All");
    };
    const onResetHistoryFilters = () => {
        setHistoryQuery("");
        setHistorySystem("All");
        setHistoryDecision("All");
        setHistoryTicketStatus("All");
        setDateRange(null);
    };

    const onExportCsv = () => {
        if (filteredPending.length === 0) {
            notify("error", "No pending deviations available to export.");
            return;
        }
        const header = [
            "Control ID",
            "Description",
            "System",
            "Generated Date",
            "Severity",
            "Reviewer 1 Status",
            "Reviewer 2 Status",
            "Days Pending",
            "Overdue",
            "Escalation Due",
        ].join(",");
        const rows = filteredPending.map((r) =>
            [
                toCsvCell(r.controlId),
                toCsvCell(r.controlDescription),
                toCsvCell(r.systemId),
                toCsvCell(r.generatedDate),
                toCsvCell(r.severity),
                toCsvCell(r.reviewer1Status),
                toCsvCell(r.reviewer2Status),
                toCsvCell(String(r.daysPending ?? "")),
                toCsvCell(r.isOverdue ? "Yes" : "No"),
                toCsvCell(r.escalationDue ? "Yes" : "No"),
            ].join(","),
        );
        const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `XYRA_Escalation_Monitoring_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        notify("success", "Monitoring report exported to CSV.");
    };

    if (isLoading) {
        return (
            <div className="flex min-h-100 items-center justify-center">
                <LoadingIndicator type="line-simple" size="md" label="Loading escalation overview…" />
            </div>
        );
    }

    if (selected) return <ReviewReport review={selected} parentLabel="Escalation Manager" onBack={() => setSelected(null)} />;

    return (
        <div className="flex flex-col gap-6">
            <Breadcrumbs items={[{ label: "Escalation Manager" }]} />
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <h1 className="text-display-xs font-semibold text-primary">Escalation Manager</h1>
                    <p className="text-md text-tertiary">Read-only oversight of the review chain — this persona has no decision of its own.</p>
                </div>
                <Button color="secondary" iconLeading={RefreshCw01} onClick={load}>
                    Refresh
                </Button>
            </div>

            {error && <p className="rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}

            <Tabs selectedKey={activeTab} onSelectionChange={(k) => setActiveTab(k as "pending" | "history")}>
                <Tabs.List
                    type="underline"
                    items={[
                        { id: "pending", label: "Pending Deviations" },
                        { id: "history", label: "Review History" },
                    ]}
                />

                {/* PENDING TAB */}
                <Tabs.Panel id="pending" className="pt-6">
                    <div className="flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
                            <StatCard label="Pending Approval" value={pendingKpis.pending} color="gray" />
                            <StatCard label="Escalations Due" value={pendingKpis.escalationsDue} color={pendingKpis.escalationsDue > 0 ? "error" : "success"} />
                        </div>

                        <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-primary">Filters</h2>
                                <div className="flex items-center gap-3">
                                    <Button color="link-gray" size="sm" onClick={onResetPendingFilters}>
                                        Reset
                                    </Button>
                                    <Button color="secondary" size="sm" iconLeading={Download01} onClick={onExportCsv}>
                                        Export CSV
                                    </Button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Input
                                    label="Search"
                                    icon={SearchLg}
                                    placeholder="Search Control ID, Description..."
                                    value={pendingQuery}
                                    onChange={setPendingQuery}
                                />
                                <Select
                                    label="System"
                                    selectedKey={pendingSystem}
                                    onSelectionChange={(k) => setPendingSystem(k as string)}
                                    items={[ALL, ...distinctOptions(systems.map((s) => s.sysId))]}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                            </div>
                        </div>

                        {filteredPending.length === 0 ? (
                            <div className="rounded-xl bg-primary p-8 ring-1 ring-secondary">
                                <EmptyState size="sm">
                                    <EmptyState.Header>
                                        <EmptyState.FeaturedIcon icon={SearchLg} color="gray" theme="modern" />
                                    </EmptyState.Header>
                                    <EmptyState.Content>
                                        <EmptyState.Title>Nothing pending</EmptyState.Title>
                                        <EmptyState.Description>No deviations are currently awaiting review.</EmptyState.Description>
                                    </EmptyState.Content>
                                </EmptyState>
                            </div>
                        ) : (
                            <TableCard.Root>
                                <TableCard.Header
                                    title="Pending Deviations"
                                    badge={
                                        <Badge color="gray" size="sm">
                                            {filteredPending.length}
                                        </Badge>
                                    }
                                />
                                <Table aria-label="Pending deviations">
                                    <Table.Header>
                                        <Table.Head id="controlId" label="Control ID" isRowHeader />
                                        <Table.Head id="system" label="System" />
                                        <Table.Head id="stage" label="Stage" />
                                        <Table.Head id="severity" label="Severity" />
                                        <Table.Head id="sla" label="SLA" />
                                        <Table.Head id="escalation" label="Escalation" />
                                        <Table.Head id="actions" />
                                    </Table.Header>
                                    <Table.Body items={filteredPending}>
                                        {(review) => (
                                            <Table.Row id={review.id} className={review.escalationDue ? "bg-error-secondary" : undefined}>
                                                <Table.Cell className="font-medium text-primary">
                                                    {review.controlId}
                                                    <div className="text-xs text-tertiary">{review.controlDescription}</div>
                                                </Table.Cell>
                                                <Table.Cell>{review.systemId}</Table.Cell>
                                                <Table.Cell>{review.reviewer1Status === "NEW" ? "Level 1" : "Level 2"}</Table.Cell>
                                                <Table.Cell>
                                                    <Badge color={badgeColorFor(review.severity)} size="sm">
                                                        {review.severity}
                                                    </Badge>
                                                </Table.Cell>
                                                <Table.Cell>
                                                    <Badge color={review.isOverdue ? "error" : "success"} size="sm">
                                                        {review.isOverdue ? `Overdue (${review.daysPending}d)` : `${review.daysPending ?? 0}d pending`}
                                                    </Badge>
                                                </Table.Cell>
                                                <Table.Cell>
                                                    {review.escalationDue && (
                                                        <Badge color="error" size="sm">
                                                            Escalation Due
                                                        </Badge>
                                                    )}
                                                </Table.Cell>
                                                <Table.Cell>
                                                    <div className="flex justify-end">
                                                        <Button color="secondary" size="sm" onClick={() => setSelected(review)}>
                                                            View Report
                                                        </Button>
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

                {/* HISTORY TAB */}
                <Tabs.Panel id="history" className="pt-6">
                    <div className="flex flex-col gap-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <StatCard label="Approved & Closed Audits" value={historyKpis.approved} color="success" />
                            <StatCard label="Rejected / Ticketed" value={historyKpis.rejected} color="error" />
                            <StatCard label="Pending Review (L1 & L2)" value={historyKpis.pending} color="brand" />
                        </div>

                        <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-primary">Filters</h2>
                                <Button color="link-gray" size="sm" onClick={onResetHistoryFilters}>
                                    Reset
                                </Button>
                            </div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                                <Input
                                    label="Search"
                                    icon={SearchLg}
                                    placeholder="Search Control ID, Ticket..."
                                    value={historyQuery}
                                    onChange={setHistoryQuery}
                                />
                                <Select
                                    label="System"
                                    selectedKey={historySystem}
                                    onSelectionChange={(k) => setHistorySystem(k as string)}
                                    items={[ALL, ...distinctOptions(systems.map((s) => s.sysId))]}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                                <Select
                                    label="Decision"
                                    selectedKey={historyDecision}
                                    onSelectionChange={(k) => setHistoryDecision(k as string)}
                                    items={[ALL, { id: "Approved", label: "Approved" }, { id: "Rejected", label: "Rejected" }]}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                                <Select
                                    label="Ticket Status"
                                    selectedKey={historyTicketStatus}
                                    onSelectionChange={(k) => setHistoryTicketStatus(k as string)}
                                    items={[ALL, ...historyTicketStatusOptions]}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                                <div className="col-span-2 flex flex-col gap-1.5">
                                    <span className="text-sm font-medium text-secondary">Date Range</span>
                                    <DateRangePicker value={dateRange} onChange={setDateRange} />
                                </div>
                            </div>
                        </div>

                        {filteredHistory.length === 0 ? (
                            <div className="rounded-xl bg-primary p-8 ring-1 ring-secondary">
                                <EmptyState size="sm">
                                    <EmptyState.Header>
                                        <EmptyState.FeaturedIcon icon={SearchLg} color="gray" theme="modern" />
                                    </EmptyState.Header>
                                    <EmptyState.Content>
                                        <EmptyState.Title>No history yet</EmptyState.Title>
                                        <EmptyState.Description>No reviews have reached a final outcome yet.</EmptyState.Description>
                                    </EmptyState.Content>
                                </EmptyState>
                            </div>
                        ) : (
                            <TableCard.Root>
                                <TableCard.Header
                                    title="Review History"
                                    badge={
                                        <Badge color="gray" size="sm">
                                            {filteredHistory.length}
                                        </Badge>
                                    }
                                />
                                <Table aria-label="Escalation review history">
                                    <Table.Header>
                                        <Table.Head id="ticket" label="Ticket" isRowHeader />
                                        <Table.Head id="controlId" label="Control ID" />
                                        <Table.Head id="system" label="System" />
                                        <Table.Head id="decision" label="Decision" />
                                        <Table.Head id="date" label="Decided Date" />
                                        <Table.Head id="ticketStatus" label="Ticket Status" />
                                        <Table.Head id="actions" />
                                    </Table.Header>
                                    <Table.Body items={filteredHistory}>
                                        {(review) => {
                                            const status = terminalStatus(review);
                                            return (
                                                <Table.Row id={review.id}>
                                                    <Table.Cell>
                                                        {review.ticketUrl ? (
                                                            <button
                                                                type="button"
                                                                className="cursor-pointer font-medium text-brand-secondary hover:underline"
                                                                onClick={() => window.open(review.ticketUrl, "_blank")}
                                                            >
                                                                {review.ticketNumber}
                                                            </button>
                                                        ) : (
                                                            <span className="text-primary">{review.ticketNumber || "—"}</span>
                                                        )}
                                                    </Table.Cell>
                                                    <Table.Cell className="font-medium text-primary">{review.controlId}</Table.Cell>
                                                    <Table.Cell>{review.systemId}</Table.Cell>
                                                    <Table.Cell>
                                                        <Badge color={DECISION_BADGE_COLOR[status] ?? "gray"} size="sm">
                                                            {DECISION_LABEL[status] || status}
                                                        </Badge>
                                                    </Table.Cell>
                                                    <Table.Cell className="text-tertiary">{formatTimestamp(terminalAt(review))}</Table.Cell>
                                                    <Table.Cell>{review.ticketStatus || "—"}</Table.Cell>
                                                    <Table.Cell>
                                                        <div className="flex justify-end">
                                                            <Button color="secondary" size="sm" onClick={() => setSelected(review)}>
                                                                View Details
                                                            </Button>
                                                        </div>
                                                    </Table.Cell>
                                                </Table.Row>
                                            );
                                        }}
                                    </Table.Body>
                                </Table>
                            </TableCard.Root>
                        )}
                    </div>
                </Tabs.Panel>
            </Tabs>

        </div>
    );
};

const STAT_TEXT_COLOR: Record<BadgeColors, string> = {
    gray: "text-primary",
    brand: "text-brand-secondary",
    error: "text-error-primary",
    warning: "text-warning-primary",
    success: "text-success-primary",
    slate: "text-primary",
    sky: "text-primary",
    blue: "text-primary",
    indigo: "text-primary",
    purple: "text-primary",
    pink: "text-primary",
    orange: "text-primary",
};

function StatCard({ label, value, color }: { label: string; value: number; color: BadgeColors }) {
    return (
        <div className="flex flex-col gap-2 rounded-xl bg-primary p-5 ring-1 ring-secondary">
            <span className="text-sm text-tertiary">{label}</span>
            <span className={`text-display-sm font-semibold ${STAT_TEXT_COLOR[color]}`}>{value}</span>
        </div>
    );
}
