import { useEffect, useMemo, useState } from "react";
import { Plus, SearchLg, Play } from "@untitledui/icons";
import { useNavigate } from "react-router";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { Toggle } from "@/components/base/toggle/toggle";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { Table, TableCard } from "@/components/application/table/table";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Breadcrumbs } from "@/components/application/breadcrumbs/breadcrumbs";
import { notify } from "@/components/application/notification/notification";
import { type MappableControl, type MappableSystem, type SystemControlConfig, systemControlConfigApi } from "@/lib/api-client";
import { FREQ_BE_TO_UI } from "@/lib/control-frequency";

const SEVERITY_BADGE_COLOR: Record<string, "error" | "warning" | "success"> = { HIGH: "error", MEDIUM: "warning", LOW: "success" };
const titleCase = (s: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");

export const SystemControlConfigPage = () => {
    const navigate = useNavigate();
    const [mappings, setMappings] = useState<SystemControlConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [query, setQuery] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const [isAddOpen, setIsAddOpen] = useState(false);
    const [mappable, setMappable] = useState<{ controls: MappableControl[]; systems: MappableSystem[] }>({ controls: [], systems: [] });
    const [selectedControlId, setSelectedControlId] = useState<string | null>(null);
    const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const load = () => {
        setIsLoading(true);
        systemControlConfigApi
            .list()
            .then((res) => {
                if (!res.success) {
                    setError(res.message || "Could not load system control config.");
                    return;
                }
                setError(null);
                setMappings(res.configs);
            })
            .catch(() => setError("Could not reach the server. Is xyra-core running?"))
            .finally(() => setIsLoading(false));
    };

    useEffect(load, []);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return mappings;
        return mappings.filter((m) => [m.controlCode, m.controlDescription, m.systemCode].join(" ").toLowerCase().includes(q));
    }, [mappings, query]);

    const openAdd = () => {
        setSelectedControlId(null);
        setSelectedSystemId(null);
        setError(null);
        setIsAddOpen(true);
        systemControlConfigApi
            .listMappable()
            .then((res) => {
                if (!res.success) {
                    setError(res.message || "Could not load controls/systems.");
                    return;
                }
                setMappable({ controls: res.controls, systems: res.systems });
            })
            .catch(() => setError("Could not reach the server. Is xyra-core running?"));
    };

    const selectedControl = mappable.controls.find((c) => c.id === selectedControlId);
    const selectedSystem = mappable.systems.find((s) => s.id === selectedSystemId);

    const onSaveMapping = async () => {
        if (!selectedControlId || !selectedSystemId) {
            setError("Please select both a Control and a System.");
            return;
        }
        setIsSaving(true);
        try {
            const res = await systemControlConfigApi.create(selectedControlId, selectedSystemId);
            if (!res.success) {
                setError(res.message || "Could not save this mapping.");
                return;
            }
            setIsAddOpen(false);
            load();
        } catch {
            setError("Could not reach the server. Is xyra-core running?");
        } finally {
            setIsSaving(false);
        }
    };

    // Optimistic: flip the switch immediately, run the request in the
    // background, and only roll it back if the backend actually rejects it -
    // waiting on the round trip (plus a full list reload) before the switch
    // moved was what made this feel slow.
    const onToggleStatus = async (m: SystemControlConfig) => {
        const nextEnabled = !m.enabled;
        setMappings((prev) => prev.map((x) => (x.id === m.id ? { ...x, enabled: nextEnabled } : x)));
        setBusyId(m.id);
        try {
            const res = await systemControlConfigApi.setStatus(m.id, nextEnabled);
            if (res.success) {
                notify("success", `${m.controlCode} on ${m.systemCode} ${nextEnabled ? "activated" : "deactivated"}.`);
            } else {
                setMappings((prev) => prev.map((x) => (x.id === m.id ? { ...x, enabled: m.enabled } : x)));
                notify("error", res.message || "Could not update status.");
            }
        } catch {
            setMappings((prev) => prev.map((x) => (x.id === m.id ? { ...x, enabled: m.enabled } : x)));
            notify("error", "Could not reach the server. Is xyra-core running?");
        } finally {
            setBusyId(null);
        }
    };

    const onRunNow = async (m: SystemControlConfig) => {
        setBusyId(m.id);
        try {
            const res = await systemControlConfigApi.runNow(m.id);
            if (res.success) load();
            else setError(res.message || "Run failed.");
        } catch {
            setError("Could not reach the server to run this control.");
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <Breadcrumbs items={[{ label: "Control Management" }, { label: "System Control Config" }]} />
            <div className="flex flex-col gap-1">
                <h1 className="text-display-xs font-semibold text-primary">System Control Config</h1>
                <p className="text-md text-tertiary">Map each Control to the Systems it should run on, and activate or deactivate that mapping.</p>
            </div>

            {error && <p className="rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}

            <TableCard.Root>
                <TableCard.Header
                    title="Control ↔ System Mappings"
                    badge={<Badge color="gray" size="sm">{filtered.length}</Badge>}
                    contentTrailing={
                        <div className="flex items-center gap-3">
                            <Input size="sm" aria-label="Search mappings" icon={SearchLg} placeholder="Search..." value={query} onChange={setQuery} />
                            <Button size="md" iconLeading={Plus} onClick={openAdd}>
                                Add
                            </Button>
                        </div>
                    }
                />

                {isLoading ? (
                    <div className="flex min-h-60 items-center justify-center p-8">
                        <LoadingIndicator type="line-simple" size="md" label="Loading mappings…" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex min-h-60 items-center justify-center p-8">
                        <EmptyState size="sm">
                            <EmptyState.Header>
                                <EmptyState.FeaturedIcon icon={SearchLg} color="gray" theme="modern" />
                            </EmptyState.Header>
                            <EmptyState.Content>
                                <EmptyState.Title>{query ? "No matching mappings" : "No mappings yet"}</EmptyState.Title>
                                <EmptyState.Description>
                                    {query ? "Try a different search term." : "Click Add to map a control to a system."}
                                </EmptyState.Description>
                            </EmptyState.Content>
                        </EmptyState>
                    </div>
                ) : (
                    <Table aria-label="System control config">
                        <Table.Header>
                            <Table.Head id="control" label="Control ID" isRowHeader />
                            <Table.Head id="description" label="Description" />
                            <Table.Head id="system" label="System" />
                            <Table.Head id="severity" label="Severity" />
                            <Table.Head id="frequency" label="Frequency" />
                            <Table.Head id="status" label="Status" />
                            <Table.Head id="runs" label="Runs Completed" />
                            <Table.Head id="actions" />
                        </Table.Header>
                        <Table.Body items={filtered}>
                            {(m) => (
                                <Table.Row id={m.id}>
                                    <Table.Cell>
                                        <button
                                            type="button"
                                            className="cursor-pointer font-medium text-brand-secondary hover:underline"
                                            onClick={() => navigate(`/system-control-config/${m.id}`)}
                                        >
                                            {m.controlCode}
                                        </button>
                                    </Table.Cell>
                                    <Table.Cell>{m.controlDescription}</Table.Cell>
                                    <Table.Cell>
                                        {m.systemCode}/{m.systemClient}
                                    </Table.Cell>
                                    <Table.Cell>
                                        <Badge color={SEVERITY_BADGE_COLOR[m.controlSeverity] ?? "gray"} size="sm">
                                            {titleCase(m.controlSeverity)}
                                        </Badge>
                                    </Table.Cell>
                                    <Table.Cell>{FREQ_BE_TO_UI[m.controlFrequency] || m.controlFrequency}</Table.Cell>
                                    <Table.Cell>
                                        <Badge color={m.enabled ? "success" : "gray"} size="sm">
                                            {m.enabled ? "Active" : "Inactive"}
                                        </Badge>
                                    </Table.Cell>
                                    <Table.Cell>{m.runCount}</Table.Cell>
                                    <Table.Cell>
                                        <div className="flex items-center justify-end gap-1">
                                            <ButtonUtility
                                                size="sm"
                                                color="tertiary"
                                                icon={Play}
                                                tooltip="Run Now"
                                                isDisabled={!m.enabled || busyId === m.id}
                                                onClick={() => onRunNow(m)}
                                            />
                                            <Tooltip title={m.enabled ? "Deactivate" : "Activate"}>
                                                <Toggle
                                                    size="sm"
                                                    aria-label={m.enabled ? "Deactivate" : "Activate"}
                                                    isSelected={m.enabled}
                                                    onChange={() => onToggleStatus(m)}
                                                />
                                            </Tooltip>
                                        </div>
                                    </Table.Cell>
                                </Table.Row>
                            )}
                        </Table.Body>
                    </Table>
                )}
            </TableCard.Root>

            <ModalOverlay isOpen={isAddOpen} onOpenChange={setIsAddOpen}>
                <Modal>
                    <Dialog>
                        <div className="w-full max-w-lg rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                            <h3 className="text-lg font-semibold text-primary">Map Control to System</h3>
                            <p className="mt-1 text-sm text-tertiary">
                                Pick a Control and a System — the control will run against that system starting from its next scheduled run.
                            </p>

                            <div className="mt-5 flex flex-col gap-5">
                                <Select
                                    label="Control"
                                    isRequired
                                    placeholder="Select control"
                                    selectedKey={selectedControlId}
                                    onSelectionChange={(k) => setSelectedControlId(k as string)}
                                    items={mappable.controls.map((c) => ({ id: c.id, label: c.code, supportingText: c.description }))}
                                >
                                    {(item) => (
                                        <Select.Item id={item.id} supportingText={item.supportingText}>
                                            {item.label}
                                        </Select.Item>
                                    )}
                                </Select>

                                <Select
                                    label="System"
                                    isRequired
                                    placeholder="Select system"
                                    selectedKey={selectedSystemId}
                                    onSelectionChange={(k) => setSelectedSystemId(k as string)}
                                    items={mappable.systems.map((s) => ({ id: s.id, label: `${s.sysId} (Client ${s.client})` }))}
                                >
                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                </Select>

                                {selectedControl && selectedSystem && (
                                    <div className="rounded-lg bg-secondary p-4 ring-1 ring-secondary">
                                        <p className="text-sm font-semibold text-primary">
                                            {selectedControl.code} will run on {selectedSystem.sysId}/{selectedSystem.client} every{" "}
                                            {(FREQ_BE_TO_UI[selectedControl.frequency] || selectedControl.frequency).toLowerCase()}.
                                        </p>
                                        <div className="mt-2 flex items-center gap-2">
                                            <span className="text-sm text-tertiary">Status on save:</span>
                                            <Badge color="success" size="sm">Active</Badge>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="mt-6 flex justify-end gap-3">
                                <Button color="secondary" onClick={() => setIsAddOpen(false)}>
                                    Cancel
                                </Button>
                                <Button isLoading={isSaving} onClick={onSaveMapping}>
                                    Save Mapping
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </div>
    );
};
