// Ported 1:1 from xyra-web's ControlEditor.controller.js - same preset option
// lists and UI-label <-> backend-enum maps, so a control saved here reads
// back identically in xyra-web (and vice versa).

export const OPERATOR_UI_TO_BE: Record<string, string> = {
    Equals: "EQUALS",
    "Not Equals": "NOT_EQUALS",
    Contains: "CONTAINS",
    "Not Contains": "NOT_CONTAINS",
    Exists: "EXISTS",
    "Not Exists": "NOT_EXISTS",
    "Greater Than": "GT",
    "Less Than": "LT",
    "Greater Than or Equal": "GTE",
    "Less Than or Equal": "LTE",
};
export const OPERATOR_BE_TO_UI: Record<string, string> = Object.fromEntries(Object.entries(OPERATOR_UI_TO_BE).map(([ui, be]) => [be, ui]));

export const PARAM_TYPE_UI_TO_BE: Record<string, string> = {
    "SET/GET Parameter": "SETGET",
    "User Default Value": "DEFAULT",
    General: "GENERAL",
    "": "GENERAL",
};
export const PARAM_TYPE_BE_TO_UI: Record<string, string> = {
    SETGET: "SET/GET Parameter",
    DEFAULT: "User Default Value",
    GENERAL: "General",
};

export const SAP_OBJECTS = ["SAP*", "DDIC", "SAPCPIC", "TMSADM", "WF-BATCH", "SAP_WFRT", "EARLYWATCH", "SDMI_*", "J2EE_ADMIN", "J2EE_GUEST", "SAPJSF", "ADSUSER"];

export const PARAMETER_TYPES = ["SET/GET Parameter", "User Default Value", "General"];

export const KNOWN_SETGET = ["BUK", "WRK", "VKO", "VTEG", "SPA", "KOK", "EKO"];
export const SETGET_LABELS: Record<string, string> = {
    BUK: "BUK (Company Code)",
    WRK: "WRK (Plant)",
    VKO: "VKO (Sales Org)",
    VTEG: "VTEG (Distribution Channel)",
    SPA: "SPA (Memory ID)",
    KOK: "KOK (Cost Center)",
    EKO: "EKO (Purchasing Org)",
};

export const KNOWN_USERDEF = ["Decimal Notation", "Date Format", "Time Zone", "Logon Language", "Spool Output (DEST)", "Output Device (PRINTER)"];

export const KNOWN_GENERAL = [
    "Password Changed",
    "User Type",
    "Locked",
    "Failed Logins",
    "Roles Assigned",
    "Security Policy",
    "SDMI_* Exists",
    "Super User",
    "SAP_ALL",
    "S_A.TMSADM",
    "Update Tool",
];

export const OPERATORS = [
    "Equals",
    "Not Equals",
    "Contains",
    "Not Contains",
    "Exists",
    "Not Exists",
    "Greater Than",
    "Less Than",
    "Greater Than or Equal",
    "Less Than or Equal",
];

export const KNOWN_EXPECTED = [
    "1000",
    "Yes",
    "No",
    "A (Dialog User)",
    "B (System User)",
    "C (Communication User)",
    "S (Service User)",
    "L (Reference User)",
    "G (Guest User)",
    "0",
    "1",
    "Z_NOEXPIRY",
    "SUPER",
    "SWPM (Software Provisioning Manager)",
    "SAPup (System Upgrade)",
    "SAPehpi (Enhancement Package Installer)",
    "STARTUP (Software Update Manager)",
    "SUM (SAP Upgrade Manager)",
    "None",
    "SAP delivered roles",
];

// Parameter preset list for whichever Parameter Type is selected.
export function parameterOptionsFor(parameterTypeUi: string): string[] {
    if (parameterTypeUi === "SET/GET Parameter") return KNOWN_SETGET;
    if (parameterTypeUi === "User Default Value") return KNOWN_USERDEF;
    return KNOWN_GENERAL;
}

export function parameterLabel(parameterTypeUi: string, value: string): string {
    if (parameterTypeUi === "SET/GET Parameter") return SETGET_LABELS[value] || value;
    return value;
}

// One working rule row in the Rule Builder dialog - preset + custom-override
// pairs, resolved down to a single value only on save (see resolveRule).
export type UiRule = {
    key: string;
    sapObject: string;
    parameterType: string;
    parameter: string;
    customParameter: string;
    operator: string;
    expectedValue: string;
    customExpectedValue: string;
};

export function emptyDraft(): UiRule {
    return {
        key: crypto.randomUUID(),
        sapObject: "",
        parameterType: "",
        parameter: "",
        customParameter: "",
        operator: "",
        expectedValue: "",
        customExpectedValue: "",
    };
}

export type ResolvedRule = {
    sapObject: string;
    parameterType: string;
    parameter: string;
    operator: string;
    expectedValue: string;
};

export function resolveRule(r: UiRule): ResolvedRule {
    return {
        sapObject: r.sapObject.trim(),
        parameterType: PARAM_TYPE_UI_TO_BE[r.parameterType] || "GENERAL",
        parameter: r.parameter === "Custom" ? r.customParameter.trim() : r.parameter.trim(),
        operator: OPERATOR_UI_TO_BE[r.operator] || r.operator,
        expectedValue:
            r.parameter !== "Failed Logins" && r.expectedValue === "Custom" ? r.customExpectedValue.trim() : String(r.expectedValue || "").trim(),
    };
}

export function unresolveRule(rule: ResolvedRule): UiRule {
    const parameterType = PARAM_TYPE_BE_TO_UI[rule.parameterType] || "General";
    const presetList = parameterOptionsFor(parameterType);
    const parameter = presetList.includes(rule.parameter) ? rule.parameter : "Custom";

    let expectedValue: string;
    let customExpectedValue = "";
    if (rule.parameter === "Failed Logins") {
        expectedValue = rule.expectedValue;
    } else {
        expectedValue = KNOWN_EXPECTED.includes(rule.expectedValue) ? rule.expectedValue : "Custom";
        customExpectedValue = expectedValue === "Custom" ? rule.expectedValue : "";
    }

    return {
        key: crypto.randomUUID(),
        sapObject: rule.sapObject,
        parameterType,
        parameter,
        customParameter: parameter === "Custom" ? rule.parameter : "",
        operator: OPERATOR_BE_TO_UI[rule.operator] || rule.operator,
        expectedValue,
        customExpectedValue,
    };
}

// Same field-required + business-rule checks as ControlEditor.controller.js's
// _validateRules, one rule at a time. Returns an error message, or null if valid.
export function validateRule(r: UiRule, label: string): string | null {
    const sObj = r.sapObject.trim();
    const sParam = (r.parameter === "Custom" ? r.customParameter : r.parameter).trim();
    const sOp = r.operator.trim();
    const sVal = (r.parameter === "Failed Logins" ? r.expectedValue : r.expectedValue === "Custom" ? r.customExpectedValue : r.expectedValue).trim();

    if (!sObj) return `${label}: please select a SAP Object.`;
    if (!sParam) return `${label}: please select a Parameter.`;
    if (!sOp) return `${label}: please select a Validation operator.`;
    if (!sVal) return `${label}: please specify an Expected Value.`;

    if (sParam === "Failed Logins" && isNaN(Number(sVal))) {
        return `${label}: 'Failed Logins' expected value must be a valid number.`;
    }
    if (["Password Changed", "Locked", "SDMI_* Exists"].includes(sParam) && !["Yes", "No", "True", "False"].includes(sVal)) {
        return `${label}: '${sParam}' expected value must be 'Yes' or 'No'.`;
    }
    return null;
}
