import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw01, SearchLg } from "@untitledui/icons";
import type { DateValue } from "react-aria-components";
import { Badge } from "@/components/base/badges/badges";
import type { BadgeColors } from "@/components/base/badges/badge-types";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { Table, TableCard } from "@/components/application/table/table";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Tabs } from "@/components/application/tabs/tabs";
import { DateRangePicker } from "@/components/application/date-picker/date-range-picker";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Breadcrumbs } from "@/components/application/breadcrumbs/breadcrumbs";
import { notify } from "@/components/application/notification/notification";
import {
    type AlertHeader,
    type AlertItem,
    type ReviewEntry,
    type RunLogEntry,
    type SystemEntry,
    auditLogApi,
    deviationApi,
    reviewApi,
    systemConfigApi,
} from "@/lib/api-client";
import { type ReviewerLevelConfig, REVIEWER_CONFIG } from "@/lib/reviewer-config";
import { getSession } from "@/lib/session";

const SEVERITY_BADGE_COLOR: Record<string, BadgeColors> = { critical: "error", high: "error", medium: "warning", low: "success" };
const LEVEL_BADGE_COLOR: Record<string, BadgeColors> = { ERROR: "error", WARNING: "warning", INFO: "gray" };
const badgeColorFor = (status: string) => SEVERITY_BADGE_COLOR[(status || "").toLowerCase()] ?? "gray";
const DECISION_BADGE_COLOR: Record<string, BadgeColors> = { APPROVE: "success", REMEDIATE: "error" };
const DECISION_LABEL: Record<string, string> = { APPROVE: "Approved", REMEDIATE: "Rejected" };

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

function formatTimestamp(iso: string | null | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

function statusFieldFor(review: ReviewEntry, level: 1 | 2): ReviewEntry["reviewer1Status"] {
    return level === 1 ? review.reviewer1Status : review.reviewer2Status;
}
function commentFieldFor(review: ReviewEntry, level: 1 | 2): string {
    return level === 1 ? review.reviewer1Comment : review.reviewer2Comment;
}
function atFieldFor(review: ReviewEntry, level: 1 | 2): string | null {
    return level === 1 ? review.reviewer1At : review.reviewer2At;
}

export const ReviewerQueuePage = ({ level }: { level: 1 | 2 }) => {
    const config: ReviewerLevelConfig = REVIEWER_CONFIG[level];
    const session = getSession();

    const [activeTab, setActiveTab] = useState<"queue" | "history">("queue");
    const [queue, setQueue] = useState<ReviewEntry[]>([]);
    const [history, setHistory] = useState<ReviewEntry[]>([]);
    const [systems, setSystems] = useState<SystemEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [queueQuery, setQueueQuery] = useState("");
    const [queueSystem, setQueueSystem] = useState("All");

    const [historyQuery, setHistoryQuery] = useState("");
    const [historyControlId, setHistoryControlId] = useState("");
    const [historySystem, setHistorySystem] = useState("All");
    const [historyDecision, setHistoryDecision] = useState("All");
    const [historyTicketStatus, setHistoryTicketStatus] = useState("All");
    const [dateRange, setDateRange] = useState<{ start: DateValue; end: DateValue } | null>(null);

    const [selectedReview, setSelectedReview] = useState<ReviewEntry | null>(null);
    const [alertHeader, setAlertHeader] = useState<AlertHeader | null>(null);
    const [alertItems, setAlertItems] = useState<AlertItem[]>([]);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const [rcaText, setRcaText] = useState("");
    const [elecSigConfirmed, setElecSigConfirmed] = useState(false);

    const [isLogsOpen, setIsLogsOpen] = useState(false);
    const [activeItem, setActiveItem] = useState<AlertItem | null>(null);
    const [logs, setLogs] = useState<RunLogEntry[]>([]);
    const [isLogsLoading, setIsLogsLoading] = useState(false);
    const [cachedLogs, setCachedLogs] = useState<RunLogEntry[] | null>(null);

    const [isApproveOpen, setIsApproveOpen] = useState(false);
    const [isRejectOpen, setIsRejectOpen] = useState(false);
    const [isDeciding, setIsDeciding] = useState(false);

    const [selectedHistoryItem, setSelectedHistoryItem] = useState<ReviewEntry | null>(null);

    const load = () => {
        setIsLoading(true);
        const listQueue = level === 1 ? reviewApi.listLevel1Queue : reviewApi.listLevel2Queue;
        const listHistory = level === 1 ? reviewApi.listLevel1History : reviewApi.listLevel2History;
        Promise.all([listQueue(), listHistory()])
            .then(([queueRes, historyRes]) => {
                if (!queueRes.success || !historyRes.success) {
                    setError(queueRes.message || historyRes.message || "Could not load reviews.");
                    return;
                }
                setError(null);
                setQueue(queueRes.reviews);
                setHistory(historyRes.reviews);
            })
            .catch(() => setError("Could not reach the server. Is xyra-core running?"))
            .finally(() => setIsLoading(false));
    };

    useEffect(() => {
        load();
        systemConfigApi.list().then((res) => res.success && setSystems(res.systems)).catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [level]);

    const filteredQueue = useMemo(() => {
        const q = queueQuery.trim().toLowerCase();
        return queue.filter((r) => {
            if (q && !`${r.controlId} ${r.controlDescription} ${r.systemId}`.toLowerCase().includes(q)) return false;
            if (queueSystem !== "All" && r.systemId !== queueSystem) return false;
            return true;
        });
    }, [queue, queueQuery, queueSystem]);

    const queueKpis = useMemo(() => ({ pending: queue.length, overdue: queue.filter((r) => r.isOverdue).length }), [queue]);

    const historyTicketStatusOptions = useMemo(() => distinctOptions(history.map((r) => r.ticketStatus)), [history]);

    const filteredHistory = useMemo(() => {
        const q = historyQuery.trim().toLowerCase();
        const cid = historyControlId.trim().toLowerCase();
        const start = dateRange?.start.toDate(Intl.DateTimeFormat().resolvedOptions().timeZone);
        const end = dateRange?.end.toDate(Intl.DateTimeFormat().resolvedOptions().timeZone);
        return history.filter((r) => {
            if (q && !`${r.controlId} ${r.controlDescription} ${r.ticketNumber}`.toLowerCase().includes(q)) return false;
            if (cid && !r.controlId.toLowerCase().includes(cid)) return false;
            if (historySystem !== "All" && r.systemId !== historySystem) return false;
            if (historyDecision !== "All") {
                const decision = DECISION_LABEL[statusFieldFor(r, level)] || "";
                if (decision !== historyDecision) return false;
            }
            if (historyTicketStatus !== "All" && r.ticketStatus !== historyTicketStatus) return false;
            if (start || end) {
                const at = atFieldFor(r, level);
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
    }, [history, historyQuery, historyControlId, historySystem, historyDecision, historyTicketStatus, dateRange, level]);

    const historyKpis = useMemo(() => {
        let approved = 0;
        let rejected = 0;
        history.forEach((r) => {
            const status = statusFieldFor(r, level);
            if (status === "APPROVE") approved++;
            else if (status === "REMEDIATE") rejected++;
        });
        return { approved, rejected, pending: queue.length };
    }, [history, queue, level]);

    const onResetQueueFilters = () => {
        setQueueQuery("");
        setQueueSystem("All");
    };

    const onResetHistoryFilters = () => {
        setHistoryQuery("");
        setHistoryControlId("");
        setHistorySystem("All");
        setHistoryDecision("All");
        setHistoryTicketStatus("All");
        setDateRange(null);
    };

    const openDetail = (review: ReviewEntry) => {
        setSelectedReview(review);
        setRcaText(commentFieldFor(review, level) || "");
        setElecSigConfirmed(false);
        setAlertHeader(null);
        setAlertItems([]);
        setCachedLogs(null);

        auditLogApi.logEvent({
            action: "VIEW_REPORT",
            module: "Review",
            objectType: "Report",
            objectId: review.id,
            objectLabel: review.controlId,
            description: `Opened review for '${review.controlId}' on ${review.systemId}.`,
            systemId: review.systemId,
            controlId: review.controlId,
        });

        if (!review.alertId) return;
        setIsLoadingDetail(true);
        deviationApi
            .getDetail(review.alertId)
            .then((res) => {
                if (res.success) {
                    setAlertHeader(res.header);
                    setAlertItems(res.items);
                }
            })
            .finally(() => setIsLoadingDetail(false));
    };

    const backToQueue = () => setSelectedReview(null);

    const onOpenLogs = (item: AlertItem) => {
        setActiveItem(item);
        setIsLogsOpen(true);
        if (cachedLogs) {
            setLogs(cachedLogs);
            return;
        }
        if (!selectedReview?.alertId) return;
        setIsLogsLoading(true);
        deviationApi
            .getRunLogs(selectedReview.alertId)
            .then((res) => {
                const rows = res.success ? res.logs : [];
                setCachedLogs(rows);
                setLogs(rows);
            })
            .catch(() => setLogs([]))
            .finally(() => setIsLogsLoading(false));
    };

    const canDecide = rcaText.trim().length > 0 && elecSigConfirmed;

    const onApproveClick = () => {
        if (!canDecide) {
            notify("error", "Root Cause Analysis and Electronic Signature confirmation are required before deciding.");
            return;
        }
        setIsApproveOpen(true);
    };
    const onRejectClick = () => {
        if (!canDecide) {
            notify("error", "Root Cause Analysis and Electronic Signature confirmation are required before deciding.");
            return;
        }
        setIsRejectOpen(true);
    };

    const decide = async (decision: "APPROVE" | "REMEDIATE") => {
        if (!selectedReview) return;
        setIsDeciding(true);
        try {
            const fn = level === 1 ? reviewApi.decideLevel1 : reviewApi.decideLevel2;
            const res = await fn(selectedReview.id, decision, rcaText.trim());
            if (!res.success) {
                notify("error", res.message || "Could not record this decision.");
                return;
            }
            if (decision === "APPROVE") {
                notify("success", `${selectedReview.controlId}: ${config.approveSuccessMessage}`);
            } else {
                notify("success", `${selectedReview.controlId}: rejected. Remediation ticket ${res.ticketNumber} created.`);
            }
            setIsApproveOpen(false);
            setIsRejectOpen(false);
            backToQueue();
            load();
        } catch {
            notify("error", "Could not reach the server. Is xyra-core running?");
        } finally {
            setIsDeciding(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex min-h-100 items-center justify-center">
                <LoadingIndicator type="line-simple" size="md" label="Loading review queue…" />
            </div>
        );
    }

    // DETAIL VIEW
    if (selectedReview) {
        return (
            <div className="flex flex-col gap-6">
                <Breadcrumbs items={[{ label: config.pageTitle }, { label: `${selectedReview.controlId} Review` }]} />
                <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                        <Button color="link-gray" size="sm" iconLeading={ArrowLeft} onClick={backToQueue} className="w-fit">
                            Back to {config.queueTitle}
                        </Button>
                        <h1 className="text-display-xs font-semibold text-primary">
                            {selectedReview.controlId} on {selectedReview.systemId}
                        </h1>
                        <p className="text-md text-tertiary">{selectedReview.controlDescription}</p>
                    </div>
                    <Badge color={badgeColorFor(selectedReview.severity)} size="lg">
                        {selectedReview.severity}
                    </Badge>
                </div>

                {config.showReviewer1Summary && (
                    <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                        <h2 className="mb-4 text-lg font-semibold text-primary">Reviewer 1 Review Summary</h2>
                        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
                            <Field label="Reviewer 1 Decision" value={DECISION_LABEL[selectedReview.reviewer1Status] || selectedReview.reviewer1Status} />
                            <Field label="Reviewed By" value={selectedReview.reviewer1ByName || "—"} />
                            <Field label="Review Date" value={formatTimestamp(selectedReview.reviewer1At)} />
                            <div className="col-span-2 lg:col-span-1">
                                <div className="text-xs font-semibold text-tertiary">Reviewer 1 RCA</div>
                                <div className="mt-1 text-sm text-primary">{selectedReview.reviewer1Comment || "—"}</div>
                            </div>
                        </div>
                    </div>
                )}

                {isLoadingDetail ? (
                    <div className="flex min-h-40 items-center justify-center">
                        <LoadingIndicator type="line-simple" size="sm" label="Loading alert context…" />
                    </div>
                ) : alertHeader ? (
                    <>
                        <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                            <h2 className="mb-4 text-lg font-semibold text-primary">Alert Context Summary</h2>
                            <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
                                <Field label="System & Client" value={`${alertHeader.systemId} (Client ${alertHeader.client})`} />
                                <Field label="Sector / Platform" value={`${alertHeader.sector} / ${alertHeader.platform}`} />
                                <Field label="Alert Date" value={formatTimestamp(alertHeader.alertDate)} />
                                <Field label="Deviations" value={`${alertHeader.deviationCount} line deviations`} />
                            </div>
                        </div>

                        <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                            <h2 className="mb-4 text-lg font-semibold text-primary">Detailed Deviation Line Items</h2>
                            {alertItems.length === 0 ? (
                                <p className="py-6 text-center text-sm text-tertiary">No detailed deviation line items found.</p>
                            ) : (
                                <Table aria-label="Deviation line items">
                                    <Table.Header>
                                        <Table.Head id="sapObject" label="SAP Object" isRowHeader />
                                        <Table.Head id="parameter" label="Parameter" />
                                        <Table.Head id="expected" label="Expected" />
                                        <Table.Head id="actual" label="Actual" />
                                        <Table.Head id="status" label="Status" />
                                        <Table.Head id="logs" />
                                    </Table.Header>
                                    <Table.Body items={alertItems}>
                                        {(item) => (
                                            <Table.Row id={item.id}>
                                                <Table.Cell className="font-medium text-primary">{item.sapObject}</Table.Cell>
                                                <Table.Cell>{item.parameter}</Table.Cell>
                                                <Table.Cell>{item.expectedValue}</Table.Cell>
                                                <Table.Cell className="font-medium text-primary">{item.actualValue}</Table.Cell>
                                                <Table.Cell>
                                                    <Badge color={badgeColorFor(item.status)} size="sm">
                                                        {item.status}
                                                    </Badge>
                                                </Table.Cell>
                                                <Table.Cell>
                                                    <Button size="sm" onClick={() => onOpenLogs(item)}>
                                                        Logs
                                                    </Button>
                                                </Table.Cell>
                                            </Table.Row>
                                        )}
                                    </Table.Body>
                                </Table>
                            )}
                        </div>
                    </>
                ) : null}

                <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                    <h2 className="mb-4 text-lg font-semibold text-primary">Root Cause Analysis</h2>
                    <TextArea isRequired rows={4} placeholder="Document root cause analysis for this decision..." value={rcaText} onChange={setRcaText} />
                </div>

                <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                    <h2 className="mb-4 text-lg font-semibold text-primary">Electronic Signature & Attestation</h2>
                    <div className="grid grid-cols-2 gap-6 lg:grid-cols-3">
                        <Field label="Reviewer" value={session?.name || "—"} />
                        <Field label="Email" value={session?.email || "—"} />
                        <Field label="Decision Date" value={new Date().toLocaleDateString()} />
                    </div>
                    <div className="mt-4">
                        <Checkbox
                            label="I attest that this review reflects an accurate root cause analysis and I am authorized to record this decision."
                            isSelected={elecSigConfirmed}
                            onChange={setElecSigConfirmed}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3">
                    <Button color="secondary" onClick={backToQueue}>
                        Back to {config.queueTitle}
                    </Button>
                    <Button color="primary-destructive" onClick={onRejectClick}>
                        Reject
                    </Button>
                    <Button onClick={onApproveClick}>{config.approveLabel}</Button>
                </div>

                {/* LOGS DIALOG */}
                <ModalOverlay isOpen={isLogsOpen} onOpenChange={setIsLogsOpen}>
                    <Modal>
                        <Dialog>
                            <div className="w-full max-w-2xl rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                                <h3 className="text-lg font-semibold text-primary">
                                    Automation Execution Logs {activeItem ? `— ${activeItem.sapObject}/${activeItem.parameter}` : ""}
                                </h3>
                                <div className="mt-4 max-h-96 overflow-y-auto">
                                    {isLogsLoading ? (
                                        <div className="flex min-h-40 items-center justify-center">
                                            <LoadingIndicator type="line-simple" size="sm" label="Loading execution logs…" />
                                        </div>
                                    ) : logs.length === 0 ? (
                                        <p className="py-6 text-center text-sm text-tertiary">No execution logs available.</p>
                                    ) : (
                                        <Table aria-label="Execution logs">
                                            <Table.Header>
                                                <Table.Head id="timestamp" label="Timestamp" isRowHeader />
                                                <Table.Head id="level" label="Log Level" />
                                                <Table.Head id="message" label="Message" />
                                            </Table.Header>
                                            <Table.Body items={logs}>
                                                {(l) => (
                                                    <Table.Row id={l.id}>
                                                        <Table.Cell className="text-tertiary">{formatTimestamp(l.timestamp)}</Table.Cell>
                                                        <Table.Cell>
                                                            <Badge color={LEVEL_BADGE_COLOR[l.level] ?? "gray"} size="sm">
                                                                {l.level}
                                                            </Badge>
                                                        </Table.Cell>
                                                        <Table.Cell>{l.message}</Table.Cell>
                                                    </Table.Row>
                                                )}
                                            </Table.Body>
                                        </Table>
                                    )}
                                </div>
                                <div className="mt-6 flex justify-end">
                                    <Button color="secondary" onClick={() => setIsLogsOpen(false)}>
                                        Close
                                    </Button>
                                </div>
                            </div>
                        </Dialog>
                    </Modal>
                </ModalOverlay>

                {/* APPROVE CONFIRM */}
                <ModalOverlay isOpen={isApproveOpen} onOpenChange={setIsApproveOpen}>
                    <Modal>
                        <Dialog>
                            <div className="w-full max-w-lg rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                                <h3 className="text-lg font-semibold text-primary">{config.approveDialogTitle}</h3>
                                <p className="mt-2 rounded-lg bg-secondary px-4 py-3 text-sm text-secondary ring-1 ring-secondary">{config.approveNote}</p>
                                <div className="mt-4 flex flex-col gap-2 text-sm">
                                    <div>
                                        <span className="font-semibold text-primary">Control:</span> {selectedReview.controlId} — {selectedReview.controlDescription}
                                    </div>
                                    <div>
                                        <span className="font-semibold text-primary">System:</span> {selectedReview.systemId}
                                    </div>
                                    <div>
                                        <span className="font-semibold text-primary">Root Cause Analysis:</span> {rcaText}
                                    </div>
                                </div>
                                <div className="mt-6 flex justify-end gap-3">
                                    <Button color="secondary" onClick={() => setIsApproveOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button isLoading={isDeciding} onClick={() => decide("APPROVE")}>
                                        {config.approveLabel}
                                    </Button>
                                </div>
                            </div>
                        </Dialog>
                    </Modal>
                </ModalOverlay>

                {/* REJECT CONFIRM */}
                <ModalOverlay isOpen={isRejectOpen} onOpenChange={setIsRejectOpen}>
                    <Modal>
                        <Dialog>
                            <div className="w-full max-w-lg rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                                <h3 className="text-lg font-semibold text-primary">{config.rejectDialogTitle}</h3>
                                <p className="mt-2 rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">
                                    Rejecting creates a remediation ticket immediately and ends this review chain.
                                </p>
                                <div className="mt-4 flex flex-col gap-2 text-sm">
                                    <div>
                                        <span className="font-semibold text-primary">Control:</span> {selectedReview.controlId} — {selectedReview.controlDescription}
                                    </div>
                                    <div>
                                        <span className="font-semibold text-primary">Root Cause Analysis:</span> {rcaText}
                                    </div>
                                </div>
                                <div className="mt-6 flex justify-end gap-3">
                                    <Button color="secondary" onClick={() => setIsRejectOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button color="primary-destructive" isLoading={isDeciding} onClick={() => decide("REMEDIATE")}>
                                        Reject
                                    </Button>
                                </div>
                            </div>
                        </Dialog>
                    </Modal>
                </ModalOverlay>
            </div>
        );
    }

    // QUEUE / HISTORY VIEW
    return (
        <div className="flex flex-col gap-6">
            <Breadcrumbs items={[{ label: config.pageTitle }]} />
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <h1 className="text-display-xs font-semibold text-primary">{config.pageTitle}</h1>
                    <p className="text-md text-tertiary">{config.pageSubtitle}</p>
                </div>
                <Button color="secondary" iconLeading={RefreshCw01} onClick={load}>
                    Refresh
                </Button>
            </div>

            {error && <p className="rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}

            <Tabs selectedKey={activeTab} onSelectionChange={(k) => setActiveTab(k as "queue" | "history")}>
                <Tabs.List
                    type="underline"
                    items={[
                        { id: "queue", label: config.queueTitle },
                        { id: "history", label: "Reviewer History" },
                    ]}
                />

                {/* QUEUE TAB */}
                <Tabs.Panel id="queue" className="pt-6">
                    <div className="flex flex-col gap-4">
                        <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-primary">Filters</h2>
                                <Button color="link-gray" size="sm" onClick={onResetQueueFilters}>
                                    Reset
                                </Button>
                            </div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Input aria-label="Search" icon={SearchLg} placeholder="Search Control ID, Description..." value={queueQuery} onChange={setQueueQuery} />
                                <Select label="System" selectedKey={queueSystem} onSelectionChange={(k) => setQueueSystem(k as string)} items={[ALL, ...distinctOptions(systems.map((s) => s.sysId))]}>
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                            <StatCard label="Pending" value={queueKpis.pending} color="gray" />
                            <StatCard label="Overdue" value={queueKpis.overdue} color={queueKpis.overdue > 0 ? "error" : "success"} />
                        </div>

                        {filteredQueue.length === 0 ? (
                            <div className="rounded-xl bg-primary p-8 ring-1 ring-secondary">
                                <EmptyState size="sm">
                                    <EmptyState.Header>
                                        <EmptyState.FeaturedIcon icon={SearchLg} color="gray" theme="modern" />
                                    </EmptyState.Header>
                                    <EmptyState.Content>
                                        <EmptyState.Title>Nothing pending</EmptyState.Title>
                                        <EmptyState.Description>No reviews are currently waiting at this stage.</EmptyState.Description>
                                    </EmptyState.Content>
                                </EmptyState>
                            </div>
                        ) : (
                            <TableCard.Root>
                                <TableCard.Header title={config.queueTitle} badge={<Badge color="gray" size="sm">{filteredQueue.length}</Badge>} />
                                <Table aria-label="Review queue">
                                    <Table.Header>
                                        <Table.Head id="controlId" label="Control ID" isRowHeader />
                                        <Table.Head id="system" label="System" />
                                        <Table.Head id="generatedDate" label="Generated Date" />
                                        {config.showReviewer1Summary && <Table.Head id="rev1Decision" label="Reviewer 1 Decision" />}
                                        <Table.Head id="severity" label="Severity" />
                                        <Table.Head id="sla" label="SLA" />
                                        <Table.Head id="actions" />
                                    </Table.Header>
                                    <Table.Body items={filteredQueue}>
                                        {(review) => (
                                            <Table.Row id={review.id}>
                                                <Table.Cell className="font-medium text-primary">
                                                    {review.controlId}
                                                    <div className="text-xs text-tertiary">{review.controlDescription}</div>
                                                </Table.Cell>
                                                <Table.Cell>{review.systemId}</Table.Cell>
                                                <Table.Cell className="text-tertiary">{formatTimestamp(review.generatedDate)}</Table.Cell>
                                                {config.showReviewer1Summary && (
                                                    <Table.Cell>
                                                        <Badge color={DECISION_BADGE_COLOR[review.reviewer1Status] ?? "gray"} size="sm">
                                                            {DECISION_LABEL[review.reviewer1Status] || review.reviewer1Status}
                                                        </Badge>
                                                    </Table.Cell>
                                                )}
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
                                                    <div className="flex justify-end">
                                                        <Button size="sm" onClick={() => openDetail(review)}>
                                                            Review
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
                            <StatCard label={config.historyKpiLabels.approved} value={historyKpis.approved} color="success" />
                            <StatCard label={config.historyKpiLabels.rejected} value={historyKpis.rejected} color="error" />
                            <StatCard label={config.historyKpiLabels.pending} value={historyKpis.pending} color="brand" />
                        </div>

                        <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-primary">Filters</h2>
                                <Button color="link-gray" size="sm" onClick={onResetHistoryFilters}>
                                    Reset
                                </Button>
                            </div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                                <Input aria-label="Search" icon={SearchLg} placeholder="Search Control ID, Ticket..." value={historyQuery} onChange={setHistoryQuery} />
                                <Input aria-label="Control ID" placeholder="Control ID" value={historyControlId} onChange={setHistoryControlId} />
                                <Select label="System" selectedKey={historySystem} onSelectionChange={(k) => setHistorySystem(k as string)} items={[ALL, ...distinctOptions(systems.map((s) => s.sysId))]}>
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                                <Select label="Decision" selectedKey={historyDecision} onSelectionChange={(k) => setHistoryDecision(k as string)} items={[ALL, { id: "Approved", label: "Approved" }, { id: "Rejected", label: "Rejected" }]}>
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>
                                <Select label="Ticket Status" selectedKey={historyTicketStatus} onSelectionChange={(k) => setHistoryTicketStatus(k as string)} items={[ALL, ...historyTicketStatusOptions]}>
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
                                        <EmptyState.Description>No reviews have been decided at this stage yet.</EmptyState.Description>
                                    </EmptyState.Content>
                                </EmptyState>
                            </div>
                        ) : (
                            <TableCard.Root>
                                <TableCard.Header title="Reviewer History" badge={<Badge color="gray" size="sm">{filteredHistory.length}</Badge>} />
                                <Table aria-label="Reviewer history">
                                    <Table.Header>
                                        <Table.Head id="ticket" label="Ticket" isRowHeader />
                                        <Table.Head id="controlId" label="Control ID" />
                                        <Table.Head id="system" label="System" />
                                        <Table.Head id="decision" label="Decision" />
                                        <Table.Head id="reviewedDate" label="Reviewed Date" />
                                        <Table.Head id="ticketStatus" label="Ticket Status" />
                                        <Table.Head id="actions" />
                                    </Table.Header>
                                    <Table.Body items={filteredHistory}>
                                        {(review) => {
                                            const status = statusFieldFor(review, level);
                                            return (
                                                <Table.Row id={review.id}>
                                                    <Table.Cell>
                                                        {review.ticketUrl ? (
                                                            <button type="button" className="cursor-pointer font-medium text-brand-secondary hover:underline" onClick={() => window.open(review.ticketUrl, "_blank")}>
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
                                                    <Table.Cell className="text-tertiary">{formatTimestamp(atFieldFor(review, level))}</Table.Cell>
                                                    <Table.Cell>{review.ticketStatus || "—"}</Table.Cell>
                                                    <Table.Cell>
                                                        <div className="flex justify-end">
                                                            <Button color="secondary" size="sm" onClick={() => setSelectedHistoryItem(review)}>
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

            {/* HISTORY DETAIL MODAL */}
            <ModalOverlay isOpen={!!selectedHistoryItem} onOpenChange={(open) => !open && setSelectedHistoryItem(null)}>
                <Modal>
                    <Dialog>
                        <div className="w-full max-w-2xl rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                            {selectedHistoryItem && (
                                <>
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h3 className="text-lg font-semibold text-primary">{selectedHistoryItem.controlId}</h3>
                                            <p className="text-sm text-tertiary">{selectedHistoryItem.controlDescription}</p>
                                        </div>
                                        <Badge color={DECISION_BADGE_COLOR[statusFieldFor(selectedHistoryItem, level)] ?? "gray"} size="md">
                                            {DECISION_LABEL[statusFieldFor(selectedHistoryItem, level)] || statusFieldFor(selectedHistoryItem, level)}
                                        </Badge>
                                    </div>
                                    <div className="mt-4 grid grid-cols-2 gap-4">
                                        <Field label="Ticket" value={selectedHistoryItem.ticketNumber || "—"} />
                                        <Field label="Ticket Status" value={selectedHistoryItem.ticketStatus || "—"} />
                                        <Field label="System" value={selectedHistoryItem.systemId} />
                                        <Field label="Reviewed Date" value={formatTimestamp(atFieldFor(selectedHistoryItem, level))} />
                                        <Field label="Reviewed By" value={level === 1 ? selectedHistoryItem.reviewer1ByName : selectedHistoryItem.reviewer2ByName} />
                                    </div>
                                    <div className="mt-4">
                                        <div className="text-xs font-semibold text-tertiary">Root Cause Analysis</div>
                                        <div className="mt-1 text-sm text-primary">{commentFieldFor(selectedHistoryItem, level) || "—"}</div>
                                    </div>
                                    <div className="mt-6 flex justify-end">
                                        <Button color="secondary" onClick={() => setSelectedHistoryItem(null)}>
                                            Close
                                        </Button>
                                    </div>
                                </>
                            )}
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
