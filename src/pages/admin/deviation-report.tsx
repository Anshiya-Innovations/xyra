import { useEffect, useMemo, useState } from "react";
import { RefreshCw01, SearchLg } from "@untitledui/icons";
import { useNavigate } from "react-router";
import type { DateValue } from "react-aria-components";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Select } from "@/components/base/select/select";
import { Table, TableCard } from "@/components/application/table/table";
import { DateRangePicker } from "@/components/application/date-picker/date-range-picker";
import { PaginationPageDefault } from "@/components/application/pagination/pagination";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Breadcrumbs } from "@/components/application/breadcrumbs/breadcrumbs";
import { type AlertHeader, type DeviationKpi, type Organization, type SystemEntry, controlApi, deviationApi, organizationApi, systemConfigApi } from "@/lib/api-client";
import { groupByDay, topByControl } from "@/lib/deviation-charts";

const PAGE_SIZE = 10;
const BRAND = "#533bff";

// Status colors are reserved semantics, not arbitrary categorical hues -
// same red/amber/green as Untitled UI's own error/warning/success tokens
// (theme.css's --color-bg-error-solid etc.), not picked freely.
const STATUS_COLORS = { Open: "#dc2626", "In Progress": "#ca8a04", Resolved: "#16a34a" } as const;
const SEVERITY_BADGE_COLOR: Record<string, "error" | "warning" | "success" | "gray"> = {
    critical: "error",
    high: "error",
    medium: "warning",
    low: "success",
};
const STATUS_BADGE_COLOR: Record<string, "error" | "warning" | "success"> = { Open: "error", "In Progress": "warning", Resolved: "success" };

type FilterOption = { id: string; label: string };
const ALL: FilterOption = { id: "All", label: "All" };

type Filters = {
    organizationId: string;
    sector: string;
    region: string;
    platform: string;
    systemId: string;
    client: string;
    controlId: string;
    status: string;
    startDate: string;
    endDate: string;
};

const DEFAULT_FILTERS: Filters = {
    organizationId: "All",
    sector: "All",
    region: "All",
    platform: "All",
    systemId: "All",
    client: "All",
    controlId: "All",
    status: "All",
    startDate: "",
    endDate: "",
};

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

export const DeviationReportPage = () => {
    const navigate = useNavigate();
    const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
    const [headers, setHeaders] = useState<AlertHeader[]>([]);
    const [kpi, setKpi] = useState<DeviationKpi>({ totalIncidents: 0, openItems: 0, resolvedItems: 0, auditedControls: 0, complianceRate: "0%" });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [allSystems, setAllSystems] = useState<SystemEntry[]>([]);
    const [controlOptions, setControlOptions] = useState<FilterOption[]>([]);
    const [dateRange, setDateRange] = useState<{ start: DateValue; end: DateValue } | null>(null);
    const [page, setPage] = useState(1);

    // Loaded once - Organization narrows the System select (same cascade as
    // ControlEditor); Region/Platform/Sector/Client are independent facets
    // derived from the (possibly org-narrowed) systems list, not further
    // cascaded - matches xyra-web's DeviationReport.controller.js exactly.
    useEffect(() => {
        organizationApi.list().then((res) => res.success && setOrganizations(res.organizations)).catch(() => {});
        systemConfigApi.list().then((res) => res.success && setAllSystems(res.systems)).catch(() => {});
        controlApi.list().then((res) => res.success && setControlOptions(res.controls.map((c) => ({ id: c.code, label: `${c.code} - ${c.description}` })))).catch(() => {});
    }, []);

    const scopedSystems = useMemo(
        () => (filters.organizationId === "All" ? allSystems : allSystems.filter((s) => s.organizationId === filters.organizationId)),
        [allSystems, filters.organizationId],
    );

    const runQuery = () => {
        setIsLoading(true);
        deviationApi
            .list(filters)
            .then((res) => {
                if (!res.success) {
                    setError(res.message || "Could not load the deviation report.");
                    return;
                }
                setError(null);
                setHeaders(res.headers);
                setKpi(res.kpi);
                setPage(1);
            })
            .catch(() => setError("Could not reach the server. Is xyra-core running?"))
            .finally(() => setIsLoading(false));
    };

    useEffect(runQuery, []); // eslint-disable-line react-hooks/exhaustive-deps

    const onOrganizationChange = (organizationId: string) => {
        setFilters({ ...DEFAULT_FILTERS, organizationId });
    };

    const onReset = () => {
        setFilters(DEFAULT_FILTERS);
        setDateRange(null);
    };

    const set = <K extends keyof Filters>(key: K) => (value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));

    // DateRangePicker works in @internationalized/date CalendarDate objects;
    // the backend (and Filters) just want plain "yyyy-MM-dd" strings -
    // CalendarDate#toString() already produces that format exactly.
    const onDateRangeChange = (range: { start: DateValue; end: DateValue } | null) => {
        setDateRange(range);
        setFilters((f) => ({ ...f, startDate: range ? range.start.toString() : "", endDate: range ? range.end.toString() : "" }));
    };

    // Backend's toDisplayStatus already collapses incidentStatus into exactly
    // 3 mutually-exclusive buckets - using those directly (instead of
    // xyra-web's overlapping "Open" + "Pending" slices, where Open is a
    // subset of Pending) keeps the donut's segments summing to the whole.
    const statusCounts = useMemo(() => {
        const counts = { Open: 0, "In Progress": 0, Resolved: 0 };
        headers.forEach((h) => {
            counts[h.status] = (counts[h.status] || 0) + 1;
        });
        return counts;
    }, [headers]);

    const severityCounts = useMemo(() => {
        const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
        headers.forEach((h) => {
            const key = (h.severity || "").toLowerCase();
            if (key in counts) counts[key] += 1;
        });
        return counts;
    }, [headers]);

    const donutData = (Object.keys(statusCounts) as Array<keyof typeof statusCounts>)
        .map((status) => ({ name: status, value: statusCounts[status] }))
        .filter((d) => d.value > 0);

    const trendData = useMemo(() => groupByDay(headers), [headers]);
    const byControlData = useMemo(() => topByControl(headers), [headers]);

    const totalPages = Math.max(1, Math.ceil(headers.length / PAGE_SIZE));
    const pagedHeaders = headers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return (
        <div className="flex flex-col gap-6">
            <Breadcrumbs items={[{ label: "Control Management" }, { label: "Deviation Report" }]} />
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <h1 className="text-display-xs font-semibold text-primary">Deviation Report</h1>
                    <p className="text-md text-tertiary">Detailed analysis of control deviations.</p>
                </div>
                <Button color="secondary" iconLeading={RefreshCw01} onClick={runQuery}>
                    Refresh
                </Button>
            </div>

            {error && <p className="rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}

            {/* FILTERS */}
            <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-primary">Filter Criteria</h2>
                    <Button color="link-gray" size="sm" onClick={onReset}>
                        Reset
                    </Button>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                    <Select label="Organization" selectedKey={filters.organizationId} onSelectionChange={(k) => onOrganizationChange(k as string)} items={[ALL, ...organizations.map((o) => ({ id: o.id, label: `${o.orgCode} - ${o.name}` }))]}>
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <Select label="System" selectedKey={filters.systemId} onSelectionChange={(k) => set("systemId")(k as string)} items={[ALL, ...scopedSystems.map((s) => ({ id: s.sysId, label: s.sysId }))]}>
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <Select label="Client" selectedKey={filters.client} onSelectionChange={(k) => set("client")(k as string)} items={[ALL, ...distinctOptions(scopedSystems, (s) => s.client)]}>
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <Select label="Region" selectedKey={filters.region} onSelectionChange={(k) => set("region")(k as string)} items={[ALL, ...distinctOptions(scopedSystems, (s) => s.region)]}>
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <Select label="Platform" selectedKey={filters.platform} onSelectionChange={(k) => set("platform")(k as string)} items={[ALL, ...distinctOptions(scopedSystems, (s) => s.platform)]}>
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <Select label="Sector" selectedKey={filters.sector} onSelectionChange={(k) => set("sector")(k as string)} items={[ALL, ...distinctOptions(scopedSystems, (s) => s.sector)]}>
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <Select label="Control" selectedKey={filters.controlId} onSelectionChange={(k) => set("controlId")(k as string)} items={[ALL, ...controlOptions]}>
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <Select label="Incident Status" selectedKey={filters.status} onSelectionChange={(k) => set("status")(k as string)} items={[ALL, { id: "Open", label: "Open" }, { id: "In Progress", label: "In Progress" }, { id: "Resolved", label: "Resolved" }]}>
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <div className="col-span-2 flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-secondary">Date Range</span>
                        <DateRangePicker value={dateRange} onChange={onDateRangeChange} onApply={runQuery} />
                    </div>
                </div>
                <div className="mt-4 flex justify-end">
                    <Button iconLeading={SearchLg} onClick={runQuery}>
                        Search
                    </Button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex min-h-60 items-center justify-center">
                    <LoadingIndicator type="line-simple" size="md" label="Loading deviation report…" />
                </div>
            ) : (
                <>
                    {/* KPI CARDS */}
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                        <KpiCard label="Total Incidents" value={kpi.totalIncidents} hint="Control Deviations" state="error" />
                        <KpiCard label="Open Items" value={kpi.openItems} hint="Requires Remediation" state="warning" />
                        <KpiCard label="Resolved Items" value={kpi.resolvedItems} hint="Remediated & Closed" state="success" />
                        <KpiCard label="Audited Controls" value={kpi.auditedControls} hint={`Resolution Rate: ${kpi.complianceRate}`} state="brand" />
                    </div>

                    {headers.length === 0 ? (
                        <div className="rounded-xl bg-primary p-8 ring-1 ring-secondary">
                            <EmptyState size="sm">
                                <EmptyState.Header>
                                    <EmptyState.FeaturedIcon icon={SearchLg} color="success" theme="light" />
                                </EmptyState.Header>
                                <EmptyState.Content>
                                    <EmptyState.Title>No deviations found</EmptyState.Title>
                                    <EmptyState.Description>No control deviations match your selected filter criteria.</EmptyState.Description>
                                </EmptyState.Content>
                            </EmptyState>
                        </div>
                    ) : (
                        <>
                            {/* CHART + SEVERITY SUMMARY */}
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                                    <h2 className="text-lg font-semibold text-primary">Deviation Status Distribution</h2>
                                    <p className="text-sm text-tertiary">Categorized incident breakdown</p>
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
                                </div>

                                <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                                    <h2 className="text-lg font-semibold text-primary">Alert Summary</h2>
                                    <p className="text-sm text-tertiary">Severity breakdown of detected deviations</p>
                                    <div className="mt-4 flex flex-col gap-3">
                                        {(["critical", "high", "medium", "low"] as const).map((key) => (
                                            <div key={key} className="flex items-center justify-between border-b border-secondary pb-2 last:border-0">
                                                <span className="text-sm font-medium text-primary capitalize">{key}</span>
                                                <Badge color={SEVERITY_BADGE_COLOR[key]} size="md">
                                                    {severityCounts[key]}
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* TREND + BY-CONTROL CHARTS */}
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                                    <h2 className="text-lg font-semibold text-primary">Incident Trend</h2>
                                    <p className="text-sm text-tertiary">Deviations detected per day</p>
                                    <div className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={trendData} margin={{ left: -20 }}>
                                                <CartesianGrid vertical={false} stroke="var(--color-border-secondary)" />
                                                <XAxis dataKey="day" tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} axisLine={false} tickLine={false} />
                                                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} axisLine={false} tickLine={false} />
                                                <RechartsTooltip />
                                                <Line type="monotone" dataKey="count" name="Incidents" stroke={BRAND} strokeWidth={2} dot={{ r: 3, fill: BRAND }} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                                    <h2 className="text-lg font-semibold text-primary">Deviations by Control</h2>
                                    <p className="text-sm text-tertiary">Top controls by deviation count</p>
                                    <div className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={byControlData} margin={{ left: -20 }}>
                                                <CartesianGrid vertical={false} stroke="var(--color-border-secondary)" />
                                                <XAxis dataKey="controlId" tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} axisLine={false} tickLine={false} />
                                                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "var(--color-text-tertiary)" }} axisLine={false} tickLine={false} />
                                                <RechartsTooltip cursor={{ fill: "var(--color-bg-secondary)" }} />
                                                <Bar dataKey="count" name="Deviations" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={40} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            {/* ALERT TABLE */}
                            <TableCard.Root>
                                <TableCard.Header title="Deviation Alerts" badge={<Badge color="gray" size="sm">{headers.length}</Badge>} />
                                <Table aria-label="Deviation alerts">
                                    <Table.Header>
                                        <Table.Head id="control" label="Control ID" isRowHeader />
                                        <Table.Head id="system" label="System" />
                                        <Table.Head id="client" label="Client" />
                                        <Table.Head id="status" label="Incident Status" />
                                        <Table.Head id="count" label="Deviation Count" />
                                        <Table.Head id="date" label="Alert Date" />
                                    </Table.Header>
                                    <Table.Body items={pagedHeaders}>
                                        {(h) => (
                                            <Table.Row id={h.id}>
                                                <Table.Cell>
                                                    <button
                                                        type="button"
                                                        className="cursor-pointer font-medium text-brand-secondary hover:underline"
                                                        onClick={() => navigate(`/deviation-report/${h.id}`)}
                                                    >
                                                        {h.controlId}
                                                    </button>
                                                </Table.Cell>
                                                <Table.Cell>{h.systemId}</Table.Cell>
                                                <Table.Cell>{h.client}</Table.Cell>
                                                <Table.Cell>
                                                    <Badge color={STATUS_BADGE_COLOR[h.status]} size="sm">
                                                        {h.status}
                                                    </Badge>
                                                </Table.Cell>
                                                <Table.Cell>{h.deviationCount} deviations</Table.Cell>
                                                <Table.Cell className="text-tertiary">{h.alertDate ? new Date(h.alertDate).toLocaleString() : "—"}</Table.Cell>
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
                        </>
                    )}
                </>
            )}
        </div>
    );
};

function KpiCard({ label, value, hint, state }: { label: string; value: number | string; hint: string; state: "error" | "warning" | "success" | "brand" }) {
    const stateColor = { error: "error", warning: "warning", success: "success", brand: "brand" } as const;
    return (
        <div className="flex flex-col gap-2 rounded-xl bg-primary p-5 ring-1 ring-secondary">
            <span className="text-sm text-tertiary">{label}</span>
            <span className="text-display-sm font-semibold text-primary">{value}</span>
            <Badge color={stateColor[state]} size="sm">
                {hint}
            </Badge>
        </div>
    );
}
