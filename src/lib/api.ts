/**
 * ReFlow Backend API Service
 * 
 * Connects to the real ReFlow backend at https://reflow-backend.fly.dev/api/v1
 * All endpoints use Bearer token authentication.
 */

const BASE_URL = process.env.NEXT_PUBLIC_REFLOW_API_URL || "https://reflow-backend.fly.dev/api/v1";

function mergeHeaders(...headerSets: Array<HeadersInit | undefined>): Headers {
    const headers = new Headers();

    for (const headerSet of headerSets) {
        if (!headerSet) continue;

        const nextHeaders = new Headers(headerSet);
        nextHeaders.forEach((value, key) => {
            headers.set(key, value);
        });
    }

    return headers;
}

// _options prevents type errors from existing { noStore: true } calls
function apiFetch(path: string, init: RequestInit = {}, _options?: { noStore?: boolean }) {
    return fetch(`${BASE_URL}${path}`, {
        ...init,
        headers: mergeHeaders(init.headers),
    });
}

export function getToken(): string {
    if (typeof window !== "undefined") {
        const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
        if (!token) {
            // Strictly enforce session bounds
            deleteCookie("auth_token");
            deleteCookie("username");
            deleteCookie("fullName");
            return "";
        }
        return token;
    }
    return "";
}

function getHeaders(): HeadersInit {
    const token = getToken();
    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}


async function handleResponse(res: Response) {
    let data;
    try {
        data = await res.json();
    } catch {
        data = null;
    }
    
    if (!res.ok || (data && data.success === false)) {
        throw new Error(data?.message || data?.error || `HTTP error ${res.status}`);
    }
    
    return data;
}

export interface ProjectRecord {
    id?: string;
    _id?: string;
    name?: string;
    accessLevel?: string;
    createdAt?: string;
    updatedAt?: string;
    createdBy?: { name?: string; email?: string };
    [key: string]: unknown;
}

interface ProjectStats {
    createdByMeCount: number;
    sharedWithMeCount: number;
    totalProjects: number;
}

export interface NormalizedProjectsPayload {
    projects: ProjectRecord[];
    createdByMe: ProjectRecord[];
    sharedWithMe: ProjectRecord[];
    stats: ProjectStats;
}

function toProjectArray(value: unknown): ProjectRecord[] {
    return Array.isArray(value) ? (value as ProjectRecord[]) : [];
}

function dedupeProjects(projects: ProjectRecord[]): ProjectRecord[] {
    const seen = new Set<string>();
    const deduped: ProjectRecord[] = [];

    for (const project of projects) {
        const id = String(project.id || project._id || project.name || Math.random());
        if (seen.has(id)) continue;
        seen.add(id);
        deduped.push(project);
    }

    return deduped;
}

export function isOwnerProject(
    project: { accessLevel?: string; createdBy?: { email?: string } },
    userEmail?: string
) {
    const access = (project.accessLevel || "").toLowerCase();
    if (access === "owner") return true;
    if (!userEmail) return false;
    return (project.createdBy?.email || "").toLowerCase() === userEmail.toLowerCase();
}

export function normalizeProjectsResponse(payload: unknown): NormalizedProjectsPayload {
    const root = (payload && typeof payload === "object") ? (payload as Record<string, unknown>) : {};
    const data = (root.data && typeof root.data === "object") ? (root.data as Record<string, unknown>) : null;

    const projectsNode = data?.projects ?? root.projects ?? data ?? payload;
    const projectsObject =
        projectsNode && typeof projectsNode === "object" && !Array.isArray(projectsNode)
            ? (projectsNode as Record<string, unknown>)
            : null;

    let createdByMe: ProjectRecord[] = [];
    let sharedWithMe: ProjectRecord[] = [];
    let flatProjects: ProjectRecord[] = [];

    if (Array.isArray(projectsNode)) {
        flatProjects = toProjectArray(projectsNode);
    } else if (projectsObject) {
        createdByMe = toProjectArray(projectsObject.createdByMe);
        sharedWithMe = toProjectArray(projectsObject.sharedWithMe);

        if (createdByMe.length || sharedWithMe.length) {
            flatProjects = [...createdByMe, ...sharedWithMe];
        } else if (Array.isArray(projectsObject.projects)) {
            flatProjects = toProjectArray(projectsObject.projects);
        }
    }

    const projects = dedupeProjects(flatProjects);

    if (!createdByMe.length && !sharedWithMe.length) {
        createdByMe = projects.filter((project) => (project.accessLevel || "").toLowerCase() === "owner");
        sharedWithMe = projects.filter((project) => (project.accessLevel || "").toLowerCase() !== "owner");
    }

    const statsNode =
        (projectsObject?.stats && typeof projectsObject.stats === "object")
            ? (projectsObject.stats as Record<string, unknown>)
            : null;

    return {
        projects,
        createdByMe,
        sharedWithMe,
        stats: {
            createdByMeCount: Number(statsNode?.createdByMeCount ?? createdByMe.length),
            sharedWithMeCount: Number(statsNode?.sharedWithMeCount ?? sharedWithMe.length),
            totalProjects: Number(statsNode?.totalProjects ?? projects.length),
        },
    };
}

// ──────────────────────────────
// Auth
// ──────────────────────────────

export async function signup(email: string, name: string, password: string, contactNumber?: string) {
    const res = await apiFetch("/auth/user/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password, ...(contactNumber ? { contactNumber } : {}) }),
    });
    return handleResponse(res);
}

export async function login(email: string, password: string) {
    const res = await apiFetch("/auth/user/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });
    return handleResponse(res);
}

// ──────────────────────────────
// Profile
// ──────────────────────────────

export async function getProfile() {
    const res = await apiFetch("/profile", {
        headers: getHeaders(),
    }, { noStore: true });
    return handleResponse(res);
}

export async function updateUserPassword(payload: {
    verificationCode: string;
    newPassword: string;
    confirmPassword: string;
}) {
    const res = await apiFetch("/profile/update/password", {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(payload),
    });
    return handleResponse(res);
}

export async function generateOTP(email: string, action: string = "signup") {
    const res = await apiFetch("/auth/user/generate/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, action }),
    });
    return handleResponse(res);
}

export async function verifyOTP(email: string, verificationCode: string) {
    const res = await apiFetch("/auth/user/verify/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, verificationCode }),
    });
    const data = await handleResponse(res);
    // Auto-save token with both sessionStorage and cookies
    if (data?.data?.token) {
        saveToken(data.data.token);
    }
    return data;
}

// ──────────────────────────────
// Organization
// ──────────────────────────────

export async function getOrganization() {
    try {
        const res = await apiFetch("/organization", {
            headers: getHeaders(),
        }, { noStore: true });

        // Don't use handleResponse here — it throws on non-200.
        // We need to gracefully distinguish "has org" from "no org".
        let data;
        try {
            data = await res.json();
        } catch {
            data = null;
        }

        if (!res.ok) {
            return { ok: false, status: res.status, ...(data || {}) };
        }

        return { ok: true, status: res.status, ...(data || {}) };
    } catch {
        return { ok: false, status: 0 };
    }
}

export async function createOrganization(name: string, description: string) {
    const res = await apiFetch("/organization", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ name, description }),
    });
    return handleResponse(res);
}

export async function updateOrganization(data: { name?: string; description?: string }) {
    const res = await apiFetch("/organization", {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(data),
    });
    return handleResponse(res);
}

export async function inviteToOrganization(email: string, role: string = "MEMBER") {
    const res = await apiFetch("/organization/invite", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ email, role }),
    });
    return handleResponse(res);
}

export async function removeMember(memberId: string) {
    const res = await apiFetch(`/organization/member/${memberId}`, {
        method: "DELETE",
        headers: getHeaders(),
    });
    return handleResponse(res);
}

export async function updateMemberRole(memberId: string, role: string) {
    const res = await apiFetch(`/organization/member/${memberId}/role`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify({ role }),
    });
    return handleResponse(res);
}

export async function leaveOrganization() {
    const res = await apiFetch("/organization/leave", {
        method: "POST",
        headers: getHeaders(),
    });
    return handleResponse(res);
}

export async function transferOwnership(newOwnerId: string) {
    const res = await apiFetch("/organization/transfer-ownership", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ newOwnerId }),
    });
    return handleResponse(res);
}

export async function getOrganizationActivities() {
    const res = await apiFetch("/organization/activities", {
        headers: getHeaders(),
    }, { noStore: true });
    return handleResponse(res);
}

// ──────────────────────────────
// Projects
// ──────────────────────────────

export async function getAllProjects() {
    const res = await apiFetch("/projects", {
        headers: getHeaders(),
    }, { noStore: true });
    return handleResponse(res);
}

export async function createProject(name: string, description: string) {
    const res = await apiFetch("/project", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ name, description }),
    });
    return handleResponse(res);
}

export async function updateProject(projectId: string, data: { name?: string; description?: string }) {
    const res = await apiFetch(`/project/${projectId}`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(data),
    });
    return handleResponse(res);
}

export async function deleteProject(projectId: string) {
    const res = await apiFetch(`/project/${projectId}`, {
        method: "DELETE",
        headers: getHeaders(),
    });
    return handleResponse(res);
}

export async function shareProject(projectId: string, userEmail: string, role: string = "EDITOR") {
    const res = await apiFetch(`/project/${projectId}/share`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ userEmail, role }),
    });
    return handleResponse(res);
}

// ──────────────────────────────
// Devices
// ──────────────────────────────

export async function getProjectDevices(projectId: string) {
    const res = await apiFetch(`/project/${projectId}/devices`, {
        headers: getHeaders(),
    }, { noStore: true });
    return handleResponse(res);
}

export async function getDeviceDetails(deviceId: string) {
    const res = await apiFetch(`/device/${deviceId}`, {
        headers: getHeaders(),
    }, { noStore: true });
    return handleResponse(res);
}

export async function createDevice(
    projectId: string,
    serialNumber: string,
    subscriptionKey: string,
    name: string,
    description: string
) {
    const res = await apiFetch(`/project/${projectId}/device`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ serialNumber, subscriptionKey, name, description }),
    });
    
    return handleResponse(res);
}

export async function updateDevice(deviceId: string, data: { name?: string; description?: string }) {
    const res = await apiFetch(`/device/${deviceId}`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(data),
    });
    return handleResponse(res);
}

export async function moveDevice(deviceId: string, newProjectId: string) {
    const res = await apiFetch(`/device/${deviceId}/move`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ newProjectId }),
    });
    return handleResponse(res);
}

export async function deleteDevice(deviceId: string) {
    const res = await apiFetch(`/device/${deviceId}`, {
        method: "DELETE",
        headers: getHeaders(),
    });
    return handleResponse(res);
}

export async function exportDeviceData(deviceId: string, startDate: string, endDate: string, interval?: string) {
    const body: any = { startDate, endDate };
    if (interval) body.interval = interval;
    
    const res = await apiFetch(`/device/${deviceId}/export`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(body),
    });
    return handleResponse(res);
}

// ──────────────────────────────
// Health
// ──────────────────────────────

export async function healthCheck() {
    const res = await apiFetch("/health", {}, { noStore: true });
    return handleResponse(res);
}

// ──────────────────────────────
// Token management helpers
// ──────────────────────────────

/**
 * Set cookie in browser (client-side only)
 * This is used to store auth token in cookies so middleware can access it
 */
function setCookie(name: string, value: string, days?: number) {
    if (typeof document === "undefined") return; // Skip on server
    let expires = "";
    if (days) {
        const date = new Date();
        date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
        expires = `expires=${date.toUTCString()}; `;
    }
    // Format: name=value; expires=...; path=/; SameSite=Lax; secure (if HTTPS)
    const cookieString = `${name}=${encodeURIComponent(value)}; ${expires}path=/; SameSite=Lax`;
    console.log(`[SetCookie] Setting: ${name}`);
    document.cookie = cookieString;
    
    // Verify cookie was set
    const testCookie = document.cookie.split(';').some(cookie => 
        cookie.trim().startsWith(name + '=')
    );
    console.log(`[SetCookie] Verified ${name}: ${testCookie}`);
}

/**
 * Get cookie from browser (client-side only)
 */
function getCookie(name: string): string | null {
    if (typeof document === "undefined") return null; // Skip on server
    const nameEQ = `${name}=`;
    const cookies = document.cookie.split(";");
    for (let cookie of cookies) {
        cookie = cookie.trim();
        if (cookie.startsWith(nameEQ)) {
            try {
                return decodeURIComponent(cookie.substring(nameEQ.length));
            } catch (e) {
                return cookie.substring(nameEQ.length);
            }
        }
    }
    return null;
}

/**
 * Delete cookie from browser (client-side only)
 */
function deleteCookie(name: string) {
    if (typeof document === "undefined") return; // Skip on server
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

function dispatchUserInfoChanged() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event("reflow:user-info-changed"));
}

export function isAuthenticated(): boolean {
    return !!getToken();
}

export function saveToken(token: string) {
    // Save to both localStorage/sessionStorage (client-side) and cookies (for middleware)
    localStorage.setItem("auth_token", token);
    sessionStorage.setItem("auth_token", token);
    setCookie("auth_token", token, 1); // 1 day expiry
}

export function clearAuth() {
    // Clear from sessionStorage
    sessionStorage.removeItem("auth_token");
    
    // Clear from localStorage
    localStorage.removeItem("auth_token");

    // Clear from cookies
    deleteCookie("auth_token");

    dispatchUserInfoChanged();
}

// ──────────────────────────────
// Token-based User Info (No Cache)
// ──────────────────────────────

function getJwtPayload() {
    const token = getToken();
    if (!token) return null;
    try {
        const payload = token.split('.')[1];
        if (!payload) return null;
        return JSON.parse(atob(payload));
    } catch (e) {
        return null;
    }
}

export function getUserEmail(): string {
    const payload = getJwtPayload();
    return payload?.email || "";
}

export function getUserName(): string {
    const payload = getJwtPayload();
    return payload?.name || payload?.fullName || "";
}

export function getStoredUserInfo() {
    return {
        email: getUserEmail(),
        name: getUserName(),
    };
}

// No-ops for removed cache setters to satisfy existing imports
export function saveUserInfo(email: string, name: string) {}
export function saveOrgConfirmed() {}
export function saveOrgSetupSkipped() {}
