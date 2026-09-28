import { type ReactNode, useEffect, useMemo, useState } from "react";
import { getLocalTimeZone } from "@internationalized/date";
import { RefreshCw01, SearchLg } from "@untitledui/icons";
import type { DateValue } from "react-aria-components";
import { Breadcrumbs } from "@/components/application/breadcrumbs/breadcrumbs";
import { DateRangePicker } from "@/components/application/date-picker/date-range-picker";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Table, TableCard } from "@/components/application/table/table";
import { Tabs } from "@/components/application/tabs/tabs";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { type DeviationKpi, type ReviewEntry, deviationApi } from "@/lib/api-client";
import { AuditLogsPage } from "@/pages/admin/audit-logs";
import { formatTimestamp } from "@/pages/reviewer/alert-context";
import { DECISION_BADGE_COLOR, DECISION_LABEL, ReviewReport, listClosedReviews, terminalAt, terminalStatus } from "@/pages/reviewer/review-report";

type Tab = "records" | "remediation" | "history";
type FilterOption = { id: string; label: string };
const ALL: FilterOption = { id: "All", label: "All" };

const distinctOptions = (values: string[]): FilterOption[] => [...new Set(values.filter(Boolean))].map((v) => ({ id: v, label: v }));

const deviationText = (r: ReviewEntry) => `${r.sapObject}/${r.parameter}: expected '${r.expectedValue}', got '${r.actualValue}'`;

function inDateRange(iso: string | null, range: { start: DateValue; end: DateValue } | null): boolean {
    if (!range) return true;
    if (!iso) return false;
    const d = new Date(iso);
    const start = range.start.toDate(getLocalTimeZone());
    const end = range.end.toDate(getLocalTimeZone());
    end.setHours(23, 59, 59, 999);
    return d >= start && d <= end;
}

// Auditor persona: independent, read-only oversight. Everything here is live
// xyra-core data - the xyra-web original (Auditor.view.xml) ran entirely on
// hardcoded mock records, so its sections map onto the real equivalents:
// Audit Records -> the platform audit trail, Remediation Review -> rejected
// deviations and their remediation tickets, Audit History -> every review
// that reached a final outcome.
export const AuditorPage = () => {
    const [activeTab, setActiveTab] = useState<Tab>("records");
    const [kpi, setKpi] = useState<DeviationKpi | null>(null);
    const [closed, setClosed] = useState<ReviewEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<ReviewEntry | null>(null);

    const [remQuery, setRemQuery] = useState("");
    const [remSystem, setRemSystem] = useState("All");
    const [remStatus, setRemStatus] = useState("All");

    const [histQuery, setHistQuery] = useState("");
    const [histSystem, setHistSystem] = useState("All");
    const [histDecision, setHistDecision] = useState("All");
    const [histRange, setHistRange] = useState<{ start: DateValue; end: DateValue } | null>(null);

    const load = () => {
        setIsLoading(true);
        Promise.all([deviationApi.list({}), listClosedReviews()])
            .then(([dev, reviews]) => {
                setError(dev.success ? null : dev.message || "Could not load deviation KPIs.");
                if (dev.success) setKpi(dev.kpi);
                setClosed(reviews);
            })
            .catch((e) => setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Could not reach the server. Is xyra-core running?"))
            .finally(() => setIsLoading(false));
    };

    useEffect(load, []);

    const remediations = useMemo(() => closed.filter((r) => r.ticketNumber), [closed]);
    const openRemediations = remediations.filter((r) => !r.ticketResolved).length;

    const filteredRemediations = useMemo(() => {
        const q = remQuery.trim().toLowerCase();
        return remediations.filter((r) => {
            if (q && !`${r.ticketNumber} ${r.controlId} ${r.controlDescription} ${r.parameter}`.toLowerCase().includes(q)) return false;
            if (remSystem !== "All" && r.systemId !== remSystem) return false;
            if (remStatus !== "All" && (r.ticketResolved ? "Resolved" : "Open") !== remStatus) return false;
            return true;
        });
    }, [remediations, remQuery, remSystem, remStatus]);

    const filteredHistory = useMemo(() => {
        const q = histQuery.trim().toLowerCase();
        return closed.filter((r) => {
            if (q && !`${r.controlId} ${r.controlDescription} ${r.ticketNumber} ${r.reviewer1ByName} ${r.reviewer2ByName}`.toLowerCase().includes(q)) return false;
            if (histSystem !== "All" && r.systemId !== histSystem) return false;
            if (histDecision !== "All" && DECISION_LABEL[terminalStatus(r)] !== histDecision) return false;
            return inDateRange(terminalAt(r), histRange);
        });
    }, [closed, histQuery, histSystem, histDecision, histRange]);

    const systemOptions = useMemo(() => [ALL, ...distinctOptions(closed.map((r) => r.systemId))], [closed]);

    if (isLoading) {
        return (
            <div className="flex min-h-100 items-center justify-center">
                <LoadingIndicator type="line-simple" size="md" label="Loading auditor dashboard…" />
            </div>
        );
    }

    if (selected) return <ReviewReport review={selected} parentLabel="Auditor Dashboard" onBack={() => setSelected(null)} />;

    return (
        <div className="flex flex-col gap-6">
            <Breadcrumbs items={[{ label: "Auditor Dashboard" }]} />
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <h1 className="text-display-xs font-semibold text-primary">Auditor Dashboard</h1>
                    <p className="text-md text-tertiary">Independent, read-only inspection of control activity, remediation and review evidence.</p>
                </div>
                <Button color="secondary" iconLeading={RefreshCw01} onClick={load}>
                    Refresh
                </Button>
            </div>

            {error && <p className="rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Control Compliance Rate" value={kpi?.complianceRate ?? "—"} className="text-success-primary" />
                <StatCard label="Deviation Alerts" value={kpi?.totalIncidents ?? "—"} />
                <StatCard label="Open Remediation Tickets" value={openRemediations} className={openRemediations ? "text-error-primary" : "text-success-primary"} />
                <StatCard label="Closed Reviews" value={closed.length} className="text-brand-secondary" />
            </div>

            <Tabs selectedKey={activeTab} onSelectionChange={(k) => setActiveTab(k as Tab)}>
                <Tabs.List
                    type="underline"
                    items={[
                        { id: "records", label: "Audit Records" },
                        { id: "remediation", label: "Remediation Review" },
                        { id: "history", label: "Audit History" },
                    ]}
                />

                <Tabs.Panel id="records" className="pt-6">
                    <AuditLogsPage embedded />
                </Tabs.Panel>

                {/* REMEDIATION REVIEW */}
                <Tabs.Panel id="remediation" className="pt-6">
                    <div className="flex flex-col gap-4">
                        <FilterCard onReset={() => (setRemQuery(""), setRemSystem("All"), setRemStatus("All"))}>
                            <Input label="Search" icon={SearchLg} placeholder="Search Ticket, Control ID, Parameter..." value={remQuery} onChange={setRemQuery} />
                            <Select label="System" selectedKey={remSystem} onSelectionChange={(k) => setRemSystem(k as string)} items={systemOptions}>
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                            <Select
                                label="Ticket Status"
                                selectedKey={remStatus}
                                onSelectionChange={(k) => setRemStatus(k as string)}
                                items={[ALL, { id: "Open", label: "Open" }, { id: "Resolved", label: "Resolved" }]}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                        </FilterCard>

                        {filteredRemediations.length === 0 ? (
                            <Empty title="No remediation items" description="No rejected deviations with remediation tickets match these filters." />
                        ) : (
                            <TableCard.Root>
                                <TableCard.Header title="Remediation Tracking" badge={<Badge color="gray" size="sm">{filteredRemediations.length}</Badge>} />
                                <Table aria-label="Remediation tracking">
                                    <Table.Header>
                                        <Table.Head id="ticket" label="Ticket" isRowHeader />
                                        <Table.Head id="control" label="Control ID" />
                                        <Table.Head id="system" label="System" />
                                        <Table.Head id="deviation" label="Deviation" />
                                        <Table.Head id="raised" label="Rejected At" />
                                        <Table.Head id="status" label="Ticket Status" />
                                        <Table.Head id="actions" />
                                    </Table.Header>
                                    <Table.Body items={filteredRemediations}>
                                        {(r) => (
                                            <Table.Row id={r.id}>
                                                <Table.Cell className="font-medium text-primary">{r.ticketNumber}</Table.Cell>
                                                <Table.Cell className="font-medium text-primary">
                                                    {r.controlId}
                                                    <div className="text-xs text-tertiary">{r.controlDescription}</div>
                                                </Table.Cell>
                                                <Table.Cell>{r.systemId}</Table.Cell>
                                                <Table.Cell className="max-w-xs truncate" title={deviationText(r)}>
                                                    {deviationText(r)}
                                                </Table.Cell>
                                                <Table.Cell>{r.ticketLevel ? `Level ${r.ticketLevel}` : "—"}</Table.Cell>
                                                <Table.Cell>
                                                    <Badge color={r.ticketResolved ? "success" : "error"} size="sm">
                                                        {r.ticketStatus || (r.ticketResolved ? "Resolved" : "Open")}
                                                    </Badge>
                                                </Table.Cell>
                                                <Table.Cell>
                                                    <div className="flex justify-end">
                                                        <Button color="secondary" size="sm" onClick={() => setSelected(r)}>
                                                            View Evidence
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

                {/* AUDIT HISTORY */}
                <Tabs.Panel id="history" className="pt-6">
                    <div className="flex flex-col gap-4">
                        <FilterCard onReset={() => (setHistQuery(""), setHistSystem("All"), setHistDecision("All"), setHistRange(null))}>
                            <Input label="Search" icon={SearchLg} placeholder="Search Control ID, Ticket, Reviewer..." value={histQuery} onChange={setHistQuery} />
                            <Select label="System" selectedKey={histSystem} onSelectionChange={(k) => setHistSystem(k as string)} items={systemOptions}>
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                            <Select
                                label="Decision"
                                selectedKey={histDecision}
                                onSelectionChange={(k) => setHistDecision(k as string)}
                                items={[ALL, { id: "Approved", label: "Approved" }, { id: "Rejected", label: "Rejected" }]}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                            <div className="flex flex-col gap-1.5">
                                <span className="text-sm font-medium text-secondary">Decided Date</span>
                                <DateRangePicker value={histRange} onChange={setHistRange} />
                            </div>
                        </FilterCard>

                        {filteredHistory.length === 0 ? (
                            <Empty title="No history yet" description="No reviews matching these filters have reached a final outcome." />
                        ) : (
                            <TableCard.Root>
                                <TableCard.Header title="Closed Review Records" badge={<Badge color="gray" size="sm">{filteredHistory.length}</Badge>} />
                                <Table aria-label="Audit history">
                                    <Table.Header>
                                        <Table.Head id="control" label="Control ID" isRowHeader />
                                        <Table.Head id="system" label="System" />
                                        <Table.Head id="decision" label="Final Decision" />
                                        <Table.Head id="by" label="Decided By" />
                                        <Table.Head id="date" label="Decided Date" />
                                        <Table.Head id="ticket" label="Ticket" />
                                        <Table.Head id="actions" />
                                    </Table.Header>
                                    <Table.Body items={filteredHistory}>
                                        {(r) => {
                                            const status = terminalStatus(r);
                                            return (
                                                <Table.Row id={r.id}>
                                                    <Table.Cell className="font-medium text-primary">
                                                        {r.controlId}
                                                        <div className="text-xs text-tertiary">{r.controlDescription}</div>
                                                    </Table.Cell>
                                                    <Table.Cell>{r.systemId}</Table.Cell>
                                                    <Table.Cell>
                                                        <Badge color={DECISION_BADGE_COLOR[status] ?? "gray"} size="sm">
                                                            {DECISION_LABEL[status] || status}
                                                        </Badge>
                                                    </Table.Cell>
                                                    <Table.Cell>{(r.reviewer2Status !== "NEW" ? r.reviewer2ByName : r.reviewer1ByName) || "—"}</Table.Cell>
                                                    <Table.Cell className="text-tertiary">{formatTimestamp(terminalAt(r))}</Table.Cell>
                                                    <Table.Cell>{r.ticketNumber || "—"}</Table.Cell>
                                                    <Table.Cell>
                                                        <div className="flex justify-end">
                                                            <Button color="secondary" size="sm" onClick={() => setSelected(r)}>
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

function StatCard({ label, value, className = "text-primary" }: { label: string; value: string | number; className?: string }) {
    return (
        <div className="flex flex-col gap-2 rounded-xl bg-primary p-5 ring-1 ring-secondary">
            <span className="text-sm text-tertiary">{label}</span>
            <span className={`text-display-sm font-semibold ${className}`}>{value}</span>
        </div>
    );
}

function FilterCard({ onReset, children }: { onReset: () => void; children: ReactNode }) {
    return (
        <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-primary">Filters</h2>
                <Button color="link-gray" size="sm" onClick={onReset}>
                    Reset
                </Button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
        </div>
    );
}

function Empty({ title, description }: { title: string; description: string }) {
    return (
        <div className="rounded-xl bg-primary p-8 ring-1 ring-secondary">
            <EmptyState size="sm">
                <EmptyState.Header>
                    <EmptyState.FeaturedIcon icon={SearchLg} color="gray" theme="modern" />
                </EmptyState.Header>
                <EmptyState.Content>
                    <EmptyState.Title>{title}</EmptyState.Title>
                    <EmptyState.Description>{description}</EmptyState.Description>
                </EmptyState.Content>
            </EmptyState>
        </div>
    );
}
