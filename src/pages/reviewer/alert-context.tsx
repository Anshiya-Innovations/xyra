import { useEffect, useState } from "react";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Table } from "@/components/application/table/table";
import type { BadgeColors } from "@/components/base/badges/badge-types";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { type AlertHeader, type AlertItem, type RunLogEntry, deviationApi } from "@/lib/api-client";

const SEVERITY_BADGE_COLOR: Record<string, BadgeColors> = { critical: "error", high: "error", medium: "warning", low: "success" };
const LEVEL_BADGE_COLOR: Record<string, BadgeColors> = { ERROR: "error", WARNING: "warning", INFO: "gray" };
const badgeColorFor = (status: string) => SEVERITY_BADGE_COLOR[(status || "").toLowerCase()] ?? "gray";

export function formatTimestamp(iso: string | null | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

export function Field({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="text-xs font-semibold text-tertiary">{label}</div>
            <div className="mt-1 text-sm text-primary">{value}</div>
        </div>
    );
}

// Alert Context Summary + Detailed Deviation Line Items (+ per-item execution
// logs) for one Alert - the read-only half of a review, shared by the
// Reviewer detail page and the Escalation Manager's report view.
export function AlertContext({ alertId }: { alertId: string }) {
    const [header, setHeader] = useState<AlertHeader | null>(null);
    const [items, setItems] = useState<AlertItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [isLogsOpen, setIsLogsOpen] = useState(false);
    const [activeItem, setActiveItem] = useState<AlertItem | null>(null);
    const [logs, setLogs] = useState<RunLogEntry[] | null>(null);
    const [isLogsLoading, setIsLogsLoading] = useState(false);

    useEffect(() => {
        setHeader(null);
        setItems([]);
        setLogs(null);
        if (!alertId) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        deviationApi
            .getDetail(alertId)
            .then((res) => {
                if (res.success) {
                    setHeader(res.header);
                    setItems(res.items);
                }
            })
            .catch(() => {})
            .finally(() => setIsLoading(false));
    }, [alertId]);

    // Logs are per Alert (one run), not per line item - fetched once, reused.
    const onOpenLogs = (item: AlertItem) => {
        setActiveItem(item);
        setIsLogsOpen(true);
        if (logs) return;
        setIsLogsLoading(true);
        deviationApi
            .getRunLogs(alertId)
            .then((res) => setLogs(res.success ? res.logs : []))
            .catch(() => setLogs([]))
            .finally(() => setIsLogsLoading(false));
    };

    if (isLoading) {
        return (
            <div className="flex min-h-40 items-center justify-center">
                <LoadingIndicator type="line-simple" size="sm" label="Loading alert context…" />
            </div>
        );
    }
    if (!header) return null;

    return (
        <>
            <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                <h2 className="mb-4 text-lg font-semibold text-primary">Alert Context Summary</h2>
                <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
                    <Field label="System & Client" value={`${header.systemId} (Client ${header.client})`} />
                    <Field label="Sector / Platform" value={`${header.sector} / ${header.platform}`} />
                    <Field label="Alert Date" value={formatTimestamp(header.alertDate)} />
                    <Field label="Deviations" value={`${header.deviationCount} line deviations`} />
                </div>
            </div>

            <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                <h2 className="mb-4 text-lg font-semibold text-primary">Detailed Deviation Line Items</h2>
                {items.length === 0 ? (
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
                        <Table.Body items={items}>
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
                                ) : !logs || logs.length === 0 ? (
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
        </>
    );
}
