import { ArrowLeft } from "@untitledui/icons";
import { Breadcrumbs } from "@/components/application/breadcrumbs/breadcrumbs";
import type { BadgeColors } from "@/components/base/badges/badge-types";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { type ReviewEntry, reviewApi } from "@/lib/api-client";
import { AlertContext, Field, formatTimestamp } from "./alert-context";

const SEVERITY_BADGE_COLOR: Record<string, BadgeColors> = { critical: "error", high: "error", medium: "warning", low: "success" };
export const badgeColorFor = (status: string) => SEVERITY_BADGE_COLOR[(status || "").toLowerCase()] ?? "gray";
export const DECISION_BADGE_COLOR: Record<string, BadgeColors> = { APPROVE: "success", REMEDIATE: "error" };
export const DECISION_LABEL: Record<string, string> = { APPROVE: "Approved", REMEDIATE: "Rejected" };

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

// Human SLA wording from the backend's slaDeadline (already business-day
// adjusted): "Due in 3 days" / "Due in 5 hours" / "Overdue by 2 days". Amber
// once less than a day is left. `title` is the exact deadline for a tooltip.
export function slaLabel(review: Pick<ReviewEntry, "slaDeadline" | "isOverdue">, now = Date.now()): { text: string; color: BadgeColors; title: string } {
    if (!review.slaDeadline) return { text: "—", color: "gray", title: "No active SLA" };
    const deadline = new Date(review.slaDeadline).getTime();
    const diff = deadline - now;
    const title = `SLA deadline: ${new Date(deadline).toLocaleString()}`;
    const span = Math.abs(diff);
    const amount = span < DAY ? plural(Math.max(1, Math.floor(span / HOUR)), "hour") : plural(Math.floor(span / DAY), "day");
    if (diff < 0 || review.isOverdue) return { text: `Overdue by ${amount}`, color: "error", title };
    return { text: `Due in ${amount}`, color: diff < DAY ? "warning" : "success", title };
}

// Filter buckets matching slaLabel's colors exactly.
export const SLA_BUCKETS = ["Overdue", "Due within 24h", "On track"] as const;
export function slaBucket(review: Pick<ReviewEntry, "slaDeadline" | "isOverdue">): (typeof SLA_BUCKETS)[number] | null {
    const { color } = slaLabel(review);
    return color === "error" ? "Overdue" : color === "warning" ? "Due within 24h" : color === "success" ? "On track" : null;
}

export function SlaBadge({ review }: { review: Pick<ReviewEntry, "slaDeadline" | "isOverdue"> }) {
    const sla = slaLabel(review);
    return (
        <span title={sla.title}>
            <Badge color={sla.color} size="sm">
                {sla.text}
            </Badge>
        </span>
    );
}

// Every closed review is terminal at whichever level actually decided it -
// Level 2 rows always have a terminal reviewer2Status (listLevel2History's own
// predicate); Level 1-only rows (rejected before ever reaching Level 2) are
// terminal at reviewer1Status instead.
export function terminalStatus(review: ReviewEntry): ReviewEntry["reviewer1Status"] {
    return review.reviewer2Status !== "NEW" ? review.reviewer2Status : review.reviewer1Status;
}
export function terminalAt(review: ReviewEntry): string | null {
    return review.reviewer2Status !== "NEW" ? review.reviewer2At : review.reviewer1At;
}

// Every review that reached a final outcome: rejected at Level 1 (chain ends
// there) plus everything Level 2 decided. Level 1 approvals are left out -
// they're still open at Level 2 (or already counted via Level 2 history).
export async function listClosedReviews(): Promise<ReviewEntry[]> {
    const [l1h, l2h] = await Promise.all([reviewApi.listLevel1History(), reviewApi.listLevel2History()]);
    if (!l1h.success || !l2h.success) throw new Error(l1h.message || l2h.message || "Could not load reviews.");
    return [...l1h.reviews.filter((r) => r.reviewer1Status === "REMEDIATE"), ...l2h.reviews];
}

function DecisionBadge({ status }: { status: ReviewEntry["reviewer1Status"] }) {
    if (status === "NEW") return <Badge color="gray" size="sm">Pending</Badge>;
    return (
        <Badge color={DECISION_BADGE_COLOR[status] ?? "gray"} size="sm">
            {DECISION_LABEL[status] || status}
        </Badge>
    );
}

function ReviewerSummary({ title, status, by, at, comment }: { title: string; status: ReviewEntry["reviewer1Status"]; by: string; at: string | null; comment: string }) {
    return (
        <div className="flex flex-col gap-4 rounded-lg bg-secondary p-4 ring-1 ring-secondary">
            <div className="flex items-center justify-between">
                <h3 className="text-md font-semibold text-primary">{title}</h3>
                <DecisionBadge status={status} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <Field label="Reviewed By" value={by || "—"} />
                <Field label="Review Date" value={formatTimestamp(at)} />
            </div>
            <Field label="Root Cause Analysis" value={comment || "—"} />
        </div>
    );
}

// Read-only counterpart of the Reviewer detail page - same alert context, no
// RCA / signature / decision controls. Used by the personas that only oversee
// the review chain (Escalation Manager, Auditor).
export function ReviewReport({ review, parentLabel, onBack }: { review: ReviewEntry; parentLabel: string; onBack: () => void }) {
    const isClosed = review.reviewer1Status === "REMEDIATE" || review.reviewer2Status !== "NEW";
    const stage = isClosed ? "Closed" : review.reviewer1Status === "NEW" ? "Awaiting Level 1" : "Awaiting Level 2";

    return (
        <div className="flex flex-col gap-6">
            <Breadcrumbs items={[{ label: parentLabel }, { label: `${review.controlId} Report` }]} />
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <Button color="link-gray" size="sm" iconLeading={ArrowLeft} onClick={onBack} className="w-fit">
                        Back to {parentLabel}
                    </Button>
                    <h1 className="text-display-xs font-semibold text-primary">
                        {review.controlId} on {review.systemId}
                    </h1>
                    <p className="text-md text-tertiary">{review.controlDescription}</p>
                </div>
                <div className="flex items-center gap-2">
                    {review.escalationDue && (
                        <Badge color="error" size="lg">
                            Escalation Due
                        </Badge>
                    )}
                    <Badge color={badgeColorFor(review.severity)} size="lg">
                        {review.severity}
                    </Badge>
                </div>
            </div>

            <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                <h2 className="mb-4 text-lg font-semibold text-primary">Review Status</h2>
                <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
                    <Field label="Stage" value={stage} />
                    <Field label="Generated Date" value={formatTimestamp(review.generatedDate)} />
                    <Field label="Days Pending" value={isClosed ? "—" : String(review.daysPending ?? 0)} />
                    <Field label="SLA" value={isClosed ? "—" : `${slaLabel(review).text}${review.slaDeadline ? ` (${formatTimestamp(review.slaDeadline)})` : ""}`} />
                </div>
            </div>

            <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                <h2 className="mb-4 text-lg font-semibold text-primary">Review Chain</h2>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <ReviewerSummary
                        title="Level 1 — Control Exception Reviewer"
                        status={review.reviewer1Status}
                        by={review.reviewer1ByName}
                        at={review.reviewer1At}
                        comment={review.reviewer1Comment}
                    />
                    <ReviewerSummary
                        title="Level 2 — Manager Exception Reviewer"
                        status={review.reviewer2Status}
                        by={review.reviewer2ByName}
                        at={review.reviewer2At}
                        comment={review.reviewer2Comment}
                    />
                </div>
            </div>

            {review.ticketNumber && (
                <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                    <h2 className="mb-4 text-lg font-semibold text-primary">Remediation Ticket</h2>
                    <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
                        <div>
                            <div className="text-xs font-semibold text-tertiary">Ticket</div>
                            <div className="mt-1 text-sm">
                                {review.ticketUrl ? (
                                    <a href={review.ticketUrl} target="_blank" rel="noreferrer" className="font-medium text-brand-secondary hover:underline">
                                        {review.ticketNumber}
                                    </a>
                                ) : (
                                    <span className="text-primary">{review.ticketNumber}</span>
                                )}
                            </div>
                        </div>
                        <Field label="Ticket Status" value={review.ticketStatus || (review.ticketResolved ? "Resolved" : "Open")} />
                        <Field label="Raised At" value={review.ticketLevel ? `Level ${review.ticketLevel}` : "—"} />
                        <Field label="Created" value={formatTimestamp(review.ticketCreatedAt)} />
                    </div>
                </div>
            )}

            <AlertContext alertId={review.alertId} />

            <div className="flex justify-end">
                <Button color="secondary" onClick={onBack}>
                    Back to {parentLabel}
                </Button>
            </div>
        </div>
    );
}
