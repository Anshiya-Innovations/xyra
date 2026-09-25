import { useState } from "react";
import { Key01, Mail01 } from "@untitledui/icons";
import { useNavigate } from "react-router";
import { NotificationRegion } from "@/components/application/notification/notification";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { XyraMark } from "@/components/foundations/logo/xyra-logo";
import { AUTH_BASE_URL, TEST_SUBDOMAIN } from "@/lib/config";
import { MOCK_USERS, notifyBackendOffline } from "@/lib/mock-data";
import { saveSession } from "@/lib/session";

// Same 5 demo personas / role-matching rules as xyra-web's Login.controller.js
// (email-only login, no password — see xyra-core AuthService.login). `route`
// mirrors xyra-web's ROUTE_FOR_ROLE dispatch table - REV1/REV2 share the same
// REVIEWER role, so only the exact email (not role alone) tells them apart.
const PERSONAS = [
    { id: "ADMIN", label: "Admin", role: "ADMIN", email: "admin@xyrademo.test", route: "/dashboard" },
    { id: "ACM", label: "Escalation Manager", role: "ESCALATION_MANAGER", email: "escalationmanager@xyrademo.test", route: "/escalation-manager" },
    { id: "REV1", label: "Reviewer 1", role: "REVIEWER", email: "reviewer1@xyrademo.test", route: "/reviewer-1" },
    { id: "REV2", label: "Reviewer 2", role: "REVIEWER", email: "reviewer2@xyrademo.test", route: "/reviewer-2" },
    { id: "AUDITOR", label: "Auditor", role: "AUDITOR", email: "auditor@xyrademo.test", route: "/dashboard" },
] as const;

export const LoginPage = () => {
    const navigate = useNavigate();
    const [personaId, setPersonaId] = useState<string | null>(null);
    const [email, setEmail] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const onPersonaChange = (key: unknown) => {
        setPersonaId(key as string);
        const persona = PERSONAS.find((p) => p.id === key);
        if (persona) setEmail(persona.email);
    };

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const persona = PERSONAS.find((p) => p.id === personaId);
        if (!persona) {
            setError("Please select your persona.");
            return;
        }
        if (!email.trim()) {
            setError("Please enter your email.");
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch(`${AUTH_BASE_URL}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subdomain: TEST_SUBDOMAIN, email: email.trim() }),
            });
            const data = await res.json();

            if (!data.success) {
                setError(data.message || "Could not sign in with that email.");
                return;
            }
            if (data.role !== persona.role || data.email !== persona.email) {
                setError("This email doesn't match the selected persona.");
                return;
            }

            saveSession({
                userId: data.userId,
                tenantId: data.tenantId,
                subdomain: TEST_SUBDOMAIN,
                role: data.role,
                name: data.name,
                email: data.email,
            });
            navigate(persona.route);
        } catch {
            // xyra-core is unreachable, not just rejecting the login - let
            // the selected persona in anyway, backed by the same dummy
            // fixtures mock-data.ts falls back to everywhere else, so the
            // rest of the app has a session to render against.
            const mockUser = MOCK_USERS.find((u) => u.role === persona.role && u.email === persona.email);
            if (!mockUser) {
                setError("Could not reach the server, and no dummy data is available for that persona.");
                return;
            }
            notifyBackendOffline();
            saveSession({
                userId: mockUser.id,
                tenantId: null,
                subdomain: TEST_SUBDOMAIN,
                role: mockUser.role,
                name: mockUser.name,
                email: mockUser.email,
            });
            navigate(persona.route);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-dvh items-center justify-center bg-secondary px-4 py-12">
            <div className="w-full max-w-100 rounded-2xl bg-primary p-8 shadow-lg ring-1 ring-secondary">
                <div className="flex flex-col items-center gap-4">
                    <XyraMark className="h-9" />
                    <div className="flex flex-col items-center gap-1 text-center">
                        <h1 className="text-display-xs font-semibold text-primary">Welcome back!</h1>
                    </div>
                </div>

                <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
                    <Select
                        label="Persona"
                        isRequired
                        placeholder="Select persona"
                        selectedKey={personaId}
                        onSelectionChange={onPersonaChange}
                        items={PERSONAS.map((p) => ({ id: p.id, label: p.label }))}
                    >
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>

                    <Input label="Email" type="email" isRequired icon={Mail01} placeholder="you@xyrademo.test" value={email} onChange={setEmail} />

                    {error && <p className="text-sm text-error-primary">{error}</p>}

                    <Button type="submit" size="lg" isLoading={isLoading} className="w-full">
                        Sign In
                    </Button>

                    <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-border-secondary" />
                        <span className="text-xs font-medium text-tertiary">OR</span>
                        <div className="h-px flex-1 bg-border-secondary" />
                    </div>

                    <Button
                        type="button"
                        color="secondary"
                        size="lg"
                        iconLeading={Key01}
                        className="w-full"
                        onClick={() => setError("SSO sign-on isn't configured yet — use Persona + Email for now.")}
                    >
                        Sign in with SSO
                    </Button>
                </form>

                <div className="mt-8 flex flex-col items-center gap-0.5 text-xs text-tertiary">
                    <span>Version 1.0.0</span>
                    <span>© 2026 Forte Innovations</span>
                </div>
            </div>

            <NotificationRegion />
        </div>
    );
};
