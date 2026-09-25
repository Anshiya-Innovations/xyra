import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle, Play, Stop } from "@untitledui/icons";
import { useNavigate, useParams } from "react-router";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Table } from "@/components/application/table/table";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Breadcrumbs } from "@/components/application/breadcrumbs/breadcrumbs";
import { type RunLog, type SystemControlConfig, systemControlConfigApi } from "@/lib/api-client";
import { FREQ_BE_TO_UI } from "@/lib/control-frequency";

const SEVERITY_BADGE_COLOR: Record<string, "error" | "warning" | "success"> = { HIGH: "error", MEDIUM: "warning", LOW: "success" };
const LEVEL_BADGE_COLOR: Record<string, "error" | "warning" | "gray"> = { ERROR: "error", WARNING: "warning", INFO: "gray" };
const RUN_STATUS_COLOR: Record<string, "success" | "error" | "gray"> = { PASS: "success", FAIL: "error", ERROR: "error" };
const titleCase = (s: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");

type LogRow = RunLog & { id: string };

function formatTimestamp(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export const SystemControlConfigDetailsPage = () => {
    const navigate = useNavigate();
    const { configId } = useParams();
    const [detail, setDetail] = useState<SystemControlConfig | null>(null);
    const [logs, setLogs] = useState<LogRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isBusy, setIsBusy] = useState(false);

    const load = () => {
        if (!configId) return;
        setIsLoading(true);
        systemControlConfigApi
            .getDetail(configId)
            .then((res) => {
                if (!res.success || !res.detail) {
                    setError(res.message || "Could not load this mapping.");
                    return;
                }
                setError(null);
                setDetail(res.detail);
                setLogs(res.logs.map((l, i) => ({ ...l, id: String(i) })));
            })
            .catch(() => setError("Could not reach the server. Is xyra-core running?"))
            .finally(() => setIsLoading(false));
    };

    useEffect(load, [configId]);

    const onToggleStatus = async () => {
        if (!detail) return;
        setIsBusy(true);
        try {
            const res = await systemControlConfigApi.setStatus(detail.id, !detail.enabled);
            if (res.success) load();
            else setError(res.message || "Could not update status.");
        } catch {
            setError("Could not reach the server. Is xyra-core running?");
        } finally {
            setIsBusy(false);
        }
    };

    const onRunNow = async () => {
        if (!detail) return;
        setIsBusy(true);
        try {
            const res = await systemControlConfigApi.runNow(detail.id);
            if (res.success) load();
            else setError(res.message || "Run failed.");
        } catch {
            setError("Could not reach the server to run this control.");
        } finally {
            setIsBusy(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex min-h-100 items-center justify-center">
                <LoadingIndicator type="line-simple" size="md" label="Loading mapping details…" />
            </div>
        );
    }

    if (!detail) {
        return (
            <div className="flex flex-col gap-4">
                <p className="rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">{error || "Mapping not found."}</p>
                <Button color="secondary" iconLeading={ArrowLeft} onClick={() => navigate("/system-control-config")} className="w-fit">
                    Back to System Control Config
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <Breadcrumbs
                items={[
                    { label: "Control Management" },
                    { label: "System Control Config", href: "/system-control-config" },
                    { label: `${detail.controlCode} on ${detail.systemCode}` },
                ]}
            />
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <Button color="link-gray" size="sm" iconLeading={ArrowLeft} onClick={() => navigate("/system-control-config")} className="w-fit">
                        Back to System Control Config
                    </Button>
                    <h1 className="text-display-xs font-semibold text-primary">
                        {detail.controlCode} on {detail.systemCode}
                    </h1>
                    <p className="text-md text-tertiary">Lifecycle, run history and logs for this Control-to-System mapping.</p>
                </div>
                <div className="flex gap-3">
                    <Button iconLeading={Play} isDisabled={!detail.enabled || isBusy} onClick={onRunNow}>
                        Run Now
                    </Button>
                    <Button color={detail.enabled ? "secondary-destructive" : "secondary"} iconLeading={detail.enabled ? Stop : CheckCircle} isLoading={isBusy} onClick={onToggleStatus}>
                        {detail.enabled ? "Deactivate" : "Activate"}
                    </Button>
                </div>
            </div>

            {error && <p className="rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}

            <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                <h2 className="mb-4 text-lg font-semibold text-primary">Mapping Overview</h2>
                <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                    <Field label="Control" value={`${detail.controlCode} — ${detail.controlDescription}`} />
                    <Field label="System" value={`${detail.systemCode} / Client ${detail.systemClient}`} />
                    <div>
                        <div className="text-xs font-semibold text-tertiary">Severity / Type</div>
                        <div className="mt-1 flex items-center gap-2">
                            <Badge color={SEVERITY_BADGE_COLOR[detail.controlSeverity] ?? "gray"} size="sm">
                                {titleCase(detail.controlSeverity)}
                            </Badge>
                            <span className="text-sm text-primary">{titleCase(detail.controlType)}</span>
                        </div>
                    </div>
                    <div>
                        <div className="text-xs font-semibold text-tertiary">Status</div>
                        <div className="mt-1">
                            <Badge color={detail.enabled ? "success" : "gray"} size="sm">
                                {detail.enabled ? "Active" : "Inactive"}
                            </Badge>
                        </div>
                    </div>
                    <Field label="Frequency" value={FREQ_BE_TO_UI[detail.controlFrequency] || detail.controlFrequency} />
                    <Field label="Created On" value={formatTimestamp(detail.createdAt)} />
                    <Field label="Stopped On" value={formatTimestamp(detail.deactivatedAt)} />
                </div>
            </div>

            <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                <h2 className="mb-4 text-lg font-semibold text-primary">Run History</h2>
                <div className="grid grid-cols-3 gap-6">
                    <div>
                        <div className="text-xs text-tertiary">Runs Completed</div>
                        <div className="mt-1 text-display-xs font-semibold text-primary">{detail.runCount}</div>
                    </div>
                    <div>
                        <div className="text-xs text-tertiary">Last Run</div>
                        <div className="mt-1 text-lg font-semibold text-primary">{detail.lastRunAt ? formatTimestamp(detail.lastRunAt) : "Never run yet"}</div>
                    </div>
                    <div>
                        <div className="text-xs text-tertiary">Last Run Status</div>
                        <div className="mt-1">
                            <Badge color={RUN_STATUS_COLOR[detail.lastRunStatus] ?? "gray"} size="sm">
                                {detail.lastRunStatus || "—"}
                            </Badge>
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                <h2 className="mb-4 text-lg font-semibold text-primary">Recent Run Logs</h2>
                {logs.length === 0 ? (
                    <p className="py-6 text-center text-sm text-tertiary">No run logs yet for this mapping.</p>
                ) : (
                    <Table aria-label="Run logs">
                        <Table.Header>
                            <Table.Head id="timestamp" label="Timestamp" isRowHeader />
                            <Table.Head id="level" label="Level" />
                            <Table.Head id="message" label="Message" />
                        </Table.Header>
                        <Table.Body items={logs}>
                            {(log) => (
                                <Table.Row id={log.id}>
                                    <Table.Cell className="text-tertiary">{formatTimestamp(log.timestamp)}</Table.Cell>
                                    <Table.Cell>
                                        <Badge color={LEVEL_BADGE_COLOR[log.level] ?? "gray"} size="sm">
                                            {log.level}
                                        </Badge>
                                    </Table.Cell>
                                    <Table.Cell>{log.message}</Table.Cell>
                                </Table.Row>
                            )}
                        </Table.Body>
                    </Table>
                )}
            </div>
        </div>
    );
};

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="text-xs font-semibold text-tertiary">{label}</div>
            <div className="mt-1 text-sm text-primary">{value}</div>
        </div>
    );
}
