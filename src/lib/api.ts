/**
 * ReFlow Backend API Service
 * 
 * Connects to the real ReFlow backend at https://reflow-backend.fly.dev/api/v1
 * All endpoints use Bearer token authentication.
 */

const BASE_URL = process.env.NEXT_PUBLIC_REFLOW_API_URL || "https://reflow-backend.fly.dev/api/v1";

function getToken(): string {
    if (typeof window !== "undefined") {
        const token = sessionStorage.getItem("auth_token");
        if (!token) {
            // Strictly enforce tab-level sessions
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

// ──────────────────────────────
// Auth
// ──────────────────────────────

export async function signup(email: string, name: string, password: string, contactNumber?: string) {
    const res = await fetch(`${BASE_URL}/auth/user/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password, ...(contactNumber ? { contactNumber } : {}) }),
    });
    return res.json();
}

export async function login(email: string, password: string) {
    const res = await fetch(`${BASE_URL}/auth/user/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });
    return res.json();
}

export async function generateOTP(email: string, action: string = "signup") {
    const res = await fetch(`${BASE_URL}/auth/user/generate/otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, action }),
    });
    return res.json();
}

export async function verifyOTP(email: string, verificationCode: string) {
    const res = await fetch(`${BASE_URL}/auth/user/verify/otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, verificationCode }),
    });
    const data = await res.json();
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
    const res = await fetch(`${BASE_URL}/organization`, {
        headers: getHeaders(),
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, ...data };
}

export async function createOrganization(name: string, description: string) {
    const res = await fetch(`${BASE_URL}/organization`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ name, description }),
    });
    return res.json();
}

export async function inviteToOrganization(email: string, role: string = "MEMBER") {
    const res = await fetch(`${BASE_URL}/organization/invite`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ email, role }),
    });
    return res.json();
}

export async function removeMember(memberId: string) {
    const res = await fetch(`${BASE_URL}/organization/member/${memberId}`, {
        method: "DELETE",
        headers: getHeaders(),
    });
    return res.json();
}

export async function leaveOrganization() {
    const res = await fetch(`${BASE_URL}/organization/leave`, {
        method: "POST",
        headers: getHeaders(),
    });
    return res.json();
}

export async function transferOwnership(newOwnerId: string) {
    const res = await fetch(`${BASE_URL}/organization/transfer-ownership`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ newOwnerId }),
    });
    return res.json();
}

export async function getOrganizationActivities() {
    const res = await fetch(`${BASE_URL}/organization/activities`, {
        headers: getHeaders(),
    });
    return res.json();
}

// ──────────────────────────────
// Projects
// ──────────────────────────────

export async function getAllProjects() {
    const res = await fetch(`${BASE_URL}/projects`, {
        headers: getHeaders(),
    });
    return res.json();
}

export async function createProject(name: string, description: string) {
    const res = await fetch(`${BASE_URL}/project`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ name, description }),
    });
    return res.json();
}

export async function deleteProject(projectId: string) {
    const res = await fetch(`${BASE_URL}/project/${projectId}`, {
        method: "DELETE",
        headers: getHeaders(),
    });
    return res.json();
}

export async function shareProject(projectId: string, userEmail: string, role: string = "EDITOR") {
    const res = await fetch(`${BASE_URL}/project/${projectId}/share`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ userEmail, role }),
    });
    return res.json();
}

// ──────────────────────────────
// Devices
// ──────────────────────────────

export async function getProjectDevices(projectId: string) {
    const res = await fetch(`${BASE_URL}/project/${projectId}/devices`, {
        headers: getHeaders(),
    });
    return res.json();
}

export async function getDeviceDetails(deviceId: string) {
    const res = await fetch(`${BASE_URL}/device/${deviceId}`, {
        headers: getHeaders(),
    });
    return res.json();
}

export async function createDevice(
    projectId: string,
    serialNumber: string,
    subscriptionKey: string,
    name: string,
    description: string
) {
    const res = await fetch(`${BASE_URL}/project/${projectId}/device`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ serialNumber, subscriptionKey, name, description }),
    });
    return res.json();
}

export async function updateDevice(deviceId: string, data: { name?: string; description?: string }) {
    const res = await fetch(`${BASE_URL}/device/${deviceId}`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(data),
    });
    return res.json();
}

export async function moveDevice(deviceId: string, newProjectId: string) {
    const res = await fetch(`${BASE_URL}/device/${deviceId}/move`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ newProjectId }),
    });
    return res.json();
}

export async function deleteDevice(deviceId: string) {
    const res = await fetch(`${BASE_URL}/device/${deviceId}`, {
        method: "DELETE",
        headers: getHeaders(),
    });
    return res.json();
}

export async function exportDeviceData(deviceId: string, startDate: string, endDate: string) {
    const res = await fetch(`${BASE_URL}/device/${deviceId}/export`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ startDate, endDate }),
    });
    return res.json();
}

// ──────────────────────────────
// Health
// ──────────────────────────────

export async function healthCheck() {
    const res = await fetch(`${BASE_URL}/health`);
    return res.json();
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

export function isAuthenticated(): boolean {
    return !!getToken();
}

export function saveToken(token: string) {
    // Save to both sessionStorage (client-side) and cookies (for middleware)
    sessionStorage.setItem("auth_token", token);
    setCookie("auth_token", token); // No expiry passed = session cookie
}

export function clearAuth() {
    // Clear from sessionStorage
    sessionStorage.removeItem("auth_token");
    sessionStorage.removeItem("username");
    sessionStorage.removeItem("fullName");
    sessionStorage.removeItem("org_confirmed");
    sessionStorage.removeItem("org_setup_skipped");
    
    // Clear from localStorage
    localStorage.removeItem("auth_token");

    // Clear from cookies
    deleteCookie("auth_token");
    deleteCookie("username");
    deleteCookie("fullName");
    deleteCookie("org_confirmed");
}

export function saveUserInfo(email: string, name: string) {
    // Save to sessionStorage (client-side)
    sessionStorage.setItem("username", email);
    sessionStorage.setItem("fullName", name);
    
    // Save to cookies (for middleware)
    setCookie("username", email);
    setCookie("fullName", name);
}

export function saveOrgConfirmed() {
    sessionStorage.setItem("org_confirmed", "true");
    setCookie("org_confirmed", "true");
}

export function saveOrgSetupSkipped() {
    sessionStorage.setItem("org_setup_skipped", "true");
    setCookie("org_setup_skipped", "true");
}

export function getUserEmail(): string {
    if (typeof window !== "undefined") {
        return sessionStorage.getItem("username") || "";
    }
    return "";
}

export function getUserName(): string {
    if (typeof window !== "undefined") {
        return sessionStorage.getItem("fullName") || "";
    }
    return "";
}
