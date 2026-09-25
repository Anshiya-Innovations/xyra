// Ported 1:1 from xyra-web's webapp/model/controlFrequency.js - same UI
// label <-> backend Controls.frequency enum mapping and cron-run-count math,
// so both frontends estimate "Total Run" identically.
export const FREQ_UI_TO_BE: Record<string, string> = {
    "Monthly (Last day of month)": "MONTHLY",
    "Weekly (Every Monday)": "WEEKLY",
    Daily: "DAILY",
    Realtime: "REALTIME",
    "Cron Expression": "CRON",
};

export const FREQ_BE_TO_UI: Record<string, string> = {
    MONTHLY: "Monthly (Last day of month)",
    WEEKLY: "Weekly (Every Monday)",
    DAILY: "Daily",
    REALTIME: "Realtime",
    CRON: "Cron Expression",
};

export function calculateCronRunCount(cron: string): string {
    if (!cron) return "12";
    const clean = cron.trim().replace(/\s+/g, " ");

    if (clean === "* * * * *" || clean.indexOf("*/1 ") === 0) return "Continuous";

    const parts = clean.split(" ");
    if (parts.length < 5) return "12";

    const [min, hour, dom, mon, dow] = parts;

    if (min === "*" && hour === "*" && dom === "*" && mon === "*" && dow === "*") return "Continuous";

    if ((dom === "1" || dom === "L" || dom === "28" || dom === "30" || dom === "31") && mon === "*" && dow === "*") return "12";

    if (dom === "*" && (dow === "1" || dow === "MON" || dow === "mon")) return "52";

    if (min !== "*" && hour !== "*" && dom === "*" && mon === "*" && dow === "*") return "365";

    if (min !== "*" && hour === "*" && dom === "*") return "8,760 Runs/Year";

    if (min.indexOf("*/") === 0) {
        const step = parseInt(min.replace("*/", ""), 10);
        if (!isNaN(step) && step > 0) {
            const total = Math.round(((24 * 60) / step) * 365);
            return `${total.toLocaleString()} Runs/Year`;
        }
    }

    if (dom !== "*") return "12";

    return "365";
}

export function calculateTotalRun(frequency: string, cron: string): string {
    switch (frequency) {
        case "Monthly (Last day of month)":
            return "12";
        case "Weekly (Every Monday)":
            return "52";
        case "Daily":
            return "365";
        case "Realtime":
            return "Continuous";
        case "Cron Expression":
            return calculateCronRunCount(cron);
        default:
            return "365";
    }
}
