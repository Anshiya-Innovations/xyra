import { useEffect, useMemo, useState } from "react";
import { Download01, RefreshCw01, SearchLg } from "@untitledui/icons";
import { useNavigate } from "react-router";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { Breadcrumbs } from "@/components/application/breadcrumbs/breadcrumbs";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { notify } from "@/components/application/notification/notification";
import { Table, TableCard } from "@/components/application/table/table";
import type { BadgeColors } from "@/components/base/badges/badge-types";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import {
    type AlertHeader,
    type Control,
    type DeviationKpi,
    type SystemControlConfig,
    controlApi,
    deviationApi,
    systemControlConfigApi,
} from "@/lib/api-client";
import { FREQ_BE_TO_UI } from "@/lib/control-frequency";
import { Field, formatTimestamp } from "@/pages/reviewer/alert-context";

type Status = "Compliant" | "Non-Compliant" | "Pending Review" | "Not Tested";

// Same red/amber/green as the Deviation Report's donut (Untitled UI's
// error/warning/success solids) plus neutral gray for "not tested yet".
const STATUS_COLORS: Record<Status, string> = { Compliant: "#16a34a", "Non-Compliant": "#dc2626", "Pending Review": "#ca8a04", "Not Tested": "#98a2b3" };
const STATUS_BADGE: Record<Status, BadgeColors> = { Compliant: "success", "Non-Compliant": "error", "Pending Review": "warning", "Not Tested": "gray" };
const RISK_BADGE: Record<string, BadgeColors> = { HIGH: "error", MEDIUM: "warning", LOW: "success" };
const SEVERITY_ORDER = ["Critical", "High", "Medium", "Low"] as const;
const SEVERITY_BADGE: Record<string, BadgeColors> = { Critical: "error", High: "error", Medium: "warning", Low: "success" };
const ALERT_STATUS_BADGE: Record<string, BadgeColors> = { Open: "error", "In Progress": "warning", Resolved: "success" };

const titleCase = (s: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");
const toCsvCell = (v: string | number) => `"${String(v ?? "").replace(/"/g, '""')}"`;

type Row = SystemControlConfig & {
    status: Status;
    openAlerts: AlertHeader[]; // unresolved (Open + In Progress) alerts for this control on this system/client
    deviationCount: number; // line items across those unresolved alerts
};

// One row per control <-> system mapping - that's the unit a control is
// actually tested on. Status is derived from the mapping's run record plus the
// review state of its deviation alerts; nothing here is stored separately.
function toRow(m: SystemControlConfig, alerts: AlertHeader[]): Row {
    const mine = alerts.filter((a) => a.controlId === m.controlCode && a.systemId === m.systemCode && a.client === m.systemClient);
    const openAlerts = mine.filter((a) => a.status !== "Resolved");
    const status: Status = !m.lastRunAt
        ? "Not Tested"
        : openAlerts.some((a) => a.status === "Open")
          ? "Non-Compliant"
          : openAlerts.length
            ? "Pending Review"
            : "Compliant";
    return { ...m, status, openAlerts, deviationCount: openAlerts.reduce((n, a) => n + a.deviationCount, 0) };
}

export const SoxCompliancePage = () => {
    const navigate = useNavigate();
    const [rows, setRows] = useState<Row[]>([]);
    const [kpi, setKpi] = useState<DeviationKpi | null>(null);
    const [controls, setControls] = useState<Control[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");
    const [systemFilter, setSystemFilter] = useState("All");
    const [selected, setSelected] = useState<Row | null>(null);

    const load = () => {
        setIsLoading(true);
        Promise.all([systemControlConfigApi.list(), deviationApi.list({}), controlApi.list()])
            .then(([mapRes, devRes, ctlRes]) => {
                if (!mapRes.success || !devRes.success) {
                    setError(mapRes.message || devRes.message || "Could not load SOX compliance data.");
                    return;
                }
                setError(null);
                setKpi(devRes.kpi);
                setRows(mapRes.configs.map((m) => toRow(m, devRes.headers)));
                if (ctlRes.success) setControls(ctlRes.controls);
            })
            .catch(() => setError("Could not reach the server. Is xyra-core running?"))
            .finally(() => setIsLoading(false));
    };

    useEffect(load, []);

    // Scoped to monitored mappings, not every alert in the tenant - alerts of
    // deleted controls/mappings would otherwise inflate the summary past what
    // the table below can account for.
    const unresolvedAlerts = useMemo(() => rows.flatMap((r) => r.openAlerts), [rows]);

    const statusCounts = useMemo(() => {
        const counts: Record<Status, number> = { Compliant: 0, "Non-Compliant": 0, "Pending Review": 0, "Not Tested": 0 };
        rows.forEach((r) => counts[r.status]++);
        return counts;
    }, [rows]);

    const severityCounts = useMemo(() => {
        const counts: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
        unresolvedAlerts.forEach((a) => {
            if (a.severity in counts) counts[a.severity]++;
        });
        return counts;
    }, [unresolvedAlerts]);

    const activeCount = rows.filter((r) => r.enabled).length;
    const openDeviations = rows.reduce((n, r) => n + r.deviationCount, 0);
    const highRiskOpen = severityCounts.Critical + severityCounts.High;
    const donutData = (Object.keys(statusCounts) as Status[]).map((name) => ({ name, value: statusCounts[name] })).filter((d) => d.value > 0);

    const systemOptions = useMemo(() => [...new Set(rows.map((r) => r.systemCode).filter(Boolean))].map((s) => ({ id: s, label: s })), [rows]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return rows.filter((r) => {
            if (q && !`${r.controlCode} ${r.controlDescription}`.toLowerCase().includes(q)) return false;
            if (statusFilter !== "All" && r.status !== statusFilter) return false;
            if (systemFilter !== "All" && r.systemCode !== systemFilter) return false;
            return true;
        });
    }, [rows, query, statusFilter, systemFilter]);

    const onExportCsv = () => {
        if (filtered.length === 0) {
            notify("error", "No SOX controls available to export.");
            return;
        }
        const header = ["Control ID", "Description", "System", "Client", "Frequency", "Active", "Compliance Status", "Open Deviations", "Risk", "Last Run", "Last Result"].join(",");
        const lines = filtered.map((r) =>
            [
                r.controlCode,
                r.controlDescription,
                r.systemCode,
                r.systemClient,
                FREQ_BE_TO_UI[r.controlFrequency] || r.controlFrequency,
                r.enabled ? "Yes" : "No",
                r.status,
                r.deviationCount,
                titleCase(r.controlSeverity),
                r.lastRunAt || "",
                r.lastRunStatus,
            ]
                .map(toCsvCell)
                .join(","),
        );
        const url = URL.createObjectURL(new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8;" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `XYRA_SOX_Control_Monitoring_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        notify("success", "SOX controls exported to CSV.");
    };

    if (isLoading) {
        return (
            <div className="flex min-h-100 items-center justify-center">
                <LoadingIndicator type="line-simple" size="md" label="Loading SOX compliance…" />
            </div>
        );
    }

    const selectedControl = selected ? controls.find((c) => c.id === selected.controlId) : undefined;

    return (
        <div className="flex flex-col gap-6">
            <Breadcrumbs items={[{ label: "SOX Compliance" }]} />
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <h1 className="text-display-xs font-semibold text-primary">SOX Compliance</h1>
                    <p className="text-md text-tertiary">Sarbanes-Oxley control testing status across every monitored control and system.</p>
                </div>
                <Button color="secondary" iconLeading={RefreshCw01} onClick={load}>
                    Refresh
                </Button>
            </div>

            {error && <p className="rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
                <StatCard label="Monitored Controls" value={rows.length} note="Control × system mappings" />
                <StatCard
                    label="Active Automated"
                    value={activeCount}
                    note={rows.length ? `${Math.round((activeCount / rows.length) * 100)}% running on schedule` : "—"}
                    tone="brand"
                />
                <StatCard label="Open Deviations" value={openDeviations} note="Unresolved line items" tone={openDeviations ? "error" : "success"} />
                <StatCard label="Compliance Score" value={kpi?.complianceRate ?? "—"} note="Rule checks passed" tone="success" />
                <StatCard label="High-Risk Issues" value={highRiskOpen} note="Unresolved high/critical alerts" tone={highRiskOpen ? "error" : "success"} />
            </div>

            {/* CHART + ALERT SUMMARY */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                    <h2 className="text-lg font-semibold text-primary">Compliance Status Distribution</h2>
                    <p className="text-sm text-tertiary">Breakdown of monitored controls by current status</p>
                    {donutData.length === 0 ? (
                        <p className="py-16 text-center text-sm text-tertiary">No controls are mapped to systems yet.</p>
                    ) : (
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2} stroke="none">
                                        {donutData.map((d) => (
                                            <Cell key={d.name} fill={STATUS_COLORS[d.name]} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                    <h2 className="text-lg font-semibold text-primary">Risk & Alert Summary</h2>
                    <p className="text-sm text-tertiary">Unresolved deviation alerts by severity</p>
                    <div className="mt-4 flex flex-col gap-3">
                        {SEVERITY_ORDER.map((sev) => (
                            <div key={sev} className="flex items-center justify-between border-b border-secondary pb-2 last:border-0">
                                <span className="text-sm font-medium text-primary">{sev}</span>
                                <Badge color={SEVERITY_BADGE[sev]} size="md">
                                    {severityCounts[sev]}
                                </Badge>
                            </div>
                        ))}
                    </div>
                    {statusCounts["Non-Compliant"] > 0 && (
                        <p className="mt-4 rounded-lg bg-warning-primary px-4 py-3 text-sm text-warning-primary">
                            Action required: {statusCounts["Non-Compliant"]} control mapping(s) have open deviations awaiting review.
                        </p>
                    )}
                </div>
            </div>

            {/* MONITORING TABLE */}
            <TableCard.Root>
                <TableCard.Header
                    title="SOX Control Monitoring"
                    badge={
                        <Badge color="gray" size="sm">
                            {filtered.length}
                        </Badge>
                    }
                    contentTrailing={
                        <div className="flex flex-wrap items-center gap-3">
                            <Input size="sm" aria-label="Search controls" icon={SearchLg} placeholder="Search Control ID or Description..." value={query} onChange={setQuery} />
                            <Select
                                size="sm"
                                className="w-44 shrink-0"
                                aria-label="Status filter"
                                selectedKey={statusFilter}
                                onSelectionChange={(k) => setStatusFilter(k as string)}
                                items={[{ id: "All", label: "All Statuses" }, ...(Object.keys(STATUS_COLORS) as Status[]).map((s) => ({ id: s, label: s }))]}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                            <Select
                                size="sm"
                                className="w-36 shrink-0"
                                aria-label="System filter"
                                selectedKey={systemFilter}
                                onSelectionChange={(k) => setSystemFilter(k as string)}
                                items={[{ id: "All", label: "All Systems" }, ...systemOptions]}
                            >
                                {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                            </Select>
                            <Button color="secondary" size="sm" iconLeading={Download01} onClick={onExportCsv}>
                                Export CSV
                            </Button>
                        </div>
                    }
                />
                {filtered.length === 0 ? (
                    <div className="flex min-h-60 items-center justify-center p-8">
                        <EmptyState size="sm">
                            <EmptyState.Header>
                                <EmptyState.FeaturedIcon icon={SearchLg} color="gray" theme="modern" />
                            </EmptyState.Header>
                            <EmptyState.Content>
                                <EmptyState.Title>{rows.length ? "No matching controls" : "No monitored controls yet"}</EmptyState.Title>
                                <EmptyState.Description>
                                    {rows.length ? "Try different filters." : "Map a control to a system in System Control Config to start monitoring it."}
                                </EmptyState.Description>
                            </EmptyState.Content>
                        </EmptyState>
                    </div>
                ) : (
                    <Table aria-label="SOX control monitoring">
                        <Table.Header>
                            <Table.Head id="control" label="Control ID" isRowHeader />
                            <Table.Head id="description" label="Description" />
                            <Table.Head id="system" label="System" />
                            <Table.Head id="frequency" label="Frequency" />
                            <Table.Head id="status" label="Compliance Status" />
                            <Table.Head id="deviations" label="Open Deviations" />
                            <Table.Head id="risk" label="Risk" />
                            <Table.Head id="lastRun" label="Last Run" />
                            <Table.Head id="actions" label="Actions" />
                        </Table.Header>
                        <Table.Body items={filtered}>
                            {(r) => (
                                <Table.Row id={r.id}>
                                    <Table.Cell>
                                        <button type="button" className="cursor-pointer font-medium text-brand-secondary hover:underline" onClick={() => setSelected(r)}>
                                            {r.controlCode}
                                        </button>
                                        {!r.enabled && <div className="text-xs text-tertiary">Inactive</div>}
                                    </Table.Cell>
                                    <Table.Cell className="max-w-xs truncate">{r.controlDescription}</Table.Cell>
                                    <Table.Cell>
                                        {r.systemCode}/{r.systemClient}
                                    </Table.Cell>
                                    <Table.Cell>{FREQ_BE_TO_UI[r.controlFrequency] || r.controlFrequency}</Table.Cell>
                                    <Table.Cell>
                                        <Badge color={STATUS_BADGE[r.status]} size="sm">
                                            {r.status}
                                        </Badge>
                                    </Table.Cell>
                                    <Table.Cell className={r.deviationCount ? "font-semibold text-error-primary" : "text-tertiary"}>{r.deviationCount}</Table.Cell>
                                    <Table.Cell>
                                        <Badge color={RISK_BADGE[r.controlSeverity] ?? "gray"} size="sm">
                                            {titleCase(r.controlSeverity)}
                                        </Badge>
                                    </Table.Cell>
                                    <Table.Cell className="text-tertiary">{formatTimestamp(r.lastRunAt)}</Table.Cell>
                                    <Table.Cell>
                                        <div className="flex justify-end">
                                            <Button color="secondary" size="sm" onClick={() => setSelected(r)}>
                                                View Details
                                            </Button>
                                        </div>
                                    </Table.Cell>
                                </Table.Row>
                            )}
                        </Table.Body>
                    </Table>
                )}
            </TableCard.Root>

            {/* DETAILS */}
            <ModalOverlay isOpen={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
                <Modal>
                    <Dialog>
                        <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                            {selected && (
                                <div className="flex flex-col gap-6">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <h3 className="text-lg font-semibold text-primary">
                                                {selected.controlCode} – {selected.controlDescription}
                                            </h3>
                                            <p className="text-sm text-tertiary">
                                                {titleCase(selected.controlType) || "—"} control on {selected.systemCode}/{selected.systemClient}
                                            </p>
                                        </div>
                                        <Badge color={STATUS_BADGE[selected.status]} size="md">
                                            {selected.status}
                                        </Badge>
                                    </div>

                                    <section>
                                        <h4 className="mb-3 text-md font-semibold text-primary">Control Overview</h4>
                                        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                                            <Field label="Target System" value={`${selected.systemCode} (Client ${selected.systemClient})`} />
                                            <Field label="Execution Frequency" value={FREQ_BE_TO_UI[selected.controlFrequency] || selected.controlFrequency} />
                                            <Field label="Automation" value={selected.enabled ? "Automated — running on schedule" : "Automated — mapping inactive"} />
                                            <Field label="Risk Severity" value={titleCase(selected.controlSeverity)} />
                                            <Field label="Open Deviations" value={String(selected.deviationCount)} />
                                            <Field
                                                label="Last Execution"
                                                value={selected.lastRunAt ? `${formatTimestamp(selected.lastRunAt)} (${selected.lastRunStatus || "—"})` : "Never run"}
                                            />
                                            <Field label="Total Runs" value={String(selected.runCount)} />
                                        </div>
                                    </section>

                                    <section>
                                        <h4 className="mb-3 text-md font-semibold text-primary">Rule Validation Parameters</h4>
                                        {!selectedControl || selectedControl.rules.length === 0 ? (
                                            <p className="text-sm text-tertiary">No rules found for this control.</p>
                                        ) : (
                                            <Table aria-label="Control rules">
                                                <Table.Header>
                                                    <Table.Head id="object" label="SAP Object" isRowHeader />
                                                    <Table.Head id="parameter" label="Parameter" />
                                                    <Table.Head id="operator" label="Operator" />
                                                    <Table.Head id="expected" label="Expected Value" />
                                                </Table.Header>
                                                <Table.Body items={selectedControl.rules.map((rule, i) => ({ ...rule, key: rule.id || String(i) }))}>
                                                    {(rule) => (
                                                        <Table.Row id={rule.key}>
                                                            <Table.Cell className="font-medium text-primary">{rule.sapObject}</Table.Cell>
                                                            <Table.Cell>{rule.parameter}</Table.Cell>
                                                            <Table.Cell>{rule.operator}</Table.Cell>
                                                            <Table.Cell>{rule.expectedValue}</Table.Cell>
                                                        </Table.Row>
                                                    )}
                                                </Table.Body>
                                            </Table>
                                        )}
                                    </section>

                                    <section>
                                        <h4 className="mb-3 text-md font-semibold text-primary">Execution Findings</h4>
                                        {selected.openAlerts.length === 0 ? (
                                            <p className="text-sm text-tertiary">
                                                {selected.lastRunAt ? "No unresolved deviations — the control is operating effectively." : "This control has not been executed on this system yet."}
                                            </p>
                                        ) : (
                                            <Table aria-label="Unresolved deviation alerts">
                                                <Table.Header>
                                                    <Table.Head id="date" label="Alert Date" isRowHeader />
                                                    <Table.Head id="count" label="Deviations" />
                                                    <Table.Head id="status" label="Status" />
                                                    <Table.Head id="severity" label="Severity" />
                                                    <Table.Head id="open" />
                                                </Table.Header>
                                                <Table.Body items={selected.openAlerts}>
                                                    {(a) => (
                                                        <Table.Row id={a.id}>
                                                            <Table.Cell className="text-tertiary">{formatTimestamp(a.alertDate)}</Table.Cell>
                                                            <Table.Cell>{a.deviationCount}</Table.Cell>
                                                            <Table.Cell>
                                                                <Badge color={ALERT_STATUS_BADGE[a.status] ?? "gray"} size="sm">
                                                                    {a.status}
                                                                </Badge>
                                                            </Table.Cell>
                                                            <Table.Cell>
                                                                <Badge color={SEVERITY_BADGE[a.severity] ?? "gray"} size="sm">
                                                                    {a.severity}
                                                                </Badge>
                                                            </Table.Cell>
                                                            <Table.Cell>
                                                                <div className="flex justify-end">
                                                                    <Button color="link-color" size="sm" onClick={() => navigate(`/deviation-report/${a.id}`)}>
                                                                        Open
                                                                    </Button>
                                                                </div>
                                                            </Table.Cell>
                                                        </Table.Row>
                                                    )}
                                                </Table.Body>
                                            </Table>
                                        )}
                                    </section>

                                    <div className="flex justify-end gap-3">
                                        <Button color="secondary" onClick={() => navigate(`/system-control-config/${selected.id}`)}>
                                            View Run Logs
                                        </Button>
                                        <Button onClick={() => setSelected(null)}>Close</Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </div>
    );
};

const TONE_CLASS = { default: "text-primary", brand: "text-brand-secondary", success: "text-success-primary", error: "text-error-primary" } as const;

function StatCard({ label, value, note, tone = "default" }: { label: string; value: string | number; note: string; tone?: keyof typeof TONE_CLASS }) {
    return (
        <div className="flex flex-col gap-1 rounded-xl bg-primary p-5 ring-1 ring-secondary">
            <span className="text-sm text-tertiary">{label}</span>
            <span className={`text-display-sm font-semibold ${TONE_CLASS[tone]}`}>{value}</span>
            <span className="text-xs text-tertiary">{note}</span>
        </div>
    );
}
