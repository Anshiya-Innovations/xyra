// Reviewer1 and Reviewer2 share ~all the same backend calls (decideLevel1 vs
// decideLevel2) and layout - this holds only what genuinely differs between
// them (copy, extra columns/panel), ported from xyra-web's Reviewer1/
// Reviewer2.view.xml + .controller.js.
export type ReviewerLevelConfig = {
    level: 1 | 2;
    pageTitle: string;
    pageSubtitle: string;
    queueTitle: string;
    approveLabel: string;
    approveDialogTitle: string;
    approveNote: string;
    approveSuccessMessage: string;
    rejectDialogTitle: string;
    showReviewer1Summary: boolean;
    historyKpiLabels: { approved: string; rejected: string; pending: string };
    reviewerTitle: string;
};

export const REVIEWER_CONFIG: Record<1 | 2, ReviewerLevelConfig> = {
    1: {
        level: 1,
        pageTitle: "Reviewer 1 - Automated Reports Review",
        pageSubtitle: "Control Exception Reviewer - Level 1 Deviation Review",
        queueTitle: "Automated Reports Review Queue",
        approveLabel: "Approve & Forward",
        approveDialogTitle: "Approve & Forward",
        approveNote: "Approving forwards this exception to Reviewer 2 for final sign-off.",
        approveSuccessMessage: "approved and forwarded to Reviewer 2.",
        rejectDialogTitle: "Reject Report",
        showReviewer1Summary: false,
        historyKpiLabels: { approved: "Approved & Forwarded", rejected: "Rejected", pending: "Pending Review" },
        reviewerTitle: "Control Exception Reviewer",
    },
    2: {
        level: 2,
        pageTitle: "Reviewer 2 - Manager Exception Review",
        pageSubtitle: "Manager Exception Reviewer - Level 2 Final Review",
        queueTitle: "Manager Review Queue",
        approveLabel: "Approve & Close",
        approveDialogTitle: "Approve & Close",
        approveNote: "This is the final sign-off - approving closes the exception record.",
        approveSuccessMessage: "final sign-off recorded, deviation closed.",
        rejectDialogTitle: "Reject (Remediation Ticket)",
        showReviewer1Summary: true,
        historyKpiLabels: { approved: "Approved & Escalated", rejected: "Rejected & Returned", pending: "Pending Escalation" },
        reviewerTitle: "Manager Exception Reviewer",
    },
};
