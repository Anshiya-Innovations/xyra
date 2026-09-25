import type { AlertHeader } from "@/lib/api-client";

// Shared derivations used by both the Deviation Report and the Admin
// Dashboard - same headers array, same two chart shapes, no reason to
// recompute them differently in two places.

// Incidents per day, chronological - one series, one hue (magnitude, not identity).
export function groupByDay(headers: AlertHeader[]): { day: string; count: number }[] {
    const counts = new Map<string, number>();
    headers.forEach((h) => {
        if (!h.alertDate) return;
        const day = h.alertDate.slice(0, 10);
        counts.set(day, (counts.get(day) || 0) + 1);
    });
    return Array.from(counts.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, count]) => ({ day: new Date(day).toLocaleDateString(undefined, { month: "short", day: "numeric" }), count }));
}

// Top N controls by total deviation count - same reasoning, single hue.
export function topByControl(headers: AlertHeader[], limit = 8): { controlId: string; count: number }[] {
    const counts = new Map<string, number>();
    headers.forEach((h) => counts.set(h.controlId, (counts.get(h.controlId) || 0) + h.deviationCount));
    return Array.from(counts.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([controlId, count]) => ({ controlId, count }));
}
