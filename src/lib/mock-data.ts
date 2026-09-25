import { notify } from "@/components/application/notification/notification";
import type {
    AdminUser,
    AlertHeader,
    AlertItem,
    AuditLogEntry,
    Control,
    ControlHistoryEntry,
    DeviationKpi,
    JiraSettings,
    MappableControl,
    MappableSystem,
    NotificationEntry,
    Organization,
    ReviewEntry,
    RunLog,
    RunLogEntry,
    SlaSettings,
    SystemControlConfig,
    SystemEntry,
} from "@/lib/api-client";
import type { Session } from "@/lib/session";

// ponytail: in-memory fixtures used only when xyra-core can't be reached -
// mirrors xyra-web's webapp/model/mockData.js (same idea: small, realistic,
// shaped exactly like the real API responses so pages need zero changes to
// render them). Static, not mutated - a reload gets a clean slate.

const ORG_ID = "mock-org-1";

const MOCK_ORGANIZATIONS: Organization[] = [
    {
        id: ORG_ID,
        orgCode: "ORG-DEMO-01",
        name: "Demo Industries Inc.",
        industry: "Manufacturing & Automotive",
        region: "Asia Pacific",
        country: "Singapore",
        primaryContact: "Jordan Lee (VP GRC)",
        email: "grc@demoindustries.test",
        phone: "+65 6555 0100",
        status: "Active",
        systemCount: 3,
        createdAt: "2026-01-15T00:00:00Z",
    },
];

const MOCK_SYSTEMS: SystemEntry[] = [
    {
        id: "mock-sys1",
        sysId: "MY8",
        client: "000",
        sysType: "Development",
        hostName: "sapdev01.demo.local",
        sysDetails: "Development box",
        organizationId: ORG_ID,
        organizationCode: "ORG-DEMO-01",
        organizationName: "Demo Industries Inc.",
        sector: "Manufacturing",
        platform: "S/4HANA",
        region: "APAC",
        clientType: "ABAP",
        sysVersion: "2023",
        logonGroup: "PUBLIC",
        portNumber: 3200,
        instanceNo: "00",
        status: "Active",
        endpoint: "https://sapdev01.demo.local:3200",
        lastConnectionStatus: "Unknown",
    },
    {
        id: "mock-sys2",
        sysId: "MQ8",
        client: "100",
        sysType: "Quality",
        hostName: "sapqas01.demo.local",
        sysDetails: "Quality box",
        organizationId: ORG_ID,
        organizationCode: "ORG-DEMO-01",
        organizationName: "Demo Industries Inc.",
        sector: "Manufacturing",
        platform: "S/4HANA",
        region: "APAC",
        clientType: "ABAP",
        sysVersion: "2023",
        logonGroup: "PUBLIC",
        portNumber: 3600,
        instanceNo: "00",
        status: "Active",
        endpoint: "https://sapqas01.demo.local:3600",
        lastConnectionStatus: "Unknown",
    },
    {
        id: "mock-sys3",
        sysId: "MP8",
        client: "800",
        sysType: "Production",
        hostName: "sapprd01.demo.local",
        sysDetails: "Production box",
        organizationId: ORG_ID,
        organizationCode: "ORG-DEMO-01",
        organizationName: "Demo Industries Inc.",
        sector: "Manufacturing",
        platform: "S/4HANA",
        region: "APAC",
        clientType: "ABAP",
        sysVersion: "2023",
        logonGroup: "PUBLIC",
        portNumber: 3200,
        instanceNo: "00",
        status: "Active",
        endpoint: "https://sapprd01.demo.local:3200",
        lastConnectionStatus: "Unknown",
    },
];

const MOCK_CONTROLS: Control[] = [
    {
        id: "mock-nlg01",
        code: "NLG01",
        description: "SAP System Security Baseline & Parameter Enforcement",
        category: "Security",
        controlType: "SECURITY",
        severity: "HIGH",
        frequency: "DAILY",
        cronExpression: "",
        enabled: true,
        systemIds: ["mock-sys1", "mock-sys2", "mock-sys3"],
        rules: [
            { sapObject: "SAP*", parameterType: "GENERAL", parameter: "Password Changed", operator: "EQUALS", expectedValue: "Yes" },
            { sapObject: "SAP*", parameterType: "GENERAL", parameter: "Roles Assigned", operator: "EQUALS", expectedValue: "None" },
        ],
        lastRunAt: "2026-09-24T06:00:00Z",
        lastRunStatus: "PASS",
        nextRunAt: null,
        createdBy: "ADMIN",
        createdAt: "2026-08-10T00:00:00Z",
        modifiedBy: "ADMIN",
        modifiedAt: "2026-08-10T00:00:00Z",
    },
    {
        id: "mock-xyra08",
        code: "XYRA-08",
        description: "SAP Java Audit Log Filters & Security Event Monitoring",
        category: "Security",
        controlType: "SECURITY",
        severity: "MEDIUM",
        frequency: "DAILY",
        cronExpression: "",
        enabled: true,
        systemIds: ["mock-sys1"],
        rules: [{ sapObject: "SAP*", parameterType: "GENERAL", parameter: "Password Changed", operator: "EQUALS", expectedValue: "Yes" }],
        lastRunAt: "2026-09-24T06:00:00Z",
        lastRunStatus: "FAIL",
        nextRunAt: null,
        createdBy: "ADMIN",
        createdAt: "2026-08-10T00:00:00Z",
        modifiedBy: "ADMIN",
        modifiedAt: "2026-08-10T00:00:00Z",
    },
];

const MOCK_CONTROL_HISTORY: ControlHistoryEntry[] = [
    {
        controlId: "mock-nlg01",
        controlDescription: MOCK_CONTROLS[0].description,
        systemId: "mock-sys2",
        client: "100",
        region: "APAC",
        platform: "S/4HANA",
        sector: "Manufacturing",
        sapObject: "SAP*",
        parameter: "Password Changed",
        operator: "EQUALS",
        actualValue: "Yes",
        expectedValue: "Yes",
        deviationFlag: false,
        message: "Parameter matches expected value.",
        capturedAt: "2026-09-24T06:00:00Z",
    },
    {
        controlId: "mock-xyra08",
        controlDescription: MOCK_CONTROLS[1].description,
        systemId: "mock-sys1",
        client: "000",
        region: "APAC",
        platform: "S/4HANA",
        sector: "Manufacturing",
        sapObject: "SAP*",
        parameter: "Password Changed",
        operator: "EQUALS",
        actualValue: "No",
        expectedValue: "Yes",
        deviationFlag: true,
        message: "Parameter does not match expected value.",
        capturedAt: "2026-09-24T06:00:00Z",
    },
];

const MOCK_SYSTEM_CONTROL_CONFIGS: SystemControlConfig[] = [
    {
        id: "mock-scc1",
        controlId: "mock-nlg01",
        controlCode: "NLG01",
        controlDescription: MOCK_CONTROLS[0].description,
        controlSeverity: "HIGH",
        controlType: "SECURITY",
        controlFrequency: "DAILY",
        systemId: "mock-sys2",
        systemCode: "MQ8",
        systemClient: "100",
        enabled: true,
        createdAt: "2026-08-11T00:00:00Z",
        deactivatedAt: null,
        runCount: 12,
        lastRunAt: "2026-09-24T06:00:00Z",
        lastRunStatus: "PASS",
    },
    {
        id: "mock-scc2",
        controlId: "mock-xyra08",
        controlCode: "XYRA-08",
        controlDescription: MOCK_CONTROLS[1].description,
        controlSeverity: "MEDIUM",
        controlType: "SECURITY",
        controlFrequency: "DAILY",
        systemId: "mock-sys1",
        systemCode: "MY8",
        systemClient: "000",
        enabled: true,
        createdAt: "2026-08-11T00:00:00Z",
        deactivatedAt: null,
        runCount: 8,
        lastRunAt: "2026-09-24T06:00:00Z",
        lastRunStatus: "FAIL",
    },
];

const MOCK_RUN_LOGS: RunLog[] = [
    { timestamp: "2026-09-24T06:00:00Z", level: "INFO", message: "Run started." },
    { timestamp: "2026-09-24T06:00:02Z", level: "INFO", message: "Evaluated 1 rule against 1 system." },
    { timestamp: "2026-09-24T06:00:03Z", level: "INFO", message: "Run completed." },
];

const MOCK_ALERT_HEADERS: AlertHeader[] = [
    {
        id: "mock-alert1",
        controlId: "mock-nlg01",
        controlDescription: MOCK_CONTROLS[0].description,
        systemId: "mock-sys2",
        client: "100",
        organizationId: ORG_ID,
        sector: "Manufacturing",
        region: "APAC",
        platform: "S/4HANA",
        status: "Open",
        severity: "HIGH",
        deviationCount: 2,
        alertDate: "2026-09-24T06:00:00Z",
        description: MOCK_CONTROLS[0].description,
    },
    {
        id: "mock-alert2",
        controlId: "mock-xyra08",
        controlDescription: MOCK_CONTROLS[1].description,
        systemId: "mock-sys1",
        client: "000",
        organizationId: ORG_ID,
        sector: "Manufacturing",
        region: "APAC",
        platform: "S/4HANA",
        status: "In Progress",
        severity: "MEDIUM",
        deviationCount: 1,
        alertDate: "2026-09-23T06:00:00Z",
        description: MOCK_CONTROLS[1].description,
    },
];

const MOCK_DEVIATION_KPI: DeviationKpi = {
    totalIncidents: 3,
    openItems: 2,
    resolvedItems: 1,
    auditedControls: 2,
    complianceRate: "91.7%",
};

const MOCK_ALERT_ITEMS: AlertItem[] = [
    {
        id: "mock-item1",
        sapObject: "SAP*",
        parameter: "Password Changed",
        operator: "EQUALS",
        expectedValue: "Yes",
        actualValue: "No",
        status: "Open",
        timestamp: "2026-09-24T06:00:00Z",
        message: "Parameter does not match expected value.",
    },
];

const MOCK_RUN_LOG_ENTRIES: RunLogEntry[] = [
    { id: "mock-log1", level: "INFO", message: "Run started.", timestamp: "2026-09-24T06:00:00Z" },
    { id: "mock-log2", level: "WARN", message: "1 deviation detected.", timestamp: "2026-09-24T06:00:02Z" },
    { id: "mock-log3", level: "INFO", message: "Run completed.", timestamp: "2026-09-24T06:00:03Z" },
];

const MOCK_REVIEWS: ReviewEntry[] = [
    {
        id: "mock-rev1",
        alertItemId: "mock-item1",
        alertId: "mock-alert1",
        controlId: "mock-nlg01",
        controlDescription: MOCK_CONTROLS[0].description,
        systemId: "mock-sys2",
        client: "100",
        sapObject: "SAP*",
        parameter: "Password Changed",
        operator: "EQUALS",
        actualValue: "No",
        expectedValue: "Yes",
        message: "Parameter does not match expected value.",
        severity: "HIGH",
        generatedDate: "2026-09-24T06:00:00Z",
        reviewer1Status: "NEW",
        reviewer1Comment: "",
        reviewer1ByName: "",
        reviewer1At: null,
        reviewer2Status: "NEW",
        reviewer2Comment: "",
        reviewer2ByName: "",
        reviewer2At: null,
        ticketNumber: "",
        ticketLevel: null,
        ticketCreatedAt: null,
        ticketUrl: "",
        ticketStatus: "",
        ticketResolved: false,
        slaDeadline: "2026-09-27T06:00:00Z",
        daysPending: 1,
        isOverdue: false,
        escalationDue: false,
    },
    {
        id: "mock-rev2",
        alertItemId: "mock-item1",
        alertId: "mock-alert1",
        controlId: "mock-nlg01",
        controlDescription: MOCK_CONTROLS[0].description,
        systemId: "mock-sys2",
        client: "100",
        sapObject: "SAP*",
        parameter: "Roles Assigned",
        operator: "EQUALS",
        actualValue: "Some",
        expectedValue: "None",
        message: "Parameter does not match expected value.",
        severity: "HIGH",
        generatedDate: "2026-09-22T06:00:00Z",
        reviewer1Status: "APPROVE",
        reviewer1Comment: "Confirmed with system owner, tracked separately.",
        reviewer1ByName: "Reviewer One",
        reviewer1At: "2026-09-22T09:00:00Z",
        reviewer2Status: "NEW",
        reviewer2Comment: "",
        reviewer2ByName: "",
        reviewer2At: null,
        ticketNumber: "",
        ticketLevel: null,
        ticketCreatedAt: null,
        ticketUrl: "",
        ticketStatus: "",
        ticketResolved: false,
        slaDeadline: "2026-09-25T06:00:00Z",
        daysPending: 3,
        isOverdue: false,
        escalationDue: false,
    },
    {
        id: "mock-rev3",
        alertItemId: "mock-item1",
        alertId: "mock-alert2",
        controlId: "mock-xyra08",
        controlDescription: MOCK_CONTROLS[1].description,
        systemId: "mock-sys1",
        client: "000",
        sapObject: "SAP*",
        parameter: "Password Changed",
        operator: "EQUALS",
        actualValue: "No",
        expectedValue: "Yes",
        message: "Parameter does not match expected value.",
        severity: "MEDIUM",
        generatedDate: "2026-09-18T06:00:00Z",
        reviewer1Status: "APPROVE",
        reviewer1Comment: "Approved.",
        reviewer1ByName: "Reviewer One",
        reviewer1At: "2026-09-18T09:00:00Z",
        reviewer2Status: "APPROVE",
        reviewer2Comment: "Ticket raised and resolved.",
        reviewer2ByName: "Reviewer Two",
        reviewer2At: "2026-09-19T09:00:00Z",
        ticketNumber: "JIRA-DEMO-101",
        ticketLevel: 2,
        ticketCreatedAt: "2026-09-19T09:05:00Z",
        ticketUrl: "",
        ticketStatus: "Resolved",
        ticketResolved: true,
        slaDeadline: "2026-09-21T06:00:00Z",
        daysPending: 0,
        isOverdue: false,
        escalationDue: false,
    },
    {
        id: "mock-rev4",
        alertItemId: "mock-item1",
        alertId: "mock-alert2",
        controlId: "mock-xyra08",
        controlDescription: MOCK_CONTROLS[1].description,
        systemId: "mock-sys1",
        client: "000",
        sapObject: "SAP*",
        parameter: "Roles Assigned",
        operator: "EQUALS",
        actualValue: "Some",
        expectedValue: "None",
        message: "Parameter does not match expected value.",
        severity: "MEDIUM",
        generatedDate: "2026-09-15T06:00:00Z",
        reviewer1Status: "REMEDIATE",
        reviewer1Comment: "Sent back for remediation.",
        reviewer1ByName: "Reviewer One",
        reviewer1At: "2026-09-15T09:00:00Z",
        reviewer2Status: "NEW",
        reviewer2Comment: "",
        reviewer2ByName: "",
        reviewer2At: null,
        ticketNumber: "",
        ticketLevel: null,
        ticketCreatedAt: null,
        ticketUrl: "",
        ticketStatus: "",
        ticketResolved: false,
        slaDeadline: "2026-09-18T06:00:00Z",
        daysPending: 9,
        isOverdue: true,
        escalationDue: true,
    },
];

const MOCK_AUDIT_LOGS: AuditLogEntry[] = [
    {
        id: "mock-log-1",
        createdAt: "2026-09-24T06:00:00Z",
        action: "RUN_CONTROL",
        module: "Control Management",
        objectType: "Control",
        objectId: "mock-nlg01",
        objectLabel: "NLG01",
        description: "Control NLG01 executed.",
        previousValue: "",
        newValue: "PASS",
        result: "SUCCESS",
        systemId: "mock-sys2",
        controlId: "mock-nlg01",
        performedBy: "admin@xyrademo.test",
        performedByRole: "ADMIN",
    },
    {
        id: "mock-log-2",
        createdAt: "2026-09-23T06:00:00Z",
        action: "RUN_CONTROL",
        module: "Control Management",
        objectType: "Control",
        objectId: "mock-xyra08",
        objectLabel: "XYRA-08",
        description: "Control XYRA-08 executed.",
        previousValue: "",
        newValue: "FAIL",
        result: "SUCCESS",
        systemId: "mock-sys1",
        controlId: "mock-xyra08",
        performedBy: "admin@xyrademo.test",
        performedByRole: "ADMIN",
    },
    {
        id: "mock-log-3",
        createdAt: "2026-09-22T09:00:00Z",
        action: "REVIEW_DECISION",
        module: "Reviewer Queue",
        objectType: "Review",
        objectId: "mock-rev2",
        objectLabel: "mock-rev2",
        description: "Reviewer One approved a Level 1 review.",
        previousValue: "NEW",
        newValue: "APPROVE",
        result: "SUCCESS",
        systemId: "mock-sys2",
        controlId: "mock-nlg01",
        performedBy: "reviewer1@xyrademo.test",
        performedByRole: "REVIEWER",
    },
];

const MOCK_NOTIFICATIONS: NotificationEntry[] = [
    {
        id: "mock-notif-1",
        title: "Welcome back",
        message: "You've signed in successfully.",
        category: "REMINDER",
        priority: "LOW",
        read: false,
        targetPage: "Profile",
        targetRecord: null,
        icon: "sap-icon://person-placeholder",
        iconClass: "",
        createdAt: "2026-09-24T08:00:00Z",
    },
    {
        id: "mock-notif-2",
        title: "New deviation detected",
        message: "Control NLG01 found 2 deviations on MQ8.",
        category: "ALERT",
        priority: "HIGH",
        read: false,
        targetPage: "DeviationReport",
        targetRecord: "mock-alert1",
        icon: "sap-icon://alert",
        iconClass: "",
        createdAt: "2026-09-24T06:00:00Z",
    },
    {
        id: "mock-notif-3",
        title: "Ticket resolved",
        message: "JIRA-DEMO-101 has been resolved.",
        category: "TICKET",
        priority: "MEDIUM",
        read: true,
        targetPage: "Reviewer2",
        targetRecord: "mock-rev3",
        icon: "sap-icon://complete",
        iconClass: "",
        createdAt: "2026-09-19T09:05:00Z",
    },
];

// Canonical demo-persona identities - also what login.tsx falls back to when
// xyra-core is fully unreachable, so ids/emails/roles must line up with
// login.tsx's PERSONAS table.
export const MOCK_USERS: AdminUser[] = [
    { id: "mock-admin", name: "Demo Admin", email: "admin@xyrademo.test", organization: "Demo Industries Inc.", role: "ADMIN", status: "ACTIVE", createdAt: "2026-01-15T00:00:00Z" },
    {
        id: "mock-escalation-manager",
        name: "Demo Escalation Manager",
        email: "escalationmanager@xyrademo.test",
        organization: "Demo Industries Inc.",
        role: "ESCALATION_MANAGER",
        status: "ACTIVE",
        createdAt: "2026-01-15T00:00:00Z",
    },
    { id: "mock-reviewer1", name: "Demo Reviewer One", email: "reviewer1@xyrademo.test", organization: "Demo Industries Inc.", role: "REVIEWER", status: "ACTIVE", createdAt: "2026-02-02T00:00:00Z" },
    { id: "mock-reviewer2", name: "Demo Reviewer Two", email: "reviewer2@xyrademo.test", organization: "Demo Industries Inc.", role: "REVIEWER", status: "ACTIVE", createdAt: "2026-02-02T00:00:00Z" },
    { id: "mock-auditor", name: "Demo Auditor", email: "auditor@xyrademo.test", organization: "Demo Industries Inc.", role: "AUDITOR", status: "ACTIVE", createdAt: "2026-02-10T00:00:00Z" },
];

const MOCK_JIRA_SETTINGS: JiraSettings = {
    enabled: false,
    siteUrl: "",
    email: "",
    projectKey: "",
    issueType: "",
    hasToken: false,
    statusCreated: "",
    statusInProgress: "",
    statusResolved: "",
};

const MOCK_SLA_SETTINGS: SlaSettings = { reviewer1Days: 3, reviewer2Days: 3, escalationDelayDays: 2 };

const ok = <T extends object>(data: T) => ({ success: true, message: "OK", ...data });

function byId<T extends { id: string }>(list: T[], id: unknown): T | null {
    return list.find((item) => item.id === id) ?? list[0] ?? null;
}

type MockHandler = (body: Record<string, unknown>, session: Session | null) => unknown;

// One handler per READ action currently called anywhere in the app - keyed
// exactly like call()'s (service, action). Deliberately no entries for
// mutations (create/update/delete/run/decide/reset/...): call() rethrows for
// anything missing here, so writes keep showing a real "offline" error
// instead of pretending to succeed.
const MOCK_HANDLERS: Record<string, Record<string, MockHandler>> = {
    control: {
        listControls: () => ok({ controls: MOCK_CONTROLS }),
        getControl: (body) => ok({ control: byId(MOCK_CONTROLS, body.id) }),
        listControlHistory: () => ok({ history: MOCK_CONTROL_HISTORY }),
    },
    "system-control-config": {
        listSystemControlConfigs: () => ok({ configs: MOCK_SYSTEM_CONTROL_CONFIGS }),
        listMappableControlsAndSystems: () =>
            ok({
                controls: MOCK_CONTROLS.map((c): MappableControl => ({ id: c.id, code: c.code, description: c.description, severity: c.severity, controlType: c.controlType, frequency: c.frequency })),
                systems: MOCK_SYSTEMS.map((s): MappableSystem => ({ id: s.id, sysId: s.sysId, client: s.client })),
            }),
        getSystemControlConfigDetail: (body) => ok({ detail: byId(MOCK_SYSTEM_CONTROL_CONFIGS, body.id), logs: MOCK_RUN_LOGS }),
    },
    organization: {
        listOrganizations: () => ok({ organizations: MOCK_ORGANIZATIONS }),
        getOrganization: (body) => ok({ organization: byId(MOCK_ORGANIZATIONS, body.id) }),
        getJiraSettings: () => ok({ settings: MOCK_JIRA_SETTINGS }),
    },
    "system-config": {
        listSystems: () => ok({ systems: MOCK_SYSTEMS }),
        getSlaSettings: () => ok({ settings: MOCK_SLA_SETTINGS }),
    },
    deviation: {
        listDeviations: () => ok({ headers: MOCK_ALERT_HEADERS, kpi: MOCK_DEVIATION_KPI }),
        getDeviationDetail: (body) => ok({ header: byId(MOCK_ALERT_HEADERS, body.alertId), items: MOCK_ALERT_ITEMS }),
        getRunLogs: () => ok({ logs: MOCK_RUN_LOG_ENTRIES }),
    },
    review: {
        listLevel1Queue: () => ok({ reviews: MOCK_REVIEWS.filter((r) => r.reviewer1Status === "NEW") }),
        listLevel1History: () => ok({ reviews: MOCK_REVIEWS.filter((r) => r.reviewer1Status !== "NEW") }),
        listLevel2Queue: () => ok({ reviews: MOCK_REVIEWS.filter((r) => r.reviewer1Status !== "NEW" && r.reviewer2Status === "NEW") }),
        listLevel2History: () => ok({ reviews: MOCK_REVIEWS.filter((r) => r.reviewer2Status !== "NEW") }),
        getReviewDetail: (body) => ok({ review: MOCK_REVIEWS.find((r) => r.id === body.reviewId) ?? MOCK_REVIEWS[0] }),
    },
    "audit-log": {
        listAuditLogs: () => ok({ logs: MOCK_AUDIT_LOGS }),
    },
    notifications: {
        listNotifications: () => ok({ notifications: MOCK_NOTIFICATIONS }),
    },
    admin: {
        listUsers: () => ({ value: MOCK_USERS }),
    },
    profile: {
        // Built from whoever is actually logged in (real login or the
        // offline mock login below), not a static fixture, so it always
        // matches the active persona instead of a fixed demo identity.
        getProfile: (_body, session) =>
            ok({
                id: session?.userId ?? "mock-user",
                name: session?.name ?? "Demo User",
                email: session?.email ?? "demo@xyrademo.test",
                phone: "+1 555-0100",
                department: "IT Governance",
                organization: "Demo Industries Inc.",
                role: session?.role ?? "ADMIN",
                status: "ACTIVE",
            }),
    },
};

export function getMockResponse(service: string, action: string, body: Record<string, unknown>, session: Session | null): unknown {
    const handler = MOCK_HANDLERS[service]?.[action];
    return handler ? handler(body, session) : undefined;
}

let offlineNoticeShown = false;

// Once per page load (not once per failed call) - mirrors xyra-web's
// MockData.notice, so a page firing several parallel calls (e.g. the
// dashboard) doesn't stack several identical toasts.
export function notifyBackendOffline() {
    if (offlineNoticeShown) return;
    offlineNoticeShown = true;
    notify("warning", "xyra-core is offline — showing dummy data for testing purposes only.");
}
