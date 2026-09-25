import { useEffect, useMemo, useState } from "react";
import { Download01, FileSearch02, RefreshCcw01 } from "@untitledui/icons";
import type { DateValue } from "react-aria-components";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { Table, TableCard } from "@/components/application/table/table";
import { DateRangePicker } from "@/components/application/date-picker/date-range-picker";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Breadcrumbs } from "@/components/application/breadcrumbs/breadcrumbs";
import { notify } from "@/components/application/notification/notification";
import { type Control, type ControlHistoryEntry, type SystemEntry, controlApi, systemConfigApi } from "@/lib/api-client";

type FilterOption = { id: string; label: string };
const ALL: FilterOption = { id: "All", label: "All" };

type Filters = {
    controlId: string;
    systemId: string;
    client: string;
    region: string;
    platform: string;
    sector: string;
};

const DEFAULT_FILTERS: Filters = { controlId: "", systemId: "All", client: "All", region: "All", platform: "All", sector: "All" };

function distinctOptions(systems: SystemEntry[], get: (s: SystemEntry) => string): FilterOption[] {
    const seen = new Set<string>();
    const out: FilterOption[] = [];
    systems.forEach((s) => {
        const v = get(s);
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

export const ReportsPage = () => {
    const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
    const [dateRange, setDateRange] = useState<{ start: DateValue; end: DateValue } | null>(null);

    const [controls, setControls] = useState<Control[]>([]);
    const [systems, setSystems] = useState<SystemEntry[]>([]);

    const [rows, setRows] = useState<ControlHistoryEntry[]>([]);
    const [reportGenerated, setReportGenerated] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        controlApi.list().then((res) => res.success && setControls(res.controls)).catch(() => {});
        systemConfigApi.list().then((res) => res.success && setSystems(res.systems)).catch(() => {});
    }, []);

    const summary = useMemo(() => {
        const deviations = rows.filter((r) => r.deviationFlag).length;
        return { total: rows.length, passed: rows.length - deviations, deviations };
    }, [rows]);

    const set = <K extends keyof Filters>(key: K) => (value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));

    const onGenerate = async () => {
        if (!filters.controlId) {
            notify("error", "Please select a Control.");
            return;
        }
        setIsGenerating(true);
        try {
            const res = await controlApi.listControlHistory({
                controlId: filters.controlId,
                systemId: filters.systemId !== "All" ? filters.systemId : "",
                client: filters.client !== "All" ? filters.client : "",
                region: filters.region !== "All" ? filters.region : "",
                platform: filters.platform !== "All" ? filters.platform : "",
                sector: filters.sector !== "All" ? filters.sector : "",
                startDate: dateRange ? dateRange.start.toString() : "",
                endDate: dateRange ? dateRange.end.toString() : "",
            });
            if (!res.success) {
                notify("error", res.message || "Could not load control history.");
                setReportGenerated(false);
                setRows([]);
                return;
            }
            setRows(res.history);
            setReportGenerated(true);
        } catch {
            notify("error", "Could not reach the server. Is xyra-core running?");
            setReportGenerated(false);
            setRows([]);
        } finally {
            setIsGenerating(false);
        }
    };

    const onReset = () => {
        setFilters(DEFAULT_FILTERS);
        setDateRange(null);
        setRows([]);
        setReportGenerated(false);
        notify("success", "Filters reset.");
    };

    const onExportCsv = () => {
        if (rows.length === 0) {
            notify("error", "No control history records available to export.");
            return;
        }
        const header = ["Control ID", "Description", "System ID", "Client", "Region", "Platform", "Sector", "SAP Object", "Parameter", "Actual Value", "Expected Value", "Deviation", "Message", "Captured At"].join(",");
        const dataRows = rows.map((r) =>
            [
                toCsvCell(r.controlId),
                toCsvCell(r.controlDescription),
                toCsvCell(r.systemId),
                toCsvCell(r.client),
                toCsvCell(r.region),
                toCsvCell(r.platform),
                toCsvCell(r.sector),
                toCsvCell(r.sapObject),
                toCsvCell(r.parameter),
                toCsvCell(r.actualValue),
                toCsvCell(r.expectedValue),
                toCsvCell(r.deviationFlag ? "Deviation" : "OK"),
                toCsvCell(r.message),
                toCsvCell(r.capturedAt),
            ].join(","),
        );
        const blob = new Blob([[header, ...dataRows].join("\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `XYRA_Control_History_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        notify("success", "Control history exported to CSV successfully.");
    };

    return (
        <div className="flex flex-col gap-6">
            <Breadcrumbs items={[{ label: "Reports" }]} />
            <div className="flex flex-col gap-1">
                <h1 className="text-display-xs font-semibold text-primary">Reports</h1>
                <p className="text-md text-tertiary">Control History Data Review</p>
            </div>

            {/* FILTERS */}
            <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-primary">Control History Data Review</h2>
                    <div className="flex items-center gap-3">
                        <Button color="secondary" iconLeading={Download01} onClick={onExportCsv}>
                            Export CSV
                        </Button>
                        <Button color="secondary" iconLeading={RefreshCcw01} onClick={onReset}>
                            Reset Filters
                        </Button>
                        <Button iconLeading={FileSearch02} isLoading={isGenerating} onClick={onGenerate}>
                            Generate Report
                        </Button>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    <Select label="Control" isRequired placeholder="Select control" selectedKey={filters.controlId || null} onSelectionChange={(k) => set("controlId")(k as string)} items={controls.map((c) => ({ id: c.id, label: `${c.code} - ${c.description}` }))}>
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <Select label="System" selectedKey={filters.systemId} onSelectionChange={(k) => set("systemId")(k as string)} items={[ALL, ...distinctOptions(systems, (s) => s.sysId)]}>
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <Select label="Client" selectedKey={filters.client} onSelectionChange={(k) => set("client")(k as string)} items={[ALL, ...distinctOptions(systems, (s) => s.client)]}>
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <Select label="Region" selectedKey={filters.region} onSelectionChange={(k) => set("region")(k as string)} items={[ALL, ...distinctOptions(systems, (s) => s.region)]}>
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <Select label="Platform" selectedKey={filters.platform} onSelectionChange={(k) => set("platform")(k as string)} items={[ALL, ...distinctOptions(systems, (s) => s.platform)]}>
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <Select label="Sector" selectedKey={filters.sector} onSelectionChange={(k) => set("sector")(k as string)} items={[ALL, ...distinctOptions(systems, (s) => s.sector)]}>
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <div className="col-span-2 flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-secondary">Date Range</span>
                        <DateRangePicker value={dateRange} onChange={setDateRange} />
                    </div>
                </div>
            </div>

            {reportGenerated && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <SummaryCard label="Total Values Extracted" value={summary.total} hint="Every value the control checked" color="gray" />
                    <SummaryCard label="Passed (No Deviation)" value={summary.passed} hint="Matched expected value" color="success" />
                    <SummaryCard label="Deviations Found" value={summary.deviations} hint="Differed from expected value" color="error" />
                </div>
            )}

            {isGenerating ? (
                <div className="flex min-h-60 items-center justify-center">
                    <LoadingIndicator type="line-simple" size="md" label="Loading control history…" />
                </div>
            ) : rows.length === 0 ? (
                <div className="rounded-xl bg-primary p-8 ring-1 ring-secondary">
                    <EmptyState size="sm">
                        <EmptyState.Header>
                            <EmptyState.FeaturedIcon icon={FileSearch02} color="gray" theme="modern" />
                        </EmptyState.Header>
                        <EmptyState.Content>
                            <EmptyState.Title>No report generated yet</EmptyState.Title>
                            <EmptyState.Description>Select a Control and press Generate Report to see extracted values.</EmptyState.Description>
                        </EmptyState.Content>
                    </EmptyState>
                </div>
            ) : (
                <TableCard.Root>
                    <TableCard.Header title="Extracted Control Run Values" badge={<Badge color="gray" size="sm">{rows.length}</Badge>} />
                    <Table aria-label="Control run history">
                        <Table.Header>
                            <Table.Head id="controlId" label="Control ID" isRowHeader />
                            <Table.Head id="description" label="Description" />
                            <Table.Head id="system" label="System" />
                            <Table.Head id="client" label="Client" />
                            <Table.Head id="region" label="Region" />
                            <Table.Head id="platform" label="Platform" />
                            <Table.Head id="sector" label="Sector" />
                            <Table.Head id="sapObject" label="SAP Object" />
                            <Table.Head id="parameter" label="Parameter" />
                            <Table.Head id="actual" label="Actual" />
                            <Table.Head id="expected" label="Expected" />
                            <Table.Head id="status" label="Status" />
                            <Table.Head id="capturedAt" label="Captured At" />
                        </Table.Header>
                        <Table.Body items={rows.map((r, i) => ({ ...r, rowId: `${r.controlId}-${r.systemId}-${r.sapObject}-${r.parameter}-${i}` }))}>
                            {(r) => (
                                <Table.Row id={r.rowId}>
                                    <Table.Cell className="font-medium text-primary">{r.controlId}</Table.Cell>
                                    <Table.Cell>{r.controlDescription}</Table.Cell>
                                    <Table.Cell>{r.systemId}</Table.Cell>
                                    <Table.Cell>{r.client}</Table.Cell>
                                    <Table.Cell>{r.region}</Table.Cell>
                                    <Table.Cell>{r.platform}</Table.Cell>
                                    <Table.Cell>{r.sector}</Table.Cell>
                                    <Table.Cell>{r.sapObject}</Table.Cell>
                                    <Table.Cell>{r.parameter}</Table.Cell>
                                    <Table.Cell>{r.actualValue}</Table.Cell>
                                    <Table.Cell>{r.expectedValue}</Table.Cell>
                                    <Table.Cell>
                                        <Badge color={r.deviationFlag ? "error" : "success"} size="sm">
                                            {r.deviationFlag ? "Deviation" : "OK"}
                                        </Badge>
                                    </Table.Cell>
                                    <Table.Cell className="text-tertiary">{r.capturedAt ? new Date(r.capturedAt).toLocaleString() : "—"}</Table.Cell>
                                </Table.Row>
                            )}
                        </Table.Body>
                    </Table>
                </TableCard.Root>
            )}
        </div>
    );
};

function SummaryCard({ label, value, hint, color }: { label: string; value: number; hint: string; color: "gray" | "success" | "error" }) {
    return (
        <div className="flex flex-col gap-2 rounded-xl bg-primary p-5 ring-1 ring-secondary">
            <span className="text-sm text-tertiary">{label}</span>
            <span className="text-display-sm font-semibold text-primary">{value}</span>
            <Badge color={color} size="sm">
                {hint}
            </Badge>
        </div>
    );
}
