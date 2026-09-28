import { type FC, useEffect, useState } from "react";
import { AlertTriangle, Link01, RefreshCw01, Server05, Settings01, Target04, Ticket01, Trash01, Users01 } from "@untitledui/icons";
import { useNavigate } from "react-router";
import { Breadcrumbs } from "@/components/application/breadcrumbs/breadcrumbs";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import type { BadgeColors } from "@/components/base/badges/badge-types";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import {
    type Control,
    type ReviewEntry,
    type RuleCheckStat,
    type SystemControlConfig,
    type SystemEntry,
    controlApi,
    deviationApi,
    reviewApi,
    systemConfigApi,
    systemControlConfigApi,
} from "@/lib/api-client";
import { listClosedReviews } from "@/pages/reviewer/review-report";

const TARGET_SCORE = 0.95;

type Priority = "High" | "Medium" | "Low" | "Info";
const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2, Info: 3 };
const PRIORITY_BADGE: Record<Priority, BadgeColors> = { High: "error", Medium: "warning", Low: "brand", Info: "gray" };

type Insight = {
    id: string;
    priority: Priority;
    icon: FC<{ className?: string }>;
    title: string;
    detail: string;
    items?: string[];
    impact?: string;
    action?: { label: string; href: string };
};

type Data = {
    totalChecks: number;
    passedChecks: number;
    rules: RuleCheckStat[];
    controls: Control[];
    mappings: SystemControlConfig[];
    systems: SystemEntry[];
    pending: ReviewEntry[];
    closed: ReviewEntry[];
};

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const pts = (n: number) => `+${(n * 100).toFixed(1)} pts`;

const OPERATOR_PHRASE: Record<string, string> = {
    EQUALS: "equal",
    NOT_EQUALS: "not equal",
    CONTAINS: "contain",
    NOT_CONTAINS: "not contain",
    GT: "be greater than",
    LT: "be less than",
    GTE: "be at least",
    LTE: "be at most",
};

function fixInstruction(r: RuleCheckStat): string {
    if (r.operator === "EXISTS") return `make ${r.sapObject}/${r.parameter} exist`;
    if (r.operator === "NOT_EXISTS") return `remove ${r.sapObject}/${r.parameter}`;
    return `set ${r.sapObject}/${r.parameter} to ${OPERATOR_PHRASE[r.operator] || r.operator.toLowerCase()} '${r.expectedValue}'`;
}

// Pure: turns live compliance data into prioritized, explainable tips. The
// score is passedChecks / totalChecks over ALL run history, so every tip is
// framed by what it changes in future runs - history itself never changes.
export function buildInsights(d: Data) {
    const activeMappings = d.mappings.filter((m) => m.enabled);
    const controlByCode = new Map(d.controls.map((c) => [c.code, c]));
    const mappingKey = (control: string, system: string, client: string) => `${control}|${system}|${client}`;
    const activeMappingKeys = new Set(activeMappings.map((m) => mappingKey(m.controlCode, m.systemCode, m.systemClient)));

    // A rule is "live" if it still belongs to its control and that control
    // still runs on that system - only those checks recur on the next run.
    const liveRules = d.rules.filter((r) => {
        const control = controlByCode.get(r.controlId);
        return (
            r.controlExists &&
            r.systemExists &&
            activeMappingKeys.has(mappingKey(r.controlId, r.systemId, r.client)) &&
            !!control?.rules.some((cr) => cr.sapObject === r.sapObject && cr.parameter === r.parameter)
        );
    });

    // Checks the next full run adds: every rule of every active mapping.
    const checksPerRun = activeMappings.reduce((n, m) => n + (d.controls.find((c) => c.id === m.controlId)?.rules.length ?? 0), 0);
    const passingPerRun = liveRules.filter((r) => r.lastPassed).length;

    const current = d.totalChecks ? d.passedChecks / d.totalChecks : 0;
    const afterRun = (passing: number) => (d.totalChecks + checksPerRun ? (d.passedChecks + passing) / (d.totalChecks + checksPerRun) : 0);
    const nextRunAsIs = afterRun(passingPerRun);
    const nextRunAllFixed = afterRun(checksPerRun);
    const perFixedCheck = d.totalChecks + checksPerRun ? 1 / (d.totalChecks + checksPerRun) : 0;
    // Clean runs k needed so (P + kR) / (T + kR) >= target.
    const cleanRunsToTarget =
        current >= TARGET_SCORE ? 0 : checksPerRun ? Math.ceil((TARGET_SCORE * d.totalChecks - d.passedChecks) / (checksPerRun * (1 - TARGET_SCORE))) : null;

    const insights: Insight[] = [];

    // 1. Systems the collector couldn't read - every such check is a failure.
    const unreachable = liveRules.filter((r) => r.lastUnreachable);
    const unreachableBySystem = new Map<string, RuleCheckStat[]>();
    unreachable.forEach((r) => {
        const key = `${r.systemId}/${r.client}`;
        unreachableBySystem.set(key, [...(unreachableBySystem.get(key) || []), r]);
    });
    unreachableBySystem.forEach((list, sys) => {
        insights.push({
            id: `unreachable-${sys}`,
            priority: "High",
            icon: Server05,
            title: `Restore data collection from ${sys}`,
            detail: `${list.length} check(s) on ${sys} couldn't read their value on the last run, and Xyra fails a check it can't verify. Test the connection and credentials, then re-run the affected controls.`,
            items: list.map((r) => `${r.controlId} — ${r.sapObject}/${r.parameter}: ${r.lastMessage}`),
            impact: `${pts(list.length * perFixedCheck)} on the next run`,
            action: { label: "Open System Configuration", href: "/configuration" },
        });
    });

    // 2. Real parameter deviations on reachable systems - the actual fixes.
    const deviating = liveRules
        .filter((r) => !r.lastPassed && !r.lastUnreachable)
        .sort((a, b) => ["HIGH", "MEDIUM", "LOW"].indexOf(a.controlSeverity) - ["HIGH", "MEDIUM", "LOW"].indexOf(b.controlSeverity) || b.failCount - a.failCount);
    deviating.forEach((r) => {
        const notFound = r.lastActualValue === null || r.lastActualValue === undefined;
        insights.push({
            id: `deviation-${r.controlId}-${r.systemId}-${r.client}-${r.sapObject}-${r.parameter}`,
            priority: r.controlSeverity === "HIGH" ? "High" : r.controlSeverity === "MEDIUM" ? "Medium" : "Low",
            icon: AlertTriangle,
            title: `${r.controlId}: ${fixInstruction(r)} on ${r.systemId}/${r.client}`,
            detail: notFound
                ? `The value wasn't found on the system at all. Check that ${r.sapObject}/${r.parameter} exists there, or correct the rule if the object or parameter name is wrong. Failed ${r.failCount} of ${r.checkCount} checks.`
                : `Currently '${r.lastActualValue}'. Remediate it in SAP, then re-run ${r.controlId}. Failed ${r.failCount} of ${r.checkCount} checks so far.`,
            impact: `${pts(perFixedCheck)} per run once fixed`,
            action: { label: "View Deviation Report", href: "/deviation-report" },
        });
    });

    // 3. Coverage gaps - nothing tested means nothing proven.
    const mappedControlIds = new Set(d.mappings.map((m) => m.controlId));
    const unmappedControls = d.controls.filter((c) => !mappedControlIds.has(c.id));
    if (unmappedControls.length) {
        insights.push({
            id: "unmapped-controls",
            priority: "Medium",
            icon: Link01,
            title: `Map ${unmappedControls.length} control(s) to a system`,
            detail: "These controls exist but aren't assigned to any system, so they never run and provide no compliance evidence.",
            items: unmappedControls.map((c) => `${c.code} — ${c.description}`),
            action: { label: "Open System Control Config", href: "/system-control-config" },
        });
    }
    const coveredSystems = new Set(d.mappings.map((m) => `${m.systemCode}/${m.systemClient}`));
    const uncoveredSystems = d.systems.filter((s) => !coveredSystems.has(`${s.sysId}/${s.client}`));
    if (uncoveredSystems.length) {
        insights.push({
            id: "uncovered-systems",
            priority: "Medium",
            icon: Target04,
            title: `${uncoveredSystems.length} system(s) have no controls running`,
            detail: "Every in-scope SAP system should be tested by at least one control. Map the relevant controls to these systems.",
            items: uncoveredSystems.map((s) => `${s.sysId}/${s.client}${s.organizationName ? ` — ${s.organizationName}` : ""}`),
            action: { label: "Open System Control Config", href: "/system-control-config" },
        });
    }
    const inactive = d.mappings.filter((m) => !m.enabled);
    if (inactive.length) {
        insights.push({
            id: "inactive-mappings",
            priority: "Low",
            icon: Settings01,
            title: `Reactivate or remove ${inactive.length} inactive mapping(s)`,
            detail: "Deactivated mappings don't run. Reactivate them if the system is still in scope, or delete them so coverage figures stay accurate.",
            items: inactive.map((m) => `${m.controlCode} on ${m.systemCode}/${m.systemClient}`),
            action: { label: "Open System Control Config", href: "/system-control-config" },
        });
    }
    const neverRun = activeMappings.filter((m) => !m.lastRunAt);
    if (neverRun.length) {
        insights.push({
            id: "never-run",
            priority: "Medium",
            icon: Target04,
            title: `Run ${neverRun.length} mapping(s) that have never executed`,
            detail: "These mappings are active but have no evidence yet. Use Run Now instead of waiting for the next scheduled run.",
            items: neverRun.map((m) => `${m.controlCode} on ${m.systemCode}/${m.systemClient}`),
            action: { label: "Open System Control Config", href: "/system-control-config" },
        });
    }
    const ruleless = d.controls.filter((c) => c.rules.length === 0);
    if (ruleless.length) {
        insights.push({
            id: "ruleless",
            priority: "Medium",
            icon: Settings01,
            title: `Add rules to ${ruleless.length} control(s)`,
            detail: "A control without rules runs but checks nothing, so it can never demonstrate compliance.",
            items: ruleless.map((c) => `${c.code} — ${c.description}`),
            action: { label: "Open Controls", href: "/controls" },
        });
    }

    // 4. Review workflow - evidence of timely review is part of SOX too.
    const overdue = d.pending.filter((r) => r.isOverdue);
    const escalation = d.pending.filter((r) => r.escalationDue);
    if (overdue.length) {
        insights.push({
            id: "overdue-reviews",
            priority: escalation.length ? "High" : "Medium",
            icon: Users01,
            title: `Clear ${overdue.length} overdue deviation review(s)`,
            detail: `${overdue.length} of ${d.pending.length} pending reviews are past their SLA${escalation.length ? `, and ${escalation.length} are already due for escalation` : ""}. Late sign-off is an audit finding in its own right. Ask the Level 1/Level 2 reviewers to work their queues.`,
        });
    }
    const openTickets = d.closed.filter((r) => r.ticketNumber && !r.ticketResolved);
    if (openTickets.length) {
        insights.push({
            id: "open-tickets",
            priority: "Medium",
            icon: Ticket01,
            title: `Follow up on ${openTickets.length} open remediation ticket(s)`,
            detail: "These deviations were rejected for remediation but their tickets are still open. Until they're fixed in SAP, the same checks keep failing on every run.",
            items: openTickets.slice(0, 8).map((r) => `${r.ticketNumber} — ${r.controlId} on ${r.systemId}: ${r.parameter}`),
        });
    }

    // 5. Context: failures from deleted controls are permanent history.
    const deletedRules = d.rules.filter((r) => !r.controlExists);
    const deletedFails = deletedRules.reduce((n, r) => n + r.failCount, 0);
    const totalFails = d.totalChecks - d.passedChecks;
    if (deletedFails) {
        // Backend labels a deleted control whose code couldn't be recovered "Deleted control".
        const codes = [...new Set(deletedRules.map((r) => r.controlId).filter((c) => c !== "Deleted control"))];
        const unnamed = deletedRules.some((r) => r.controlId === "Deleted control");
        const names = [...codes, ...(unnamed ? ["an unnamed deleted control"] : [])].join(", ");
        insights.push({
            id: "deleted-history",
            priority: "Info",
            icon: Trash01,
            title: `${deletedFails} of ${totalFails} failed checks come from deleted controls`,
            detail: `They stay in the score as compliance evidence and can't be re-tested (${names}). The score recovers only as new passing checks accumulate, so fix the live issues above first.`,
        });
    }

    insights.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
    return { current, nextRunAsIs, nextRunAllFixed, cleanRunsToTarget, checksPerRun, insights };
}

export const AiInsightsPage = () => {
    const navigate = useNavigate();
    const [data, setData] = useState<Data | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = () => {
        setIsLoading(true);
        Promise.all([
            deviationApi.getComplianceInsights(),
            controlApi.list(),
            systemControlConfigApi.list(),
            systemConfigApi.list(),
            reviewApi.listLevel1Queue(),
            reviewApi.listLevel2Queue(),
            listClosedReviews(),
        ])
            .then(([ins, ctl, map, sys, l1, l2, closed]) => {
                const failed = [ins, ctl, map, sys, l1, l2].find((r) => !r.success);
                if (failed) {
                    setError(failed.message || "Could not load compliance data.");
                    return;
                }
                setError(null);
                setData({
                    totalChecks: ins.totalChecks,
                    passedChecks: ins.passedChecks,
                    rules: ins.rules,
                    controls: ctl.controls,
                    mappings: map.configs,
                    systems: sys.systems,
                    pending: [...l1.reviews, ...l2.reviews],
                    closed,
                });
            })
            .catch(() => setError("Could not reach the server. Is xyra-core running?"))
            .finally(() => setIsLoading(false));
    };

    useEffect(load, []);

    if (isLoading) {
        return (
            <div className="flex min-h-100 items-center justify-center">
                <LoadingIndicator type="line-simple" size="md" label="Analyzing your compliance data…" />
            </div>
        );
    }

    const result = data ? buildInsights(data) : null;

    return (
        <div className="flex flex-col gap-6">
            <Breadcrumbs items={[{ label: "AI Insights" }]} />
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <h1 className="text-display-xs font-semibold text-primary">AI Insights</h1>
                    <p className="text-md text-tertiary">How to raise your compliance score, prioritized from your live control, run and review data.</p>
                </div>
                <Button color="secondary" iconLeading={RefreshCw01} onClick={load}>
                    Refresh
                </Button>
            </div>

            {error && <p className="rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}

            {result && data && (
                <>
                    {/* SCORE OUTLOOK */}
                    <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                        <h2 className="text-lg font-semibold text-primary">Compliance Score Outlook</h2>
                        <p className="text-sm text-tertiary">
                            The score is the share of passed rule checks across all run history ({data.passedChecks} of {data.totalChecks}). Each full run adds{" "}
                            {result.checksPerRun} new check(s).
                        </p>
                        <div className="mt-5 grid grid-cols-2 gap-6 lg:grid-cols-4">
                            <Outlook label="Current Score" value={pct(result.current)} tone={result.current >= TARGET_SCORE ? "success" : "error"} />
                            <Outlook label="Next Run, Nothing Changed" value={pct(result.nextRunAsIs)} tone="default" />
                            <Outlook label="Next Run, All Tips Applied" value={pct(result.nextRunAllFixed)} tone="success" />
                            <Outlook
                                label={`Clean Runs to Reach ${pct(TARGET_SCORE).replace(".0", "")}`}
                                value={result.cleanRunsToTarget === null ? "—" : result.cleanRunsToTarget === 0 ? "Reached" : String(result.cleanRunsToTarget)}
                                tone="brand"
                            />
                        </div>
                    </div>

                    {/* RECOMMENDATIONS */}
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-semibold text-primary">Recommendations</h2>
                            <Badge color="gray" size="sm">
                                {result.insights.length}
                            </Badge>
                        </div>
                        {result.insights.length === 0 ? (
                            <p className="rounded-xl bg-primary p-6 text-sm text-tertiary ring-1 ring-secondary">
                                No issues found. Every active check passed on its last run and coverage is complete.
                            </p>
                        ) : (
                            result.insights.map((ins) => (
                                <div key={ins.id} className="flex gap-4 rounded-xl bg-primary p-5 ring-1 ring-secondary">
                                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-fg-secondary">
                                        <ins.icon className="size-5" />
                                    </div>
                                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge color={PRIORITY_BADGE[ins.priority]} size="sm">
                                                {ins.priority === "Info" ? "Context" : `${ins.priority} priority`}
                                            </Badge>
                                            {ins.impact && (
                                                <Badge color="success" size="sm">
                                                    {ins.impact}
                                                </Badge>
                                            )}
                                        </div>
                                        <h3 className="text-md font-semibold text-primary">{ins.title}</h3>
                                        <p className="text-sm text-tertiary">{ins.detail}</p>
                                        {ins.items && ins.items.length > 0 && (
                                            <ul className="list-disc pl-5 text-sm text-secondary">
                                                {ins.items.map((item) => (
                                                    <li key={item}>{item}</li>
                                                ))}
                                            </ul>
                                        )}
                                        {ins.action && (
                                            <div>
                                                <Button color="link-color" size="sm" onClick={() => navigate(ins.action!.href)}>
                                                    {ins.action.label} →
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

const OUTLOOK_TONE = { default: "text-primary", brand: "text-brand-secondary", success: "text-success-primary", error: "text-error-primary" } as const;

function Outlook({ label, value, tone }: { label: string; value: string; tone: keyof typeof OUTLOOK_TONE }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-sm text-tertiary">{label}</span>
            <span className={`text-display-xs font-semibold ${OUTLOOK_TONE[tone]}`}>{value}</span>
        </div>
    );
}
