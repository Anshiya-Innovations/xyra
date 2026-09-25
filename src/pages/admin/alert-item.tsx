import { useEffect, useState } from "react";
import { ArrowLeft, Download01, RefreshCw01 } from "@untitledui/icons";
import { useNavigate, useParams } from "react-router";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Table } from "@/components/application/table/table";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Breadcrumbs } from "@/components/application/breadcrumbs/breadcrumbs";
import { type AlertHeader, type AlertItem, type RunLogEntry, deviationApi } from "@/lib/api-client";

const STATUS_BADGE_COLOR: Record<string, "error" | "warning" | "success" | "gray"> = {
    critical: "error",
    high: "error",
    medium: "warning",
    low: "success",
    open: "error",
    "in progress": "warning",
    resolved: "success",
};
const badgeColorFor = (status: string) => STATUS_BADGE_COLOR[(status || "").toLowerCase()] ?? "gray";
const LEVEL_BADGE_COLOR: Record<string, "error" | "warning" | "gray"> = { ERROR: "error", WARNING: "warning", INFO: "gray" };

function formatTimestamp(iso: string | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function downloadLogsCsv(header: AlertHeader | null, logs: RunLogEntry[]) {
    if (!logs.length) return;
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [
        ["Timestamp", "Level", "Message"].map(escape).join(","),
        ...logs.map((l) => [l.timestamp, l.level, l.message].map(escape).join(",")),
    ];
    const blob = new Blob(["﻿" + rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeControl = (header?.controlId || "alert").replace(/[^a-z0-9_-]/gi, "_");
    a.href = url;
    a.download = `XYRA_Execution_Logs_${safeControl}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export const AlertItemPage = () => {
    const navigate = useNavigate();
    const { alertId } = useParams();
    const [header, setHeader] = useState<AlertHeader | null>(null);
    const [items, setItems] = useState<AlertItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [isLogsOpen, setIsLogsOpen] = useState(false);
    const [logs, setLogs] = useState<RunLogEntry[]>([]);
    const [isLogsLoading, setIsLogsLoading] = useState(false);
    const [activeItem, setActiveItem] = useState<AlertItem | null>(null);
    const [cachedLogs, setCachedLogs] = useState<RunLogEntry[] | null>(null);

    const load = () => {
        if (!alertId) return;
        setIsLoading(true);
        deviationApi
            .getDetail(alertId)
            .then((res) => {
                if (!res.success || !res.header) {
                    setError(res.message || "Could not load this alert.");
                    return;
                }
                setError(null);
                setHeader(res.header);
                setItems(res.items);
            })
            .catch(() => setError("Could not reach the server. Is xyra-core running?"))
            .finally(() => setIsLoading(false));
    };

    useEffect(() => {
        setCachedLogs(null);
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [alertId]);

    // ControlRunLogs are scoped to the whole alert/run, not one line item -
    // every "Logs" button on this alert shows the same rows (fetched once,
    // cached), matching xyra-web's AlertItem.controller.js exactly.
    const onOpenLogs = (item: AlertItem) => {
        setActiveItem(item);
        setIsLogsOpen(true);
        if (cachedLogs) {
            setLogs(cachedLogs);
            return;
        }
        if (!alertId) return;
        setIsLogsLoading(true);
        deviationApi
            .getRunLogs(alertId)
            .then((res) => {
                const rows = res.success ? res.logs : [];
                setCachedLogs(rows);
                setLogs(rows);
            })
            .catch(() => setLogs([]))
            .finally(() => setIsLogsLoading(false));
    };

    if (isLoading) {
        return (
            <div className="flex min-h-100 items-center justify-center">
                <LoadingIndicator type="line-simple" size="md" label="Gathering alert details…" />
            </div>
        );
    }

    if (!header) {
        return (
            <div className="flex flex-col gap-4">
                <p className="rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">{error || "Alert not found."}</p>
                <Button color="secondary" iconLeading={ArrowLeft} onClick={() => navigate("/deviation-report")} className="w-fit">
                    Back to Deviation Report
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <Breadcrumbs
                items={[
                    { label: "Control Management" },
                    { label: "Deviation Report", href: "/deviation-report" },
                    { label: `${header.controlId} Alert Details` },
                ]}
            />
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <Button color="link-gray" size="sm" iconLeading={ArrowLeft} onClick={() => navigate("/deviation-report")} className="w-fit">
                        Back to Deviation Report
                    </Button>
                    <h1 className="text-display-xs font-semibold text-primary">Alert Item Details</h1>
                    <p className="text-md text-tertiary">Control {header.controlId} line item analysis</p>
                </div>
                <Button color="secondary" iconLeading={RefreshCw01} onClick={load}>
                    Refresh
                </Button>
            </div>

            {error && <p className="rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}

            {/* ALERT CONTEXT SUMMARY */}
            <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                <h2 className="mb-4 text-lg font-semibold text-primary">Alert Context Summary</h2>
                <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
                    <div>
                        <div className="text-xs font-semibold text-tertiary">Control ID &amp; Name</div>
                        <div className="mt-1 text-md font-semibold text-primary">{header.controlId}</div>
                        <div className="text-sm text-tertiary">{header.controlDescription}</div>
                    </div>
                    <div>
                        <div className="text-xs font-semibold text-tertiary">System &amp; Client</div>
                        <div className="mt-1 text-sm font-semibold text-primary">
                            {header.systemId} (Client {header.client})
                        </div>
                        <div className="text-sm text-tertiary">
                            Sector: {header.sector} | Platform: {header.platform}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs font-semibold text-tertiary">Status &amp; Severity</div>
                        <div className="mt-1 flex items-center gap-2">
                            <Badge color={badgeColorFor(header.status)} size="sm">
                                {header.status}
                            </Badge>
                            <Badge color={badgeColorFor(header.severity)} size="sm">
                                {header.severity}
                            </Badge>
                        </div>
                    </div>
                    <div>
                        <div className="text-xs font-semibold text-tertiary">Alert Date &amp; Deviations</div>
                        <div className="mt-1 text-sm font-semibold text-primary">{formatTimestamp(header.alertDate)}</div>
                        <div className="text-sm text-tertiary">{header.deviationCount} line deviations</div>
                    </div>
                </div>

                <div className="mt-4">
                    <div className="text-xs font-semibold text-tertiary">Incident Description</div>
                    <div className="mt-1 text-sm font-semibold text-primary">{header.description || "—"}</div>
                </div>
            </div>

            {/* DEVIATION LINE ITEMS */}
            <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                <h2 className="mb-4 text-lg font-semibold text-primary">Detailed Deviation Line Items</h2>
                {items.length === 0 ? (
                    <p className="py-6 text-center text-sm text-tertiary">No detailed deviation line items found.</p>
                ) : (
                    <Table aria-label="Alert line items">
                        <Table.Header>
                            <Table.Head id="sapObject" label="SAP Object" isRowHeader />
                            <Table.Head id="parameter" label="Parameter" />
                            <Table.Head id="operator" label="Operator" />
                            <Table.Head id="expected" label="Expected Value" />
                            <Table.Head id="actual" label="Actual Detected Value" />
                            <Table.Head id="status" label="Status" />
                            <Table.Head id="timestamp" label="Timestamp" />
                            <Table.Head id="logs" />
                        </Table.Header>
                        <Table.Body items={items}>
                            {(item) => (
                                <Table.Row id={item.id}>
                                    <Table.Cell className="font-medium text-primary">{item.sapObject}</Table.Cell>
                                    <Table.Cell>{item.parameter}</Table.Cell>
                                    <Table.Cell>{item.operator}</Table.Cell>
                                    <Table.Cell>{item.expectedValue}</Table.Cell>
                                    <Table.Cell className="font-medium text-primary">{item.actualValue}</Table.Cell>
                                    <Table.Cell>
                                        <Badge color={badgeColorFor(item.status)} size="sm">
                                            {item.status}
                                        </Badge>
                                    </Table.Cell>
                                    <Table.Cell className="text-tertiary">{formatTimestamp(item.timestamp)}</Table.Cell>
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

            {/* EXECUTION LOGS DIALOG */}
            <ModalOverlay isOpen={isLogsOpen} onOpenChange={setIsLogsOpen}>
                <Modal>
                    <Dialog>
                        <div className="w-full max-w-2xl rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-semibold text-primary">
                                        Control ID: {header.controlId} {activeItem ? `(${activeItem.sapObject}/${activeItem.parameter})` : ""}
                                    </h3>
                                    <p className="text-sm text-tertiary">{header.controlDescription}</p>
                                </div>
                                {activeItem && (
                                    <Badge color={badgeColorFor(activeItem.status)} size="md">
                                        {activeItem.status}
                                    </Badge>
                                )}
                            </div>

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

                            <div className="mt-6 flex justify-between">
                                <Button color="secondary" iconLeading={Download01} onClick={() => downloadLogsCsv(header, logs)} isDisabled={!logs.length}>
                                    Download Log
                                </Button>
                                <Button color="secondary" onClick={() => setIsLogsOpen(false)}>
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
