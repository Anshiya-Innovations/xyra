import { useEffect, useMemo, useState } from "react";
import { Edit01, Plus, SearchLg, Trash01 } from "@untitledui/icons";
import { useNavigate } from "react-router";
import { Badge } from "@/components/base/badges/badges";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Table, TableCard } from "@/components/application/table/table";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Breadcrumbs } from "@/components/application/breadcrumbs/breadcrumbs";
import { type Control, controlApi } from "@/lib/api-client";
import { calculateTotalRun, FREQ_BE_TO_UI } from "@/lib/control-frequency";

const SEVERITY_BADGE_COLOR: Record<string, "error" | "warning" | "success"> = {
    HIGH: "error",
    MEDIUM: "warning",
    LOW: "success",
};

function titleCase(s: string) {
    return s ? s.charAt(0) + s.slice(1).toLowerCase() : "";
}

export const ControlsPage = () => {
    const navigate = useNavigate();
    const [controls, setControls] = useState<Control[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [query, setQuery] = useState("");
    const [pendingDelete, setPendingDelete] = useState<Control | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = () => {
        setIsLoading(true);
        controlApi
            .list()
            .then((res) => {
                if (!res.success) {
                    setError(res.message || "Could not load controls.");
                    return;
                }
                setError(null);
                setControls(res.controls);
            })
            .catch(() => setError("Could not reach the server. Is xyra-core running?"))
            .finally(() => setIsLoading(false));
    };

    useEffect(load, []);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return controls;
        return controls.filter((c) => [c.code, c.description, c.severity, c.controlType].join(" ").toLowerCase().includes(q));
    }, [controls, query]);

    const onConfirmDelete = async () => {
        if (!pendingDelete) return;
        setIsDeleting(true);
        try {
            const res = await controlApi.delete(pendingDelete.id);
            if (res.success) {
                setPendingDelete(null);
                load();
            } else {
                setError(res.message || "Could not delete control.");
            }
        } catch {
            setError("Could not reach the server. Is xyra-core running?");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <Breadcrumbs items={[{ label: "Control Management" }, { label: "Controls Config" }]} />
            <div className="flex flex-col gap-1">
                <h1 className="text-display-xs font-semibold text-primary">Controls Config</h1>
                <p className="text-md text-tertiary">Security Control Master directory — rules, severity, and run frequency.</p>
            </div>

            {error && <p className="rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}

            <TableCard.Root>
                <TableCard.Header
                    title="Security Control Master Directory"
                    badge={<Badge color="gray" size="sm">{filtered.length}</Badge>}
                    contentTrailing={
                        <div className="flex items-center gap-3">
                            <Input
                                size="sm"
                                aria-label="Search controls"
                                icon={SearchLg}
                                placeholder="Search Control ID..."
                                value={query}
                                onChange={setQuery}
                            />
                            <Button size="md" iconLeading={Plus} onClick={() => navigate("/controls/new")}>
                                Create Security Control
                            </Button>
                        </div>
                    }
                />

                {isLoading ? (
                    <div className="flex min-h-60 items-center justify-center p-8">
                        {/* line-simple: gray ring + brand-purple arc, matching xyra-web's own ring spinner (.xyraSpinnerRing) */}
                        <LoadingIndicator type="line-simple" size="md" label="Loading controls…" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex min-h-60 items-center justify-center p-8">
                        <EmptyState size="sm">
                            <EmptyState.Header>
                                <EmptyState.FeaturedIcon icon={SearchLg} color="gray" theme="modern" />
                            </EmptyState.Header>
                            <EmptyState.Content>
                                <EmptyState.Title>{query ? "No matching controls" : "No controls yet"}</EmptyState.Title>
                                <EmptyState.Description>
                                    {query ? "Try a different search term." : "Create your first Security Control to get started."}
                                </EmptyState.Description>
                            </EmptyState.Content>
                        </EmptyState>
                    </div>
                ) : (
                    <Table aria-label="Controls">
                        <Table.Header>
                            <Table.Head id="code" label="Control ID" isRowHeader />
                            <Table.Head id="description" label="Description" />
                            <Table.Head id="severity" label="Severity" />
                            <Table.Head id="controlType" label="Control Type" />
                            <Table.Head id="systems" label="Systems Mapped" />
                            <Table.Head id="frequency" label="Frequency" />
                            <Table.Head id="totalRun" label="Total Run" />
                            <Table.Head id="actions" />
                        </Table.Header>
                        <Table.Body items={filtered}>
                            {(control) => {
                                const freqUi = FREQ_BE_TO_UI[control.frequency] || "Daily";
                                return (
                                    <Table.Row id={control.id}>
                                        <Table.Cell className="font-medium text-primary">{control.code}</Table.Cell>
                                        <Table.Cell>{control.description}</Table.Cell>
                                        <Table.Cell>
                                            <Badge color={SEVERITY_BADGE_COLOR[control.severity] ?? "gray"} size="sm">
                                                {titleCase(control.severity)}
                                            </Badge>
                                        </Table.Cell>
                                        <Table.Cell>{titleCase(control.controlType)}</Table.Cell>
                                        <Table.Cell>
                                            {control.systemIds.length} {control.systemIds.length === 1 ? "system" : "systems"}
                                        </Table.Cell>
                                        <Table.Cell>{freqUi}</Table.Cell>
                                        <Table.Cell>{calculateTotalRun(freqUi, control.cronExpression)}</Table.Cell>
                                        <Table.Cell>
                                            <div className="flex justify-end gap-1">
                                                <ButtonUtility
                                                    size="sm"
                                                    color="tertiary"
                                                    icon={Edit01}
                                                    tooltip="Edit"
                                                    onClick={() => navigate(`/controls/${control.id}`)}
                                                />
                                                <ButtonUtility
                                                    size="sm"
                                                    color="tertiary"
                                                    icon={Trash01}
                                                    tooltip="Delete"
                                                    onClick={() => setPendingDelete(control)}
                                                />
                                            </div>
                                        </Table.Cell>
                                    </Table.Row>
                                );
                            }}
                        </Table.Body>
                    </Table>
                )}
            </TableCard.Root>

            <ModalOverlay isOpen={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
                <Modal>
                    <Dialog>
                        <div className="w-full max-w-md rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                            <h3 className="text-lg font-semibold text-primary">Delete Security Control</h3>
                            <p className="mt-2 text-sm text-tertiary">
                                Are you sure you want to delete <span className="font-semibold text-primary">{pendingDelete?.code}</span>? This
                                can't be undone.
                            </p>
                            <div className="mt-6 flex justify-end gap-3">
                                <Button color="secondary" onClick={() => setPendingDelete(null)}>
                                    Cancel
                                </Button>
                                <Button color="primary-destructive" isLoading={isDeleting} onClick={onConfirmDelete}>
                                    Delete
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </div>
    );
};
