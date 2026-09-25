// Same shape/storage strategy as xyra-web's webapp/model/session.js —
// sessionStorage, one JSON blob, no token yet (see AuthService.login).
const KEY = "xyra.session";

export type Session = {
    userId: string;
    tenantId: string | null;
    subdomain: string;
    role: string;
    name: string;
    email: string;
};

export function saveSession(session: Session) {
    sessionStorage.setItem(KEY, JSON.stringify(session));
}

export function getSession(): Session | null {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as Session;
    } catch {
        return null;
    }
}

export function clearSession() {
    sessionStorage.removeItem(KEY);
}
