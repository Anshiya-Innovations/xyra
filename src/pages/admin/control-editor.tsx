import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Plus, Trash01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { Table } from "@/components/application/table/table";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Breadcrumbs } from "@/components/application/breadcrumbs/breadcrumbs";
import { controlApi } from "@/lib/api-client";
import { calculateTotalRun, FREQ_BE_TO_UI, FREQ_UI_TO_BE } from "@/lib/control-frequency";
import {
    KNOWN_EXPECTED,
    OPERATORS,
    PARAMETER_TYPES,
    SAP_OBJECTS,
    type UiRule,
    emptyDraft,
    parameterLabel,
    parameterOptionsFor,
    resolveRule,
    unresolveRule,
    validateRule,
} from "@/lib/rule-presets";

const items = (values: string[]) => values.map((v) => ({ id: v, label: v }));

const FREQUENCIES = ["Monthly (Last day of month)", "Weekly (Every Monday)", "Daily", "Realtime", "Cron Expression"];

export const ControlEditorPage = () => {
    const navigate = useNavigate();
    const { controlId } = useParams();
    const isEdit = !!controlId;

    const [isLoading, setIsLoading] = useState(isEdit);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [existing, setExisting] = useState<{ category: string; enabled: boolean } | null>(null);

    const [code, setCode] = useState("");
    const [description, setDescription] = useState("");
    const [severity, setSeverity] = useState("MEDIUM");
    const [controlType, setControlType] = useState("SECURITY");
    const [frequency, setFrequency] = useState("Daily");
    const [cron, setCron] = useState("");
    const [rules, setRules] = useState<UiRule[]>([]);

    const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false);
    const [draft, setDraft] = useState<UiRule>(emptyDraft());

    useEffect(() => {
        if (!controlId) return;
        controlApi.get(controlId).then((res) => {
            setIsLoading(false);
            if (!res.success || !res.control) {
                setError(res.message || "Could not load this control.");
                return;
            }
            const c = res.control;
            setCode(c.code);
            setDescription(c.description);
            setSeverity(c.severity);
            setControlType(c.controlType);
            setFrequency(FREQ_BE_TO_UI[c.frequency] || "Daily");
            setCron(c.cronExpression || "");
            setRules(c.rules.map(unresolveRule));
            setExisting({ category: c.category, enabled: c.enabled });
        }).catch(() => {
            setIsLoading(false);
            setError("Could not reach the server. Is xyra-core running?");
        });
    }, [controlId]);

    const openAddRule = () => {
        setDraft(emptyDraft());
        setIsRuleDialogOpen(true);
    };

    const confirmAddRule = () => {
        const err = validateRule(draft, `Rule ${rules.length + 1}`);
        if (err) {
            setError(err);
            return;
        }
        setError(null);
        setRules((prev) => [...prev, draft]);
        setIsRuleDialogOpen(false);
    };

    const removeRule = (key: string) => setRules((prev) => prev.filter((r) => r.key !== key));

    const onSave = async () => {
        setError(null);
        if (!code.trim() || !description.trim()) {
            setError("Control ID and Control Description are mandatory.");
            return;
        }
        if (frequency === "Cron Expression" && !cron.trim()) {
            setError("Please specify a Cron Expression.");
            return;
        }
        if (rules.length === 0) {
            setError("Add at least one Rule before saving.");
            return;
        }
        for (let i = 0; i < rules.length; i++) {
            const err = validateRule(rules[i], `Rule ${i + 1}`);
            if (err) {
                setError(err);
                return;
            }
        }

        setIsSaving(true);
        const resolvedRules = rules.map(resolveRule);
        try {
            if (isEdit && controlId) {
                const res = await controlApi.update(controlId, {
                    description: description.trim(),
                    category: existing?.category ?? null,
                    controlType,
                    severity,
                    frequency: FREQ_UI_TO_BE[frequency] || "DAILY",
                    cronExpression: cron.trim() || null,
                    enabled: existing?.enabled ?? true,
                    rules: resolvedRules,
                });
                if (!res.success) {
                    setError(res.message || "Could not update control.");
                    return;
                }
            } else {
                const res = await controlApi.create({
                    code: code.trim(),
                    description: description.trim(),
                    category: null,
                    controlType,
                    severity,
                    frequency: FREQ_UI_TO_BE[frequency] || "DAILY",
                    cronExpression: cron.trim() || null,
                    rules: resolvedRules,
                });
                if (!res.success) {
                    setError(res.message || "Could not create control.");
                    return;
                }
            }
            navigate("/controls");
        } catch {
            setError("Could not reach the server. Is xyra-core running?");
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex min-h-100 items-center justify-center">
                {/* line-simple: gray ring + brand-purple arc, matching xyra-web's own ring spinner (.xyraSpinnerRing) */}
                <LoadingIndicator type="line-simple" size="md" label="Loading control…" />
            </div>
        );
    }

    const parameterOptions = parameterOptionsFor(draft.parameterType);
    const isFailedLogins = draft.parameter === "Failed Logins";

    return (
        <div className="flex flex-col gap-6">
            <Breadcrumbs
                items={[
                    { label: "Control Management" },
                    { label: "Controls Config", href: "/controls" },
                    { label: isEdit ? `Edit ${code}` : "Create Control" },
                ]}
            />
            <div className="flex flex-col gap-1">
                <h1 className="text-display-xs font-semibold text-primary">{isEdit ? `Edit Security Control: ${code}` : "Create Security Control"}</h1>
                <p className="text-md text-tertiary">Configure the control's severity, schedule, and validation rules.</p>
            </div>

            {error && <p className="rounded-lg bg-error-secondary px-4 py-3 text-sm text-error-primary">{error}</p>}

            <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <Input label="Control ID" isRequired isDisabled={isEdit} placeholder="e.g. XYRA-08" value={code} onChange={setCode} />

                    <Select label="Severity" isRequired selectedKey={severity} onSelectionChange={(k) => setSeverity(k as string)} items={items(["LOW", "MEDIUM", "HIGH"])}>
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>

                    <Select label="Control Type" isRequired selectedKey={controlType} onSelectionChange={(k) => setControlType(k as string)} items={[
                        { id: "SECURITY", label: "Security" },
                        { id: "BASIS", label: "Basis" },
                        { id: "GXP", label: "GxP" },
                    ]}>
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>

                    <Select label="Frequency Run" isRequired selectedKey={frequency} onSelectionChange={(k) => setFrequency(k as string)} items={items(FREQUENCIES)}>
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>

                    {frequency === "Cron Expression" && (
                        <Input label="Cron Expression" isRequired placeholder="e.g. 0 0 1 * *" hint="'* * * * *' Realtime | '0 0 * * *' Daily | '0 0 * * 1' Weekly" value={cron} onChange={setCron} />
                    )}

                    <Input label="Total Run (read-only)" isDisabled value={calculateTotalRun(frequency, cron)} onChange={() => {}} />
                </div>

                <div className="mt-5">
                    <TextArea label="Control Description" isRequired rows={3} placeholder="Enter detailed control description..." value={description} onChange={setDescription} />
                </div>
            </div>

            <div className="rounded-xl bg-primary p-6 ring-1 ring-secondary">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-primary">Rule Configuration</h2>
                    <Button size="sm" iconLeading={Plus} onClick={openAddRule}>
                        Add Rule
                    </Button>
                </div>

                {rules.length === 0 ? (
                    <p className="py-6 text-center text-sm text-tertiary">No rules added yet.</p>
                ) : (
                    <Table aria-label="Rules">
                        <Table.Header>
                            <Table.Head id="sapObject" label="SAP Object" isRowHeader />
                            <Table.Head id="paramType" label="Parameter Type" />
                            <Table.Head id="parameter" label="Parameter" />
                            <Table.Head id="operator" label="Validation" />
                            <Table.Head id="expected" label="Expected Value" />
                            <Table.Head id="actions" />
                        </Table.Header>
                        <Table.Body items={rules}>
                            {(rule) => (
                                <Table.Row id={rule.key}>
                                    <Table.Cell>{rule.sapObject}</Table.Cell>
                                    <Table.Cell>{rule.parameterType}</Table.Cell>
                                    <Table.Cell>{rule.parameter === "Custom" ? rule.customParameter : rule.parameter}</Table.Cell>
                                    <Table.Cell>{rule.operator}</Table.Cell>
                                    <Table.Cell>{rule.expectedValue === "Custom" ? rule.customExpectedValue : rule.expectedValue}</Table.Cell>
                                    <Table.Cell>
                                        <ButtonUtility size="sm" color="tertiary" icon={Trash01} tooltip="Delete Rule" onClick={() => removeRule(rule.key)} />
                                    </Table.Cell>
                                </Table.Row>
                            )}
                        </Table.Body>
                    </Table>
                )}
            </div>

            <div className="flex justify-end gap-3">
                <Button color="secondary" onClick={() => navigate("/controls")}>
                    Cancel
                </Button>
                <Button isLoading={isSaving} onClick={onSave}>
                    Save
                </Button>
            </div>

            <ModalOverlay isOpen={isRuleDialogOpen} onOpenChange={setIsRuleDialogOpen}>
                <Modal>
                    <Dialog>
                        <div className="w-full max-w-3xl rounded-xl bg-primary p-6 shadow-xl ring-1 ring-secondary">
                            <h3 className="text-lg font-semibold text-primary">Add Rule</h3>

                            <div className="mt-5 flex flex-col gap-5">
                                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                                    <Select label="SAP Object" isRequired placeholder="Select" selectedKey={draft.sapObject || null} onSelectionChange={(k) => setDraft({ ...draft, sapObject: k as string })} items={items(SAP_OBJECTS)}>
                                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                    </Select>

                                    <Select
                                        label="Parameter Type"
                                        isRequired
                                        placeholder="Select"
                                        selectedKey={draft.parameterType || null}
                                        onSelectionChange={(k) => setDraft({ ...draft, parameterType: k as string, parameter: "", customParameter: "" })}
                                        items={items(PARAMETER_TYPES)}
                                    >
                                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                    </Select>
                                </div>

                                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                                    <div className="flex flex-col gap-1.5">
                                        <Select
                                            label="Parameter"
                                            isRequired
                                            placeholder="Select"
                                            isDisabled={!draft.parameterType}
                                            selectedKey={draft.parameter || null}
                                            onSelectionChange={(k) => setDraft({ ...draft, parameter: k as string })}
                                            items={items([...parameterOptions, "Custom"])}
                                        >
                                            {(item) => <Select.Item id={item.id}>{parameterLabel(draft.parameterType, item.label ?? "")}</Select.Item>}
                                        </Select>
                                        {draft.parameter === "Custom" && (
                                            <Input aria-label="Custom parameter" placeholder="Enter parameter name..." value={draft.customParameter} onChange={(v) => setDraft({ ...draft, customParameter: v })} />
                                        )}
                                    </div>

                                    <Select label="Validation" isRequired placeholder="Select" selectedKey={draft.operator || null} onSelectionChange={(k) => setDraft({ ...draft, operator: k as string })} items={items(OPERATORS)}>
                                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                    </Select>

                                    <div className="flex flex-col gap-1.5">
                                        {isFailedLogins ? (
                                            <Input label="Expected Value" isRequired type="number" placeholder="e.g. 3" value={draft.expectedValue} onChange={(v) => setDraft({ ...draft, expectedValue: v })} />
                                        ) : (
                                            <>
                                                <Select
                                                    label="Expected Value"
                                                    isRequired
                                                    placeholder="Select"
                                                    selectedKey={draft.expectedValue || null}
                                                    onSelectionChange={(k) => setDraft({ ...draft, expectedValue: k as string })}
                                                    items={items([...KNOWN_EXPECTED, "Custom"])}
                                                >
                                                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                                                </Select>
                                                {draft.expectedValue === "Custom" && (
                                                    <Input aria-label="Custom expected value" placeholder="Enter custom expected value..." value={draft.customExpectedValue} onChange={(v) => setDraft({ ...draft, customExpectedValue: v })} />
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6 flex justify-end gap-3">
                                <Button color="secondary" onClick={() => setIsRuleDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button iconLeading={Plus} onClick={confirmAddRule}>
                                    Add Rule
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </div>
    );
};
