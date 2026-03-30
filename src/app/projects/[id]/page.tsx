"use client";

import { useState, useMemo, Suspense } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import {
    deleteProject,
    getUserEmail, getUserName, isAuthenticated, isOwnerProject,
} from "@/lib/api";
import { useProjects } from "@/lib/ProjectsContext";
import { useMqttStatus } from "@/lib/useMqttDevice";
import {
    Plus, Search, Cpu, Wifi, WifiOff, AlertTriangle,
    Trash2, RefreshCw, ChevronLeft, ChevronRight,
} from "lucide-react";

// ─── MQTT status badge ──────────────────────────────────────────────────────
function DeviceMqttBadge({ serial }: { serial: string }) {
    const { isOnline, checked } = useMqttStatus(serial, 8000);

    if (!checked) {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
                Checking…
            </span>
        );
    }

    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                isOnline
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-700"
            }`}
        >
            <span
                className={`w-1.5 h-1.5 rounded-full ${
                    isOnline ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                }`}
            />
            {isOnline ? "Online" : "Offline"}
        </span>
    );
}

// ─── Main Page ──────────────────────────────────────────────────────────────
function ProjectDetailContent({ projectId }: { projectId: string }) {
    const router = useRouter();
    const { projects, devices: allCachedDevices, loading, refresh } = useProjects();
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 15;

    const email = getUserEmail();
    const fullName = getUserName();

    // Find project from cache
    const project = useMemo(() => {
        return projects.find((p) => (p.id || p._id) === projectId);
    }, [projects, projectId]);

    const projectName = project?.name || "Project";
    const isOwner = project ? isOwnerProject(project, email) : false;

    // Get devices for this project from cache
    const devices = useMemo(() => {
        return allCachedDevices
            .filter((d) => d.projectId === projectId)
            .map((d) => {
                const serial = d.serial_no || d.serialNumber || "";
                return {
                    id: d.id || d._id || serial,
                    name: d.name || serial || "Unnamed",
                    serialNo: serial || "—",
                    description: (d as any).description || "",
                };
            });
    }, [allCachedDevices, projectId]);

    // Filter
    const filtered = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return devices.filter(
            (d) =>
                d.name.toLowerCase().includes(q) ||
                d.serialNo.toLowerCase().includes(q)
        );
    }, [devices, searchQuery]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const handleRefresh = async () => {
        setRefreshing(true);
        await refresh();
        setRefreshing(false);
    };

    return (
        <DashboardLayout
            title={projectName}
            breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: projectName }]}
            user={{ name: fullName || "", email: email || "" }}
        >
            <div className="space-y-6">

                {/* ── Title Row ── */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900">{projectName}</h2>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">ID: {projectId}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
                            title="Refresh"
                        >
                            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                        </button>
                        <button
                            onClick={() => router.push(`/devices/add?projectId=${projectId}`)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                        >
                            <Plus className="w-4 h-4" /> Add Device
                        </button>
                        {isOwner && (
                            <button
                                onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
                                className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500 transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </motion.div>

                {/* ── Delete confirm ── */}
                <AnimatePresence>
                    {showDeleteConfirm && (
                        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                            className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <p className="text-sm font-semibold text-red-700">⚠ Delete this project? This cannot be undone.</p>
                            <div className="flex gap-2">
                                <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 rounded-lg border border-red-200 bg-white text-sm font-medium text-red-700">Cancel</button>
                                <button disabled={deleting} onClick={async () => {
                                    setDeleting(true);
                                    try { await deleteProject(projectId); await refresh(); router.push("/projects"); }
                                    catch { setDeleting(false); setShowDeleteConfirm(false); }
                                }} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60">
                                    {deleting ? "Deleting…" : "Yes, Delete"}
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Summary ── */}
                <div className="grid grid-cols-2 gap-4">
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        className="rounded-xl border border-blue-100 bg-blue-50 p-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                            <Cpu className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-800">{devices.length}</p>
                            <p className="text-xs text-slate-500">Total Devices</p>
                        </div>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                        className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                            <Wifi className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-800">Live</p>
                            <p className="text-xs text-slate-500">MQTT Status</p>
                        </div>
                    </motion.div>
                </div>

                {/* ── Device List ── */}
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-white border border-slate-100 overflow-hidden">

                    {/* Search bar */}
                    <div className="px-5 py-4 border-b border-slate-100">
                        <div className="relative max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search by name or serial…"
                                value={searchQuery}
                                onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                                className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-400"
                            />
                        </div>
                    </div>

                    {/* Column headers */}
                    <div className="grid grid-cols-[1.5fr_1.5fr_1fr] gap-4 px-5 py-2.5 bg-slate-50 border-b border-slate-100">
                        {["Device Name", "Serial Number", "MQTT Status"].map(h => (
                            <span key={h} className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{h}</span>
                        ))}
                    </div>

                    {/* Rows */}
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-2">
                            <p className="text-sm text-slate-500">Loading devices…</p>
                        </div>
                    ) : paginated.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                                <Cpu className="w-7 h-7 text-slate-400" />
                            </div>
                            <p className="text-sm font-medium text-slate-600">
                                {devices.length === 0 ? "No devices yet" : "No devices match your search"}
                            </p>
                            {devices.length === 0 && (
                                <button
                                    onClick={() => router.push(`/devices/add?projectId=${projectId}`)}
                                    className="mt-1 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                                >
                                    <Plus className="w-4 h-4" /> Add First Device
                                </button>
                            )}
                        </div>
                    ) : (
                        paginated.map((device, i) => (
                            <motion.div
                                key={device.serialNo + i}
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                transition={{ delay: i * 0.025 }}
                                onClick={() => router.push(`/devices/${device.id}`)}
                                className="grid grid-cols-[1.5fr_1.5fr_1fr] gap-4 px-5 py-3.5 items-center border-b border-slate-50 last:border-0 hover:bg-blue-50/60 transition-colors cursor-pointer"
                            >
                                {/* Device name */}
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-50 text-blue-500">
                                        <Cpu className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-800 truncate">{device.name}</p>
                                        {device.description && <p className="text-xs text-slate-400 mt-0.5 truncate">{device.description}</p>}
                                    </div>
                                </div>

                                {/* Serial */}
                                <div>
                                    <code className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-1.5 rounded-md font-mono w-fit border border-slate-200 shadow-sm">
                                        {device.serialNo}
                                    </code>
                                </div>

                                {/* MQTT Status */}
                                <div>
                                    {device.serialNo !== "—" ? (
                                        <DeviceMqttBadge serial={device.serialNo} />
                                    ) : (
                                        <span className="text-xs font-medium text-slate-400 px-2 py-1 bg-slate-50 rounded-full">No serial</span>
                                    )}
                                </div>
                            </motion.div>
                        ))
                    )}

                    {/* Footer / Pagination */}
                    {filtered.length > 0 && (
                        <div className="px-5 py-3 flex items-center justify-between border-t border-slate-100 bg-slate-50/50">
                            <span className="text-xs text-slate-500">
                                Showing <span className="font-medium text-blue-600">{paginated.length}</span> of <span className="font-medium">{filtered.length}</span> devices
                            </span>
                            {totalPages > 1 && (
                                <div className="flex items-center gap-1">
                                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                                        className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-white transition-colors disabled:opacity-40">
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                                        <button key={n} onClick={() => setPage(n)}
                                            className={`w-7 h-7 rounded-lg text-xs font-semibold flex items-center justify-center transition-colors ${page === n ? "bg-blue-600 text-white" : "border border-slate-200 text-slate-500 hover:bg-white"}`}>
                                            {n}
                                        </button>
                                    ))}
                                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                                        className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-white transition-colors disabled:opacity-40">
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </motion.div>
            </div>
        </DashboardLayout>
    );
}

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
    return <ProjectDetailContent projectId={params.id} />;
}
