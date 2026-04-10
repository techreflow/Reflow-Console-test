"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import {
    getAllProjects,
    getProjectDevices,
    isAuthenticated,
    normalizeProjectsResponse,
} from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────

interface Device {
    id?: string;
    _id?: string;
    serial_no?: string;
    serialNumber?: string;
    name?: string;
    description?: string;
    projectName?: string;
    projectId?: string;
}

interface Project {
    id?: string;
    _id?: string;
    name: string;
    description?: string;
    devices?: Device[];
    owner?: string;
    status?: string;
    createdBy?: { name?: string; email?: string };
    members?: { user?: { email?: string; name?: string }; role?: string }[];
    accessLevel?: string;
    createdAt?: string;
    updatedAt?: string;
}

interface ProjectsContextValue {
    projects: Project[];
    createdByMeProjects: Project[];
    sharedWithMeProjects: Project[];
    devices: Device[];
    loading: boolean;
    error: string | null;
    /** Force a fresh re-fetch from the backend */
    refresh: () => Promise<void>;
    /** Optimistically remove a deleted device from in-memory cache */
    removeDeviceFromCache: (matcher: { ids?: string[]; serials?: string[] }) => void;
    /** Get devices for a specific project */
    getDevicesForProject: (projectId: string) => Device[];
    /** Last fetch timestamp */
    lastFetched: number | null;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────

export function ProjectsProvider({ children }: { children: ReactNode }) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [createdByMeProjects, setCreatedByMeProjects] = useState<Project[]>([]);
    const [sharedWithMeProjects, setSharedWithMeProjects] = useState<Project[]>([]);
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastFetched, setLastFetched] = useState<number | null>(null);

    const fetchAll = useCallback(async () => {
        if (!isAuthenticated()) {
            setLoading(false);
            return;
        }

        // Rely solely on direct network fetching

        setLoading(true);
        setError(null);

        try {
            console.time("[Cache] fetchAll");

            const data = await getAllProjects();
            const normalized = normalizeProjectsResponse(data);
            const projectList = normalized.projects as Project[];
            const ownedList = normalized.createdByMe as Project[];
            const sharedList = normalized.sharedWithMe as Project[];

            // If projects already have devices nested, use them directly.
            // Otherwise fetch devices per project concurrently.
            const allDevices: Device[] = [];
            let needsDeviceFetch = false;

            for (const p of projectList) {
                if (!p.devices || !Array.isArray(p.devices) || p.devices.length === 0) {
                    needsDeviceFetch = true;
                    break;
                }
            }

            // Normalize a raw device object:
            // 1. Unwrap { device: {...} } wrapper if present
            // 2. Ensure serial_no / serialNumber are at top level
            const normalizeDevice = (raw: any, projectName: string, projectId: string): Device => {
                const wrapper = (raw && typeof raw === "object") ? raw : {};
                const nested = (wrapper as any).device;
                const d = (nested && typeof nested === "object") ? nested : wrapper;

                const serial =
                    d.serial_no || d.serialNumber || d.serialNo || d.serial_number ||
                    wrapper.serial_no || wrapper.serialNumber || wrapper.serialNo || wrapper.serial_number ||
                    d.id || d._id ||
                    wrapper.id || wrapper._id ||
                    "";

                // Prefer canonical device IDs from the device object first.
                // Wrapper-level IDs are used only as late fallbacks because some APIs wrap device rows.
                const canonicalId =
                    d.deviceId || d.device_id || d.id || d._id ||
                    wrapper.deviceId || wrapper.device_id ||
                    wrapper.id || wrapper._id ||
                    serial;

                return {
                    id: canonicalId,
                    _id: d._id || d.id || wrapper._id || wrapper.id || canonicalId,
                    name: d.name || serial || "Unnamed",
                    serial_no: serial,
                    serialNumber: serial,
                    description: d.description || wrapper.description,
                    projectName,
                    projectId,
                };
            }

            if (needsDeviceFetch) {
                const results = await Promise.allSettled(
                    projectList.map(async (p) => {
                        const pId = p.id || p._id || "";
                        if (!pId) return [];
                        if (p.devices && Array.isArray(p.devices) && p.devices.length > 0) {
                            return p.devices;
                        }
                        try {
                            const res = await getProjectDevices(pId);
                            const devs = res?.data?.devices || res?.devices || [];
                            p.devices = devs; // attach to project
                            return devs;
                        } catch {
                            return [];
                        }
                    })
                );

                for (let i = 0; i < projectList.length; i++) {
                    const result = results[i];
                    const pId = projectList[i].id || projectList[i]._id || "";
                    const devs = result.status === "fulfilled" ? result.value : [];
                    for (const d of devs) {
                        allDevices.push(normalizeDevice(d, projectList[i].name, pId));
                    }
                }
            } else {
                // All projects already have devices
                for (const p of projectList) {
                    const pId = p.id || p._id || "";
                    for (const d of (p.devices || [])) {
                        allDevices.push(normalizeDevice(d, p.name, pId));
                    }
                }
            }

            setProjects(projectList);
            setCreatedByMeProjects(ownedList);
            setSharedWithMeProjects(sharedList);
            setDevices(allDevices);
            setLastFetched(Date.now());
            console.timeEnd("[Cache] fetchAll");
        } catch (err) {
            // Retry once after a short delay to handle transient failures
            console.warn("[Cache] First fetch attempt failed, retrying in 2s…", err);
            try {
                await new Promise((r) => setTimeout(r, 2000));
                const data = await getAllProjects();
                const normalized = normalizeProjectsResponse(data);
                const projectList = normalized.projects as Project[];
                const ownedList = normalized.createdByMe as Project[];
                const sharedList = normalized.sharedWithMe as Project[];
                setProjects(projectList);
                setCreatedByMeProjects(ownedList);
                setSharedWithMeProjects(sharedList);
                setLastFetched(Date.now());
                console.log("[Cache] Retry succeeded");
            } catch (retryErr) {
                console.error("[Cache] Retry also failed:", retryErr);
                setError("Could not load data. Please check your connection.");
            }
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch on mount
    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    const getDevicesForProject = useCallback(
        (projectId: string) => {
            return devices.filter((d) => d.projectId === projectId);
        },
        [devices]
    );

    const removeDeviceFromCache = useCallback((matcher: { ids?: string[]; serials?: string[] }) => {
        const idSet = new Set((matcher.ids || []).map((v) => String(v || "").trim()).filter(Boolean));
        const serialSet = new Set((matcher.serials || []).map((v) => String(v || "").trim()).filter(Boolean));
        if (idSet.size === 0 && serialSet.size === 0) return;

        const shouldRemove = (value: unknown, nestedValue?: unknown) => {
            const selfId = String((value as any)?.id || (value as any)?._id || "").trim();
            const selfSerial = String(
                (value as any)?.serial_no ||
                (value as any)?.serialNumber ||
                (value as any)?.serialNo ||
                (value as any)?.serial_number ||
                ""
            ).trim();
            const nestedId = String((nestedValue as any)?.id || (nestedValue as any)?._id || "").trim();
            const nestedSerial = String(
                (nestedValue as any)?.serial_no ||
                (nestedValue as any)?.serialNumber ||
                (nestedValue as any)?.serialNo ||
                (nestedValue as any)?.serial_number ||
                ""
            ).trim();

            return (
                (selfId && idSet.has(selfId)) ||
                (nestedId && idSet.has(nestedId)) ||
                (selfSerial && serialSet.has(selfSerial)) ||
                (nestedSerial && serialSet.has(nestedSerial))
            );
        };

        setDevices((prev) => prev.filter((d) => !shouldRemove(d)));
        setProjects((prev) =>
            prev.map((project) => {
                if (!Array.isArray(project.devices)) return project;
                return {
                    ...project,
                    devices: project.devices.filter((dev: any) => !shouldRemove(dev, dev?.device)),
                };
            })
        );
    }, []);

    return (
        <ProjectsContext.Provider
            value={{
                projects,
                createdByMeProjects,
                sharedWithMeProjects,
                devices,
                loading,
                error,
                refresh: fetchAll,
                removeDeviceFromCache,
                getDevicesForProject,
                lastFetched,
            }}
        >
            {children}
        </ProjectsContext.Provider>
    );
}

// ── Hook ─────────────────────────────────────────────────────────

export function useProjects() {
    const ctx = useContext(ProjectsContext);
    if (!ctx) {
        throw new Error("useProjects must be used within a ProjectsProvider");
    }
    return ctx;
}
