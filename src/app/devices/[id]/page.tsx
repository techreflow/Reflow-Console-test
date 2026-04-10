"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { getDeviceDetails, getUserEmail, getUserName, getToken } from "@/lib/api";
import { useProjects } from "@/lib/ProjectsContext";
import { useMqttDevice } from "@/lib/useMqttDevice";
import {
    AreaChart, Area, ResponsiveContainer, Tooltip as RechartTooltip,
} from "recharts";
import {
    RefreshCw, Play, Settings2, Radio, Cpu, Wifi,
    Terminal, ArrowUp, Minus, Info, Save,
    TrendingUp, TrendingDown, Trash2, Download,
} from "lucide-react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface DeviceInfo {
    id: string;
    name: string;
    serialNumber: string;
    status: string;
    lastSeen: string;
    description?: string;
}

interface CommandLog {
    ts: string;
    topic: string;
    payload: Record<string, string | number>;
}

type FactorOperation = 0 | 1 | 2 | 3;

interface ChannelCalibration {
    name: string;
    min: number;
    max: number;
    fac: FactorOperation;
    cal: number;
    thresholdMin: number | null;
    thresholdMax: number | null;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function formatLastSeen(iso: string | undefined): string {
    if (!iso) return "Unknown";
    const d = new Date(iso);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
}

const SPARK_COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899"];
const FACTOR_OPTIONS: Array<{ value: FactorOperation; label: string }> = [
    { value: 0, label: "Addition" },
    { value: 1, label: "Subtraction" },
    { value: 2, label: "Multiplication" },
    { value: 3, label: "Division" },
];

function toFiniteNumber(value: unknown, fallback = 0): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function normalizeRange(min: number, max: number): { min: number; max: number } {
    return min <= max ? { min, max } : { min: max, max: min };
}

function clampWithin(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function parseFactorOperation(raw: unknown): FactorOperation {
    if (typeof raw === "string") {
        const normalized = raw.trim().toLowerCase();
        if (normalized.includes("add")) return 0;
        if (normalized.includes("sub")) return 1;
        if (normalized.includes("mul")) return 2;
        if (normalized.includes("div")) return 3;
    }
    const asNum = Number(raw);
    if (Number.isInteger(asNum) && asNum >= 0 && asNum <= 3) {
        return asNum as FactorOperation;
    }
    return 0;
}

function sanitizeCalibrationValue(value: number, fac: FactorOperation): number {
    if (fac === 3) {
        return value > 0 ? value : 0.01;
    }
    return value;
}

function computeLocalCalibratedValue(rawValue: unknown, fac: FactorOperation, cal: number): number | null {
    const raw = Number(rawValue);
    const factor = Number(cal);
    if (!Number.isFinite(raw) || !Number.isFinite(factor)) return null;

    switch (fac) {
        case 0:
            return raw + factor;
        case 1:
            return raw - factor;
        case 2:
            return raw * factor;
        case 3:
            if (factor <= 0) return null;
            return raw / factor;
        default:
            return raw + factor;
    }
}

function firstString(...values: unknown[]): string {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
}

function getErrorMessage(err: unknown): string {
    if (err instanceof Error && err.message) return err.message;
    return String(err || "");
}

// ─────────────────────────────────────────────
// Spark chart component
// ─────────────────────────────────────────────
function SparkChart({ data, dataKey, color }: {
    data: Record<string, string | number>[];
    dataKey: string;
    color: string;
}) {
    if (data.length < 2) return <div className="h-10 flex items-center justify-center text-[10px] text-text-muted">Waiting…</div>;
    return (
        <ResponsiveContainer width="100%" height={40}>
            <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                <defs>
                    <linearGradient id={`sg-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                </defs>
                <Area
                    type="monotone"
                    dataKey={dataKey}
                    stroke={color}
                    strokeWidth={1.5}
                    fill={`url(#sg-${dataKey})`}
                    dot={false}
                    isAnimationActive={false}
                />
                <RechartTooltip
                    contentStyle={{ fontSize: "10px", padding: "2px 6px", borderRadius: "6px" }}
                    formatter={(v: number) => [Number(v).toFixed(2), dataKey]}
                    labelFormatter={() => ""}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export default function DeviceConfigPage() {
    const params = useParams();
    const router = useRouter();
    const email = getUserEmail();
    const fullName = getUserName();
    const deviceId = params.id as string;
    const { removeDeviceFromCache, refresh } = useProjects();

    // Device info
    const [device, setDevice] = useState<DeviceInfo | null>(null);
    const [loadingDevice, setLoadingDevice] = useState(true);

    // Config params
    const [bufferSize, setBufferSize] = useState("512 KB");
    const [savingConfig, setSavingConfig] = useState(false);
    const [configSaved, setConfigSaved] = useState(false);
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

    // Calibration config — populated from GET /device/:id/mqtt/config
    // Starts empty; Save is disabled until config is successfully loaded
    const [calibration, setCalibration] = useState<Record<string, ChannelCalibration>>({});
    const [configLoading, setConfigLoading] = useState(false);
    const [configError, setConfigError]   = useState<string | null>(null);
    const [configDiscarded, setConfigDiscarded] = useState<{ key: string; reason: string }[]>([]);

    // Command log — session-only, last 5 payloads
    const [commandLog, setCommandLog] = useState<CommandLog[]>([]);





    // ── Fetch device details ──────────────────
    useEffect(() => {
        async function loadDevice() {
            setLoadingDevice(true);
            try {
                const res = await getDeviceDetails(deviceId);
                const payload = res?.data ?? res ?? {};
                const wrapper = (payload && typeof payload === "object") ? payload : {};
                const d = wrapper?.device || res?.device || wrapper;
                if (d) {
                    const serial = firstString(
                        d.serialNumber,
                        d.serial_no,
                        wrapper.serialNumber,
                        wrapper.serial_no,
                        deviceId
                    );
                    const resolvedDeviceId = firstString(
                        d.deviceId,
                        d.device_id,
                        d.id,
                        d._id,
                        wrapper.deviceId,
                        wrapper.device_id,
                        wrapper.id,
                        wrapper._id,
                        deviceId
                    );

                    setDevice({
                        id: resolvedDeviceId,
                        name: d.name || serial || deviceId,
                        serialNumber: serial || deviceId,
                        status: d.status || "unknown",
                        lastSeen: formatLastSeen(d.lastSeen || d.updatedAt),
                        description: d.description || "",
                    });
                }
            } catch (err) {
                console.error("Failed to load device:", err);
            } finally {
                setLoadingDevice(false);
            }
        }
        loadDevice();
    }, [deviceId]);

    // ── MQTT real-time via shared hook ────────
    const { channels, isOnline, checked, lastSync, mqttError, history, sensorErr, updateTs, rawData } = useMqttDevice(
        device?.serialNumber,
        3000,   // poll every 3s
        60,     // keep 60 history points for sparks
    );

    const hasInvalidDivisionCalibration = useMemo(
        () => Object.values(calibration).some((ch) => ch.fac === 3 && Number(ch.cal) <= 0),
        [calibration]
    );

    // ── Load calibration config from backend ──
    useEffect(() => {
        if (!device?.serialNumber) return;
        const token = getToken();
        async function loadConfig() {
            setConfigLoading(true);
            setConfigError(null);
            try {
                const res = await fetch(`/api/device-config?serialId=${device!.serialNumber}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.status === 401) {
                    setConfigError("Session expired — please log in again.");
                    return;
                }
                if (!res.ok) {
                    setConfigError(`Failed to load config (HTTP ${res.status}).`);
                    return;
                }
                const json = await res.json();
                // Determine channel count dynamically from SNO1, SNO2… keys
                const cfg = json?.data?.config;
                if (!cfg) { setConfigError("No config data returned by server."); return; }
                let channelCount = 0;
                while (cfg[`SNO${channelCount + 1}`] !== undefined) channelCount++;
                if (channelCount === 0) { setConfigError("Device has no channels in config."); return; }
                const updated: Record<string, ChannelCalibration> = {};
                for (let i = 1; i <= channelCount; i++) {
                    const rawMin = toFiniteNumber(cfg[`MIN${i}`], 0);
                    const rawMax = toFiniteNumber(cfg[`MAX${i}`], 100);
                    const { min, max } = normalizeRange(rawMin, rawMax);
                    const thresholdMin = toNullableNumber(
                        cfg[`ALERTMIN${i}`] ??
                        cfg[`THMIN${i}`] ??
                        cfg[`THRESH_MIN${i}`] ??
                        cfg[`THRMIN${i}`] ??
                        cfg[`TMIN${i}`]
                    );
                    const thresholdMax = toNullableNumber(
                        cfg[`ALERTMAX${i}`] ??
                        cfg[`THMAX${i}`] ??
                        cfg[`THRESH_MAX${i}`] ??
                        cfg[`THRMAX${i}`] ??
                        cfg[`TMAX${i}`]
                    );
                    updated[`CH${i}`] = {
                        name: String(cfg[`SNO${i}`] ?? `Channel ${i}`).trim(),
                        min,
                        max,
                        fac: parseFactorOperation(cfg[`FAC${i}`]),
                        cal: sanitizeCalibrationValue(
                            toFiniteNumber(cfg[`CAL${i}`], 0),
                            parseFactorOperation(cfg[`FAC${i}`])
                        ),
                        thresholdMin: thresholdMin === null ? min : clampWithin(thresholdMin, min, max),
                        thresholdMax: thresholdMax === null ? max : clampWithin(thresholdMax, min, max),
                    };
                }
                setCalibration(updated);
            } catch (err) {
                console.error("Failed to load device config:", err);
                setConfigError("Network error — could not reach server.");
            } finally {
                setConfigLoading(false);
            }
        }
        loadConfig();
    }, [device?.serialNumber]);

    // ── Save calibration to backend ───────────
    const handleSaveCalibration = async () => {
        if (!device?.serialNumber) return;
        if (hasInvalidDivisionCalibration) {
            alert("Division operation requires CAL greater than 0.");
            return;
        }
        setSavingConfig(true);
        setConfigSaved(false);
        setConfigDiscarded([]);
        const token = getToken();
        try {
            // Build config from whatever channels were loaded from the backend
            const config: Record<string, string | number> = {};
            Object.entries(calibration).forEach(([key, ch], idx) => {
                const parsedIndex = Number.parseInt(key.replace("CH", ""), 10);
                const i = Number.isFinite(parsedIndex) ? parsedIndex : idx + 1;
                const { min, max } = normalizeRange(toFiniteNumber(ch.min, 0), toFiniteNumber(ch.max, 0));
                const rawAlertMin = ch.thresholdMin ?? min;
                const rawAlertMax = ch.thresholdMax ?? max;
                const { min: alertMin, max: alertMax } = normalizeRange(
                    clampWithin(rawAlertMin, min, max),
                    clampWithin(rawAlertMax, min, max)
                );
                config[`SNO${i}`] = ch.name;
                config[`MIN${i}`] = min;
                config[`MAX${i}`] = max;
                config[`ALERTMIN${i}`] = alertMin;
                config[`ALERTMAX${i}`] = alertMax;
                config[`FAC${i}`] = parseFactorOperation(ch.fac);
                config[`CAL${i}`] = sanitizeCalibrationValue(
                    toFiniteNumber(ch.cal, 0),
                    parseFactorOperation(ch.fac)
                );
            });
            const res = await fetch(`/api/device-config?serialId=${device.serialNumber}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ config }),
            });
            const json = await res.json();
            if (res.ok && json?.status === "success") {
                setConfigSaved(true);
                setTimeout(() => setConfigSaved(false), 3000);
                if (json?.data?.discardedKeys?.length) {
                    setConfigDiscarded(json.data.discardedKeys);
                }
                setCommandLog((prev) => [
                    { ts: new Date().toLocaleTimeString(), topic: `backend:device/${device.serialNumber}/mqtt/config`, payload: config },
                    ...prev,
                ].slice(0, 5));
            } else {
                console.error("Config publish failed:", json);
            }
        } catch (err) {
            console.error("Failed to save config:", err);
        } finally {
            setSavingConfig(false);
        }
    };

    const updateChannelCalibration = (key: string, updater: (current: ChannelCalibration) => ChannelCalibration) => {
        setCalibration((prev) => {
            const current = prev[key];
            if (!current) return prev;
            return { ...prev, [key]: updater(current) };
        });
    };

    const handleRangeChange = (key: string, field: "min" | "max", rawValue: string) => {
        updateChannelCalibration(key, (current) => {
            const nextValue = toFiniteNumber(rawValue, current[field]);
            const normalized = field === "min"
                ? normalizeRange(nextValue, current.max)
                : normalizeRange(current.min, nextValue);

            let thresholdMin = current.thresholdMin;
            let thresholdMax = current.thresholdMax;

            if (thresholdMin !== null) thresholdMin = clampWithin(thresholdMin, normalized.min, normalized.max);
            if (thresholdMax !== null) thresholdMax = clampWithin(thresholdMax, normalized.min, normalized.max);
            if (thresholdMin !== null && thresholdMax !== null && thresholdMin > thresholdMax) {
                thresholdMax = thresholdMin;
            }

            return {
                ...current,
                min: normalized.min,
                max: normalized.max,
                thresholdMin,
                thresholdMax,
            };
        });
    };

    const handleThresholdChange = (key: string, field: "thresholdMin" | "thresholdMax", rawValue: string) => {
        updateChannelCalibration(key, (current) => {
            const parsed = toNullableNumber(rawValue);
            if (parsed === null) {
                return { ...current, [field]: null };
            }

            const clamped = clampWithin(parsed, current.min, current.max);
            let thresholdMin = field === "thresholdMin" ? clamped : current.thresholdMin;
            let thresholdMax = field === "thresholdMax" ? clamped : current.thresholdMax;

            if (thresholdMin !== null && thresholdMax !== null && thresholdMin > thresholdMax) {
                if (field === "thresholdMin") thresholdMax = thresholdMin;
                else thresholdMin = thresholdMax;
            }

            return { ...current, thresholdMin, thresholdMax };
        });
    };

    // ── Delete device ─────────────────────────
    const handleDeleteDevice = async () => {
        if (!confirm("Are you sure you want to delete this device? This action cannot be undone.")) return;
        try {
            const { deleteDevice } = await import("@/lib/api");
            const deleteCandidates = Array.from(new Set(
                [device?.id, deviceId, device?.serialNumber]
                    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
                    .map((value) => value.trim())
            ));

            let lastError: unknown = null;
            for (let i = 0; i < deleteCandidates.length; i++) {
                const candidate = deleteCandidates[i];
                try {
                    await deleteDevice(candidate);
                    const ids = Array.from(new Set([device?.id, deviceId, candidate].filter(Boolean) as string[]));
                    const serials = Array.from(new Set([device?.serialNumber].filter(Boolean) as string[]));
                    removeDeviceFromCache({ ids, serials });
                    router.push("/devices");
                    // Refetch in background to confirm backend state and avoid stale rows.
                    void refresh();
                    setTimeout(() => {
                        void refresh();
                    }, 1500);
                    return;
                } catch (err) {
                    lastError = err;
                    const msg = getErrorMessage(err).toLowerCase();
                    const isNotFound = msg.includes("404") || msg.includes("not found");
                    const hasMoreCandidates = i < deleteCandidates.length - 1;
                    if (!(isNotFound && hasMoreCandidates)) {
                        throw err;
                    }
                }
            }
            throw lastError ?? new Error("Failed to delete device");
        } catch (err) {
            console.error("Failed to delete device:", err);
            const msg = getErrorMessage(err);
            alert(msg || "Failed to delete device");
        }
    };

    // ── Export channel buffer as CSV ──────────
    const handleExportCSV = () => {
        if (history.length === 0) return;
        const headers = ["time", "CH1", "CH2", "CH3", "CH4", "CH5", "CH6"];
        const rows = history.map((row) =>
            headers.map((h) => (row[h] !== undefined ? row[h] : "")).join(",")
        );
        const csv = [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${device?.serialNumber || deviceId}_channels.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── Derived status ────────────────────────
    const statusColor = !checked
        ? "bg-slate-100 text-slate-600"
        : isOnline
            ? "bg-success/10 text-success"
            : "bg-red-100 text-red-600";
    const dotColor = !checked ? "bg-slate-400" : isOnline ? "bg-success" : "bg-red-500";

    // Message rate: use intervals (samples - 1) over elapsed time, capped at 12 msg/min.
    const msgRate = useMemo(() => {
        if (history.length < 2) return 0;
        const firstTs = Number(history[0]?.ts);
        const lastTs = Number(history[history.length - 1]?.ts);
        if (!Number.isFinite(firstTs) || !Number.isFinite(lastTs) || lastTs <= firstTs) return 0;
        const elapsedSec = (lastTs - firstTs) / 1000;
        if (elapsedSec <= 0) return 0;
        const perMinute = ((history.length - 1) / elapsedSec) * 60;
        return Math.min(12, Math.max(0, Math.round(perMinute)));
    }, [history]);
    const signalPct = Math.min(100, Math.round((msgRate / 12) * 100));

    return (
        <DashboardLayout
            title="Device Configuration"
            breadcrumbs={[
                { label: "Devices", href: "/devices" },
                { label: device?.name || deviceId },
                { label: "Configuration" },
            ]}
            user={{ name: fullName || "", email: email || "" }}
        >
            <div className="space-y-6">
                {/* Device Header */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="rounded-xl bg-white border border-border-subtle p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-xl bg-surface-muted flex items-center justify-center">
                            <Cpu className="w-7 h-7 text-text-muted" />
                        </div>
                        <div>
                            {loadingDevice ? (
                                <div className="h-5 w-40 bg-surface-muted animate-pulse rounded mb-2" />
                            ) : (
                                <div className="flex items-center gap-3">
                                    <h2 className="text-xl font-bold text-text-primary">
                                        {device?.name || deviceId}
                                    </h2>
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${statusColor}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${checked && isOnline ? "animate-pulse" : ""}`} />
                                        {!checked ? "Checking..." : isOnline ? "Online" : "Offline"}
                                    </span>
                                    {sensorErr && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                                            Sensor Fault
                                        </span>
                                    )}
                                </div>
                            )}
                            <div className="flex items-center gap-3 mt-1 text-sm text-text-muted">
                                <span className="flex items-center gap-1">
                                    <Settings2 className="w-3.5 h-3.5" />
                                    {device?.serialNumber || deviceId}
                                </span>
                                {device?.lastSeen && (
                                    <><span>•</span><span>Last seen: {device.lastSeen}</span></>
                                )}
                                {lastSync && (
                                    <><span>•</span><span className="text-green-600">MQTT sync: {lastSync}</span></>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsConfigModalOpen(true)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-primary text-primary text-sm font-medium hover:bg-primary/5 transition-colors"
                        >
                            <Settings2 className="w-4 h-4" />
                            Set/Edit Parameters
                        </button>
                        <button
                            onClick={() => window.location.reload()}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border-subtle text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Refresh
                        </button>
                        <button
                            onClick={handleDeleteDevice}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete
                        </button>
                        <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors">
                            <Play className="w-4 h-4" />
                            Remote Control
                        </button>
                    </div>
                </motion.div>

                {/* Configuration Modal */}
                {isConfigModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-text-primary/40 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            className="bg-white rounded-2xl shadow-xl border border-border-subtle w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
                        >
                            <div className="flex items-center justify-between p-5 border-b border-border-subtle bg-surface-muted/30">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                        <Settings2 className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-text-primary">Configuration Parameters</h3>
                                        <p className="text-xs text-text-muted">Edit global settings and channel calibration</p>
                                    </div>
                                </div>
                                <button onClick={() => setIsConfigModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:bg-surface-muted hover:text-text-primary transition-colors">
                                    <span className="text-2xl leading-none">&times;</span>
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-8">
                                {/* Global params */}
                                <div className="grid grid-cols-1 sm:grid-cols-1 gap-6">
                                    <div>
                                        <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5 block">Buffer Size</label>
                                        <select value={bufferSize} onChange={(e) => setBufferSize(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border-subtle bg-white text-sm focus:border-primary outline-none cursor-pointer">
                                            <option>128 KB</option><option>256 KB</option><option>512 KB</option><option>1 MB</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Calibration Table */}
                                <div>
                                    <h4 className="text-sm font-bold text-text-primary mb-3">Channel Calibration</h4>

                                    {/* Loading state */}
                                    {configLoading && (
                                        <div className="flex items-center justify-center py-12 gap-3 text-text-muted">
                                            <span className="w-5 h-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                                            <span className="text-sm font-medium">Loading device config…</span>
                                        </div>
                                    )}

                                    {/* Error state */}
                                    {!configLoading && configError && (
                                        <div className="flex items-start gap-2 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                                            <span className="text-lg leading-none">⚠</span>
                                            <div>
                                                <p className="font-bold">Failed to load config</p>
                                                <p className="text-xs mt-0.5">{configError}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Table — only when data is loaded */}
                                    {!configLoading && !configError && Object.keys(calibration).length > 0 && (
                                        <div className="border border-border-subtle rounded-xl shadow-sm overflow-hidden">
                                            <div className="overflow-x-auto">
                                                <table className="w-full min-w-[1150px] text-left text-sm">
                                                    <thead className="bg-surface-muted text-[11px] uppercase tracking-wider text-text-muted">
                                                        <tr>
                                                            <th className="px-4 py-3 font-bold border-b border-border-subtle">Channel Name (SNO)</th>
                                                            <th className="px-4 py-3 font-bold text-center border-b border-border-subtle">Range (MIN – MAX)</th>
                                                            <th className="px-4 py-3 font-bold text-center border-b border-border-subtle">Alert Threshold (MIN – MAX)</th>
                                                            <th className="px-4 py-3 font-bold text-center border-b border-border-subtle">Factor (Operation)</th>
                                                            <th className="px-4 py-3 font-bold text-center border-b border-border-subtle">Calibration (CAL)</th>
                                                            <th className="px-4 py-3 font-bold text-right border-b border-border-subtle">Raw Value</th>
                                                            <th className="px-4 py-3 font-bold text-right border-b border-border-subtle">Calibrated Value</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-border-subtle">
                                                        {Object.entries(calibration).map(([key, ch]) => {
                                                            const channelIndex = Number.parseInt(key.replace("CH", ""), 10);
                                                            const rawVal = rawData[`RawCH${channelIndex}`];
                                                            const calVal = computeLocalCalibratedValue(rawVal, ch.fac, ch.cal);
                                                            const thresholdInvalid = (
                                                                (ch.thresholdMin !== null && (ch.thresholdMin < ch.min || ch.thresholdMin > ch.max)) ||
                                                                (ch.thresholdMax !== null && (ch.thresholdMax < ch.min || ch.thresholdMax > ch.max)) ||
                                                                (ch.thresholdMin !== null && ch.thresholdMax !== null && ch.thresholdMin > ch.thresholdMax)
                                                            );
                                                            const divisionInvalid = ch.fac === 3 && Number(ch.cal) <= 0;

                                                            return (
                                                                <tr key={key} className="hover:bg-surface-muted/30 transition-colors">
                                                                    <td className="px-4 py-3">
                                                                        <div className="flex items-center gap-3">
                                                                            <span className="font-mono font-bold text-text-muted text-xs bg-surface-muted px-2 py-1 rounded">{key}</span>
                                                                            <input
                                                                                type="text"
                                                                                value={ch.name}
                                                                                onChange={(e) => updateChannelCalibration(key, (current) => ({ ...current, name: e.target.value }))}
                                                                                className="w-full px-2 py-1.5 rounded border border-border-subtle text-sm font-semibold focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-shadow"
                                                                                placeholder="Name"
                                                                            />
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-3">
                                                                        <div className="flex items-center justify-center gap-2">
                                                                            <input
                                                                                type="number"
                                                                                value={ch.min}
                                                                                onChange={(e) => handleRangeChange(key, "min", e.target.value)}
                                                                                className="w-20 px-2 py-1.5 rounded border border-border-subtle text-center text-sm font-mono focus:border-primary outline-none"
                                                                            />
                                                                            <span className="text-text-muted font-bold">–</span>
                                                                            <input
                                                                                type="number"
                                                                                value={ch.max}
                                                                                onChange={(e) => handleRangeChange(key, "max", e.target.value)}
                                                                                className="w-20 px-2 py-1.5 rounded border border-border-subtle text-center text-sm font-mono focus:border-primary outline-none"
                                                                            />
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-3">
                                                                        <div className="flex items-center justify-center gap-2">
                                                                            <input
                                                                                type="number"
                                                                                value={ch.thresholdMin ?? ""}
                                                                                onChange={(e) => handleThresholdChange(key, "thresholdMin", e.target.value)}
                                                                                className={`w-20 px-2 py-1.5 rounded border text-center text-sm font-mono focus:border-primary outline-none ${thresholdInvalid ? "border-red-300" : "border-border-subtle"}`}
                                                                                placeholder="Min"
                                                                            />
                                                                            <span className="text-text-muted font-bold">–</span>
                                                                            <input
                                                                                type="number"
                                                                                value={ch.thresholdMax ?? ""}
                                                                                onChange={(e) => handleThresholdChange(key, "thresholdMax", e.target.value)}
                                                                                className={`w-20 px-2 py-1.5 rounded border text-center text-sm font-mono focus:border-primary outline-none ${thresholdInvalid ? "border-red-300" : "border-border-subtle"}`}
                                                                                placeholder="Max"
                                                                            />
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-3">
                                                                        <div className="flex justify-center">
                                                                            <select
                                                                                value={ch.fac}
                                                                                onChange={(e) => updateChannelCalibration(key, (current) => ({
                                                                                    ...current,
                                                                                    fac: parseFactorOperation(Number(e.target.value)),
                                                                                    cal: sanitizeCalibrationValue(
                                                                                        toFiniteNumber(current.cal, 0),
                                                                                        parseFactorOperation(Number(e.target.value))
                                                                                    ),
                                                                                }))}
                                                                                className="w-36 px-2 py-1.5 rounded border border-border-subtle text-sm font-medium text-center bg-white focus:border-primary outline-none"
                                                                            >
                                                                                {FACTOR_OPTIONS.map((option) => (
                                                                                    <option key={option.value} value={option.value}>
                                                                                        {option.label}
                                                                                    </option>
                                                                                ))}
                                                                            </select>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-3">
                                                                        <div className="flex justify-center">
                                                                            <input
                                                                                type="number"
                                                                                step="0.01"
                                                                                min={ch.fac === 3 ? 0.01 : undefined}
                                                                                value={ch.cal}
                                                                                onChange={(e) => updateChannelCalibration(key, (current) => ({
                                                                                    ...current,
                                                                                    cal: sanitizeCalibrationValue(
                                                                                        toFiniteNumber(e.target.value, current.cal),
                                                                                        current.fac
                                                                                    ),
                                                                                }))}
                                                                                className={`w-24 px-2 py-1.5 rounded border text-center text-sm font-bold text-primary focus:border-primary outline-none ${
                                                                                    divisionInvalid ? "border-red-300" : "border-border-subtle"
                                                                                }`}
                                                                            />
                                                                        </div>
                                                                        {divisionInvalid && (
                                                                            <p className="mt-1 text-[10px] text-red-600 text-center font-semibold">
                                                                                CAL must be &gt; 0 for Division
                                                                            </p>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right">
                                                                        <span className="font-mono font-black text-primary bg-primary/5 px-2 py-1 rounded text-sm">
                                                                            {rawVal !== null && rawVal !== undefined ? Number(rawVal).toFixed(2) : "—"}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right">
                                                                        <span className="font-mono font-black text-text-primary bg-surface-muted px-2 py-1 rounded text-sm">
                                                                            {calVal !== null && calVal !== undefined ? Number(calVal).toFixed(2) : "—"}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Discarded keys warning */}
                                    {configDiscarded.length > 0 && (
                                        <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                                            <p className="font-bold mb-1">⚠ Some keys were discarded by the server:</p>
                                            {configDiscarded.map((d, i) => (
                                                <p key={i}><code className="font-mono">{d.key}</code> — {d.reason}</p>
                                            ))}
                                        </div>
                                    )}

                                    {!configLoading && !configError && (
                                        <div className="flex items-start gap-2 p-3 mt-3 rounded-lg bg-primary/5 border border-primary/10">
                                            <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                                            <div className="text-xs text-text-muted space-y-1">
                                                <p>
                                                    Calibrated Value is calculated in this panel from Raw MQTT value + selected Factor/CAL, so you can preview before publish.
                                                </p>
                                                <p>
                                                    Publish sends SNO, range, alert thresholds (`ALERTMINx/ALERTMAXx`), factor-operation and calibration fields.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-5 border-t border-border-subtle bg-surface-muted/30 flex justify-end gap-3 rounded-b-2xl">
                                <button
                                    onClick={() => setIsConfigModalOpen(false)}
                                    className="px-5 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveCalibration}
                                    disabled={savingConfig || configLoading || Object.keys(calibration).length === 0 || hasInvalidDivisionCalibration}
                                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {savingConfig ? (
                                        <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                    ) : <Save className="w-4 h-4" />}
                                    {savingConfig ? "Publishing…" : configSaved ? "Published ✓" : "Publish Config"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}


                {/* Live Data Stream - FULL WIDTH */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.15 }}
                    className="rounded-xl bg-white border border-border-subtle p-6 shadow-sm"
                >
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Radio className="w-4 h-4 text-primary" />
                            </div>
                            <h3 className="text-base font-bold text-text-primary">Live Data Stream</h3>
                        </div>
                        {mqttError ? (
                            <span className="text-xs font-medium text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200">Broker offline</span>
                        ) : (
                            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-success bg-success/10 px-3 py-1.5 rounded-full">
                                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                                LIVE SYNC
                            </div>
                        )}
                    </div>

                    {/* Table header */}
                    <div className="grid grid-cols-[3fr_2fr_1.5fr] gap-x-4 px-4 py-3 bg-surface-muted rounded-t-lg text-xs font-bold text-text-muted uppercase tracking-wider border border-border-subtle border-b-0">
                        <span>Channel</span>
                        <span className="text-center">Trend (30pt)</span>
                        <span className="text-right">Live Value</span>
                    </div>

                    <div className="divide-y divide-border-subtle border border-border-subtle rounded-b-lg">
                        {channels.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center bg-surface-muted/30">
                                {mqttError ? (
                                    <p className="text-sm text-text-muted">
                                        Could not connect to MQTT broker. Check credentials in{" "}
                                        <code className="text-xs bg-surface-muted px-1 py-0.5 rounded border border-border-subtle shadow-sm">.env.local</code>.
                                    </p>
                                ) : (
                                    <p className="text-sm font-medium text-text-muted animate-pulse">Waiting for MQTT telemetry…</p>
                                )}
                            </div>
                        ) : (
                            channels.map((ch, i) => {
                                const chKey = `CH${ch.index}`;
                                // Use the name from calibration config (e.g. "RO Feed PH") if loaded
                                const displayName = calibration[chKey]?.name || ch.name;
                                return (
                                    <div key={ch.channel} className="grid grid-cols-[3fr_2fr_1.5fr] gap-x-4 items-center px-4 py-3 hover:bg-surface-muted/30 transition-colors">
                                        <div>
                                            <p className="text-sm font-bold text-text-primary mb-0.5">{displayName}</p>
                                            <div className="flex items-center gap-2">
                                                <span className="inline-flex text-[10px] font-mono font-bold text-text-muted bg-surface-muted px-1.5 py-0.5 rounded">{ch.channel}</span>
                                            </div>
                                        </div>
                                        {/* Spark chart */}
                                        <div className="px-2">
                                            <SparkChart
                                                data={history.slice(-30)}
                                                dataKey={chKey}
                                                color={SPARK_COLORS[i % SPARK_COLORS.length]}
                                            />
                                        </div>
                                        <div className="flex items-center justify-end gap-2">
                                            <span className="text-lg font-black font-mono text-text-primary tracking-tight">
                                                {ch.value !== null ? Number(ch.value).toFixed(2) : "—"}
                                            </span>
                                            <div className="w-5 flex justify-center">
                                                {ch.trend === "up" && <TrendingUp className="w-4 h-4 text-primary" />}
                                                {ch.trend === "down" && <TrendingDown className="w-4 h-4 text-primary" />}
                                                {ch.trend === "warning" && <ArrowUp className="w-4 h-4 text-error" />}
                                                {ch.trend === "stable" && <Minus className="w-4 h-4 text-text-muted opacity-50" />}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <div className="flex items-center justify-between mt-5">
                        <p className="text-xs font-semibold text-text-muted bg-surface-muted px-2.5 py-1 rounded-full">
                            {channels.length > 0
                                ? `${channels.length} active channel${channels.length !== 1 ? "s" : ""} • Last sync: ${lastSync}`
                                : "No active channels"}
                        </p>
                        <button
                            onClick={() => router.push('/reports')}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-hover transition-colors rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5"
                        >
                            <Download className="w-3.5 h-3.5" />
                            Export Data
                        </button>
                    </div>
                </motion.div>

                {/* Bottom Status Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* System Health — MQTT-derived */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 }}
                        className="rounded-xl bg-white border border-border-subtle p-5"
                    >
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center">
                                <Cpu className="w-4 h-4 text-text-muted" />
                            </div>
                            <h4 className="text-sm font-bold text-text-primary">Message Rate</h4>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="text-text-muted">Message Rate</span>
                                    <span className="font-semibold text-text-primary">{msgRate} / 12 msg/min</span>
                                </div>
                                <div className="w-full h-2 bg-surface-muted rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-700"
                                        style={{
                                            width: `${signalPct}%`,
                                            backgroundColor: "#6b7280",
                                        }}
                                    />
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="text-text-muted">History Buffer</span>
                                    <span className="font-semibold text-text-primary">{history.length}/60 pts</span>
                                </div>
                                <div className="w-full h-2 bg-surface-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-primary rounded-full transition-all duration-700"
                                        style={{ width: `${(history.length / 60) * 100}%` }} />
                                </div>
                            </div>
                            <p className="text-[11px] text-text-muted">
                                {!checked
                                    ? "Checking MQTT telemetry..."
                                    : isOnline
                                        ? "Device actively sending data via MQTT"
                                        : "No data received for 1 minute — device may be offline"}
                            </p>
                        </div>
                    </motion.div>

                    {/* Network */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.25 }}
                        className="rounded-xl bg-white border border-border-subtle p-5"
                    >
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center">
                                <Wifi className="w-4 h-4 text-text-muted" />
                            </div>
                            <h4 className="text-sm font-bold text-text-primary">Network</h4>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${!checked ? "bg-slate-400 animate-pulse" : isOnline ? "bg-success animate-pulse" : "bg-red-500"}`} />
                            <span className="text-sm font-semibold text-text-primary">
                                {!checked ? "Checking..." : isOnline ? "Connected" : "Disconnected"}
                            </span>
                        </div>
                        <div className="space-y-1 text-xs text-text-muted">
                            <p>Protocol: MQTT over TCP</p>
                            {lastSync && <p className="text-green-600 font-medium">Last sync: {lastSync}</p>}
                        </div>
                    </motion.div>

                    {/* Last Commands — session log */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.3 }}
                        className="rounded-xl bg-white border border-border-subtle p-5"
                    >
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center">
                                <Terminal className="w-4 h-4 text-text-muted" />
                            </div>
                            <h4 className="text-sm font-bold text-text-primary">Last Commands</h4>
                        </div>
                        {commandLog.length === 0 ? (
                            <p className="text-xs text-text-muted">No commands sent this session.</p>
                        ) : (
                            <div className="space-y-2">
                                {commandLog.map((cmd, idx) => (
                                    <div key={idx} className="text-xs border-l-2 border-primary/30 pl-2">
                                        <span className="font-mono text-text-muted">{cmd.ts}</span>
                                        <p className="font-semibold text-text-primary truncate">{cmd.topic}</p>
                                        <p className="text-text-muted truncate">
                                            {Object.keys(cmd.payload).length} fields updated
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                </div>
            </div>
        </DashboardLayout>
    );
}
