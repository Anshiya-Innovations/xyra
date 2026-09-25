import { type FC, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle, Server01, Shield01 } from "@untitledui/icons";
import { useNavigate } from "react-router";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { Badge } from "@/components/base/badges/badges";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Table, TableCard } from "@/components/application/table/table";
import { type AlertHeader, type Control, type DeviationKpi, type SystemEntry, controlApi, deviationApi, reviewApi, systemConfigApi } from "@/lib/api-client";
import { getSession } from "@/lib/session";

const SEVERITY_COLORS: Record<string, string> = { LOW: "#16a34a", MEDIUM: "#ca8a04", HIGH: "#dc2626" };
const SEVERITY_BADGE_COLOR: Record<string, "error" | "warning" | "success"> = { HIGH: "error", MEDIUM: "warning", LOW: "success" };
const STATUS_BADGE_COLOR: Record<string, "error" | "warning" | "success"> = { Open: "error", "In Progress": "warning", Resolved: "success" };
const titleCase = (s: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");

const EMPTY_FILTERS = {
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

const DEFAULT_KPI: DeviationKpi = { totalIncidents: 0, openItems: 0, resolvedItems: 0, auditedControls: 0, complianceRate: "0%" };

export const DashboardPage = () => {
    const navigate = useNavigate();
    const session = getSession();

    const [controls, setControls] = useState<Control[]>([]);
    const [systems, setSystems] = useState<SystemEntry[]>([]);
    const [deviations, setDeviations] = useState<AlertHeader[]>([]);
    const [kpi, setKpi] = useState<DeviationKpi>(DEFAULT_KPI);
    const [pipeline, setPipeline] = useState({ level1Pending: 0, level2Pending: 0, ticketsCreated: 0, ticketsInProgress: 0, ticketsResolved: 0 });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setIsLoading(true);
        Promise.all([
            controlApi.list(),
            systemConfigApi.list(),
            deviationApi.list(EMPTY_FILTERS),
            reviewApi.listLevel1Queue(),
            reviewApi.listLevel2Queue(),
            reviewApi.listLevel1History(),
            reviewApi.listLevel2History(),
        ])
            .then(([controlsRes, systemsRes, deviationsRes, l1qRes, l2qRes, l1hRes, l2hRes]) => {
                if (controlsRes.success) setControls(controlsRes.controls);
                if (systemsRes.success) setSystems(systemsRes.systems);
                if (deviationsRes.success) {
                    setDeviations(deviationsRes.headers);
                    setKpi(deviationsRes.kpi);
                }
                // Same "Review Pipeline" widget as xyra-web's Admin dashboard
                // (AdminClient.js's loadDashboard/countTickets) - queue length
                // per level, plus how many history rows (either level) ever got
                // a remediation ticket, split into in-progress vs resolved.
                // ticketResolved is set by lib/ticketing/jiraSync's poller once
                // Jira reports the issue done (STUB tickets never resolve) - a
                // created ticket that isn't resolved yet is "in progress" by
                // definition, no separate status enum needed for that split.
                type TicketRow = { ticketNumber: string; ticketResolved: boolean };
                const countCreated = (rows: TicketRow[]) => rows.filter((r) => r.ticketNumber).length;
                const countInProgress = (rows: TicketRow[]) => rows.filter((r) => r.ticketNumber && !r.ticketResolved).length;
                const countResolved = (rows: TicketRow[]) => rows.filter((r) => r.ticketResolved).length;
                setPipeline({
                    level1Pending: l1qRes.success ? l1qRes.reviews.length : 0,
                    level2Pending: l2qRes.success ? l2qRes.reviews.length : 0,
                    ticketsCreated: (l1hRes.success ? countCreated(l1hRes.reviews) : 0) + (l2hRes.success ? countCreated(l2hRes.reviews) : 0),
                    ticketsInProgress: (l1hRes.success ? countInProgress(l1hRes.reviews) : 0) + (l2hRes.success ? countInProgress(l2hRes.reviews) : 0),
                    ticketsResolved: (l1hRes.success ? countResolved(l1hRes.reviews) : 0) + (l2hRes.success ? countResolved(l2hRes.reviews) : 0),
                });
            })
            .catch(() => setError("Could not reach the server. Is xyra-core running?"))
            .finally(() => setIsLoading(false));
    }, []);

    const activeControls = controls.filter((c) => c.enabled).length;

    const severityData = useMemo(() => {
        const counts = { LOW: 0, MEDIUM: 0, HIGH: 0 };
        controls.forEach((c) => {
            counts[c.severity] = (counts[c.severity] || 0) + 1;
        });
        return (Object.keys(counts) as Array<keyof typeof counts>).map((k) => ({ name: titleCase(k), key: k, value: counts[k] })).filter((d) => d.value > 0);
    }, [controls]);

    const pipelineRows = useMemo(() => {
        const rows = [
            { label: "Level 1 Pending", value: pipeline.level1Pending, color: "#dc2626" },
            { label: "Level 2 Pending", value: pipeline.level2Pending, color: "#ca8a04" },
            { label: "Tickets Created", value: pipeline.ticketsCreated, color: "#64748b" },
            { label: "Tickets In Progress", value: pipeline.ticketsInProgress, color: "#2563eb" },
            { label: "Tickets Resolved", value: pipeline.ticketsResolved, color: "#16a34a" },
        ];
        const max = Math.max(1, ...rows.map((r) => r.value));
        return rows.map((r) => ({ ...r, pct: Math.round((r.value / max) * 100) }));
    }, [pipeline]);

    const recentDeviations = useMemo(
        () => [...deviations].sort((a, b) => (b.alertDate || "").localeCompare(a.alertDate || "")).slice(0, 5),
        [deviations],
    );

    if (isLoading) {
        return (
            <div className="flex min-h-100 items-center justify-center">
                <LoadingIndicator type="line-simple" size="md" label="Loading dashboard…" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                    <h1 className="text-display-xs font-semibold text-primary">Welcome back{session ? `, ${session.name}` : ""}</h1>
                    {session && <Badge color="brand" size="sm">{session.role}</Badge>}
                </div>
                <p className="text-md text-tertiary">Continuous Control Monitoring overview for your organization.</p>
            </div>

            {error && <p className="rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}

            {/* METRIC CARDS */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <MetricCard label="Open Deviations" value={kpi.openItems} icon={AlertTriangle} color="error" />
                <MetricCard label="Compliance Rate" value={kpi.complianceRate} icon={CheckCircle} color="success" />
                <MetricCard label="Systems Monitored" value={systems.length} icon={Server01} color="brand" />
                <MetricCard label="Active / Total Controls" value={`${activeControls}/${controls.length}`} icon={Shield01} color="brand" />
            </div>

            {/* SEVERITY DISTRIBUTION + DEVIATION SUMMARY + REVIEW PIPELINE */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                    <h2 className="text-lg font-semibold text-primary">Control Severity Distribution</h2>
                    <p className="text-sm text-tertiary">How your controls are weighted</p>
                    <div className="mt-2 h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={severityData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2} stroke="none">
                                    {severityData.map((d) => (
                                        <Cell key={d.key} fill={SEVERITY_COLORS[d.key]} />
                                    ))}
                                </Pie>
                                <RechartsTooltip />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                    <h2 className="text-lg font-semibold text-primary">Deviation Summary</h2>
                    <p className="text-sm text-tertiary">Tenant-wide incident totals</p>
                    <div className="mt-4 flex flex-col gap-3">
                        <SummaryRow label="Total Incidents" value={kpi.totalIncidents} color="error" />
                        <SummaryRow label="Open Items" value={kpi.openItems} color="warning" />
                        <SummaryRow label="Resolved Items" value={kpi.resolvedItems} color="success" />
                        <SummaryRow label="Audited Controls" value={kpi.auditedControls} color="gray" />
                        <SummaryRow label="Compliance Rate" value={kpi.complianceRate} color="success" last />
                    </div>
                </div>

                <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                    <h2 className="text-lg font-semibold text-primary">Review Pipeline</h2>
                    <p className="text-sm text-tertiary">Level 1/2 review queues &amp; remediation tickets</p>
                    <div className="mt-5 flex flex-col gap-4">
                        {pipelineRows.map((row) => (
                            <div key={row.label} className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="font-medium text-primary">{row.label}</span>
                                    <span className="font-semibold text-primary">{row.value}</span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                                    <div className="h-full rounded-full transition-all" style={{ width: `${row.pct}%`, backgroundColor: row.color }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* RECENT DEVIATIONS */}
            <TableCard.Root>
                <TableCard.Header title="Recent Deviations" description="The 5 most recent alerts across every control" />
                {recentDeviations.length === 0 ? (
                    <p className="p-8 text-center text-sm text-tertiary">No deviations recorded yet.</p>
                ) : (
                    <Table aria-label="Recent deviations">
                        <Table.Header>
                            <Table.Head id="control" label="Control ID" isRowHeader />
                            <Table.Head id="system" label="System" />
                            <Table.Head id="severity" label="Severity" />
                            <Table.Head id="status" label="Status" />
                            <Table.Head id="date" label="Alert Date" />
                        </Table.Header>
                        <Table.Body items={recentDeviations}>
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
                                    <Table.Cell>
                                        <Badge color={SEVERITY_BADGE_COLOR[h.severity.toUpperCase()] ?? "gray"} size="sm">
                                            {h.severity}
                                        </Badge>
                                    </Table.Cell>
                                    <Table.Cell>
                                        <Badge color={STATUS_BADGE_COLOR[h.status]} size="sm">
                                            {h.status}
                                        </Badge>
                                    </Table.Cell>
                                    <Table.Cell className="text-tertiary">{h.alertDate ? new Date(h.alertDate).toLocaleString() : "—"}</Table.Cell>
                                </Table.Row>
                            )}
                        </Table.Body>
                    </Table>
                )}
            </TableCard.Root>
        </div>
    );
};

function MetricCard({
    label,
    value,
    icon,
    color,
}: {
    label: string;
    value: number | string;
    icon: FC<{ className?: string }>;
    color: "brand" | "success" | "error" | "warning";
}) {
    return (
        <div className="flex flex-col gap-4 rounded-xl bg-primary p-5 ring-1 ring-secondary">
            <FeaturedIcon icon={icon} color={color} theme="light" size="md" />
            <div className="flex flex-col gap-0.5">
                <span className="text-display-xs font-semibold text-primary">{value}</span>
                <span className="text-sm text-tertiary">{label}</span>
            </div>
        </div>
    );
}

function SummaryRow({
    label,
    value,
    color,
    last,
}: {
    label: string;
    value: number | string;
    color: "error" | "warning" | "success" | "gray";
    last?: boolean;
}) {
    return (
        <div className={`flex items-center justify-between pb-2 ${last ? "" : "border-b border-secondary"}`}>
            <span className="text-sm font-medium text-primary">{label}</span>
            <Badge color={color} size="md">
                {value}
            </Badge>
        </div>
    );
}
