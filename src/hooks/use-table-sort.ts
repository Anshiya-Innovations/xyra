import { useEffect, useMemo, useState } from "react";
import type { SortDescriptor } from "react-aria-components";

export type SortValue = string | number | null | undefined;

// Client-side sorting for a <Table>: pass `sortDescriptor`/`onSortChange` to
// the Table and `allowsSorting` on each sortable Table.Head (its id must be a
// key of `accessors`). Accessors return the comparable value for that column -
// a timestamp or rank number when plain text order would be wrong. Empty
// values always sort last, in either direction. No initial sort: rows keep the
// order they arrived in until a header is clicked.
export function sortRows<T>(rows: T[], get: (row: T) => SortValue, direction: "ascending" | "descending"): T[] {
    const dir = direction === "descending" ? -1 : 1;
    return [...rows].sort((a, b) => {
        const x = get(a);
        const y = get(b);
        const xEmpty = x === null || x === undefined || x === "";
        const yEmpty = y === null || y === undefined || y === "";
        if (xEmpty || yEmpty) return xEmpty === yEmpty ? 0 : xEmpty ? 1 : -1;
        const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
        return cmp * dir;
    });
}

export function useTableSort<T>(rows: T[], accessors: Record<string, (row: T) => SortValue>) {
    const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>();

    const sorted = useMemo(() => {
        const get = sortDescriptor && accessors[String(sortDescriptor.column)];
        return get ? sortRows(rows, get, sortDescriptor.direction) : rows;
        // accessors is a fresh object each render; the column id + direction is what matters.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, sortDescriptor]);

    return { sorted, sortDescriptor, onSortChange: setSortDescriptor };
}

// Client-side pages over already filtered/sorted rows. Jumps back to page 1
// whenever the row list changes (filter, sort or reload), so a narrowed
// result never leaves you stranded on an empty page 7.
export function usePagination<T>(rows: T[], pageSize = 10) {
    const [page, setPage] = useState(1);
    useEffect(() => setPage(1), [rows]);
    const total = Math.max(1, Math.ceil(rows.length / pageSize));
    const current = Math.min(page, total);
    const paged = useMemo(() => rows.slice((current - 1) * pageSize, current * pageSize), [rows, current, pageSize]);
    return { page: current, total, paged, setPage };
}

export const toTime = (iso: string | null | undefined): number | null => {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    return isNaN(t) ? null : t;
};

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
export const severityRank = (severity: string | null | undefined): number | null =>
    severity ? (SEVERITY_RANK[severity.toLowerCase()] ?? 4) : null;
