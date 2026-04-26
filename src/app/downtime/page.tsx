"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { getToken, getUserEmail, getUserName, isAuthenticated } from "@/lib/api";
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from "recharts";
import {
    AlertTriangle,
    BarChart3,
    Building2,
    Check,
    Cpu,
    Loader2,
    RefreshCw,
} from "lucide-react";

type Scope = "organization" | "device";
type PeriodKey = "1w" | "2w" | "3m";

interface ApiReport {
    scheduledDate?: string;
    averageDeviation?: number;
    avgDeviation?: number;
    validDeviationCount?: number;
    deviceId?: string;
    deviceName?: string;
    projectName?: string;
}

interface ApiChannelReport {
    scheduledDate?: string;
    channels?: Array<{
        channelId?: string;
        deviation?: number;
    }>;
}

interface NormalizedReport {
    date: string;
    deviation: number;
    validCount: number;
}

interface NormalizedChannelReport {
    date: string;
    channels: Record<string, number>;
}

interface ChartPoint {
    label: string;
    dateLabel: string;
    deviation: number | null;
    validCount: number;
}

interface ChannelChartPoint {
    label: string;
    dateLabel: string;
    [key: string]: string | number | null;
}

interface ChannelSeries {
    id: string;
    key: string;
    label: string;
    color: string;
    average: number;
    highest: number;
}

interface DeviceOption {
    id: string;
    label: string;
}

interface DeviationMeta {
    organizationName: string;
    deviceName?: string;
    totalDevices?: number;
    deviceIds: string[];
}

const FALLBACK_API_BASE = "https://reflow-backend.fly.dev/api/v1";
const ENV_API_BASE = (process.env.NEXT_PUBLIC_REFLOW_API_URL || FALLBACK_API_BASE).replace(/\/+$/, "");
const API_BASE_CANDIDATES = Array.from(new Set([ENV_API_BASE, FALLBACK_API_BASE].filter(Boolean)));

const PERIODS: Array<{ key: PeriodKey; label: string; days: number; buckets: number }> = [
    { key: "1w", label: "1 Week", days: 7, buckets: 7 },
    { key: "2w", label: "2 Weeks", days: 14, buckets: 14 },
    { key: "3m", label: "3 Months", days: 84, buckets: 12 },
];

const CHANNEL_COLORS = [
    "#2563eb",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#06b6d4",
    "#ec4899",
    "#64748b",
];

function round1(value: number): number {
    return Math.round(value * 10) / 10;
}

function clampPercent(value: number): number {
    return round1(Math.max(0, Math.min(100, value)));
}

function getDeviationTextClass(value: number | null | undefined): string {
    if (typeof value !== "number") return "text-text-primary";
    if (value < 30) return "text-emerald-600";
    if (value < 60) return "text-amber-600";
    return "text-red-600";
}

function dateFromKey(key: string): Date {
    return new Date(`${key}T00:00:00`);
}

function toDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function formatShortDate(dateKey: string): string {
    return dateFromKey(dateKey).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
    });
}

function formatWeekday(dateKey: string): string {
    return dateFromKey(dateKey).toLocaleDateString("en-IN", {
        weekday: "short",
    });
}

function normalizeReports(reports: ApiReport[] = []): NormalizedReport[] {
    return reports
        .map((report) => {
            const date = report.scheduledDate || "";
            const rawDeviation = report.averageDeviation ?? report.avgDeviation;
            const deviation = typeof rawDeviation === "number" && Number.isFinite(rawDeviation) ? rawDeviation : null;
            if (!date || deviation === null) return null;
            return {
                date,
                deviation: clampPercent(deviation),
                validCount: Number(report.validDeviationCount || 0),
            };
        })
        .filter((report): report is NormalizedReport => Boolean(report))
        .sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeChannelReports(reports: ApiChannelReport[] = []): NormalizedChannelReport[] {
    return reports
        .map((report) => {
            const date = report.scheduledDate || "";
            if (!date || !Array.isArray(report.channels)) return null;

            const channels = report.channels.reduce<Record<string, number>>((acc, channel) => {
                const channelId = String(channel.channelId || "").trim();
                const deviation = channel.deviation;
                if (!channelId || typeof deviation !== "number" || !Number.isFinite(deviation)) return acc;
                acc[channelId] = clampPercent(deviation);
                return acc;
            }, {});

            if (Object.keys(channels).length === 0) return null;
            return { date, channels };
        })
        .filter((report): report is NormalizedChannelReport => Boolean(report))
        .sort((a, b) => a.date.localeCompare(b.date));
}

function getLatestReportDate(reports: NormalizedReport[]): Date {
    if (reports.length === 0) return new Date();
    return dateFromKey(reports[reports.length - 1].date);
}

function buildChartData(reports: NormalizedReport[], periodKey: PeriodKey): ChartPoint[] {
    const period = PERIODS.find((item) => item.key === periodKey) || PERIODS[0];
    const latestDate = getLatestReportDate(reports);
    const startDate = addDays(latestDate, -(period.days - 1));
    const byDate = new Map(reports.map((report) => [report.date, report]));

    if (period.key === "1w" || period.key === "2w") {
        return Array.from({ length: period.days }, (_, index) => {
            const current = addDays(startDate, index);
            const date = toDateKey(current);
            const report = byDate.get(date);
            return {
                label: period.key === "1w" ? formatWeekday(date) : formatShortDate(date),
                dateLabel: date,
                deviation: report?.deviation ?? null,
                validCount: report?.validCount ?? 0,
            };
        });
    }

    return Array.from({ length: period.buckets }, (_, bucketIndex) => {
        const bucketStart = addDays(startDate, bucketIndex * 7);
        const bucketEnd = addDays(bucketStart, 6);
        const bucketReports = reports.filter((report) => {
            const reportDate = dateFromKey(report.date);
            return reportDate >= bucketStart && reportDate <= bucketEnd;
        });
        const weightedTotal = bucketReports.reduce((sum, report) => sum + report.deviation * Math.max(1, report.validCount), 0);
        const weight = bucketReports.reduce((sum, report) => sum + Math.max(1, report.validCount), 0);

        return {
            label: `Week ${bucketIndex + 1}`,
            dateLabel: `${formatShortDate(toDateKey(bucketStart))} - ${formatShortDate(toDateKey(bucketEnd))}`,
            deviation: weight > 0 ? round1(weightedTotal / weight) : null,
            validCount: bucketReports.reduce((sum, report) => sum + report.validCount, 0),
        };
    });
}

function getChannelIds(reports: NormalizedChannelReport[]): string[] {
    const ids = new Set<string>();
    reports.forEach((report) => {
        Object.keys(report.channels).forEach((channelId) => ids.add(channelId));
    });

    return Array.from(ids).sort((a, b) => {
        const aNumber = Number(a);
        const bNumber = Number(b);
        if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;
        return a.localeCompare(b);
    });
}

function getChannelKey(channelId: string): string {
    return `channel_${channelId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

function getChannelColor(channelId: string): string {
    const numericId = Number(channelId);
    if (Number.isFinite(numericId) && numericId > 0) {
        return CHANNEL_COLORS[(numericId - 1) % CHANNEL_COLORS.length];
    }

    const hash = channelId.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return CHANNEL_COLORS[hash % CHANNEL_COLORS.length];
}

function buildChannelChartData(
    reports: NormalizedChannelReport[],
    periodKey: PeriodKey,
    channelIds: string[],
): ChannelChartPoint[] {
    const period = PERIODS.find((item) => item.key === periodKey) || PERIODS[0];
    const latestDate = reports.length ? dateFromKey(reports[reports.length - 1].date) : new Date();
    const startDate = addDays(latestDate, -(period.days - 1));
    const byDate = new Map(reports.map((report) => [report.date, report]));

    if (period.key === "1w" || period.key === "2w") {
        return Array.from({ length: period.days }, (_, index) => {
            const current = addDays(startDate, index);
            const date = toDateKey(current);
            const report = byDate.get(date);
            const point: ChannelChartPoint = {
                label: period.key === "1w" ? formatWeekday(date) : formatShortDate(date),
                dateLabel: date,
            };

            channelIds.forEach((channelId) => {
                point[getChannelKey(channelId)] = report?.channels[channelId] ?? null;
            });

            return point;
        });
    }

    return Array.from({ length: period.buckets }, (_, bucketIndex) => {
        const bucketStart = addDays(startDate, bucketIndex * 7);
        const bucketEnd = addDays(bucketStart, 6);
        const bucketReports = reports.filter((report) => {
            const reportDate = dateFromKey(report.date);
            return reportDate >= bucketStart && reportDate <= bucketEnd;
        });
        const point: ChannelChartPoint = {
            label: `Week ${bucketIndex + 1}`,
            dateLabel: `${formatShortDate(toDateKey(bucketStart))} - ${formatShortDate(toDateKey(bucketEnd))}`,
        };

        channelIds.forEach((channelId) => {
            const values = bucketReports
                .map((report) => report.channels[channelId])
                .filter((value): value is number => typeof value === "number");
            point[getChannelKey(channelId)] = values.length
                ? round1(values.reduce((sum, value) => sum + value, 0) / values.length)
                : null;
        });

        return point;
    });
}

function averageDeviation(points: ChartPoint[]): number {
    const values = points.map((point) => point.deviation).filter((value): value is number => typeof value === "number");
    if (values.length === 0) return 0;
    return round1(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function highestDeviation(points: ChartPoint[]): ChartPoint | null {
    return points.reduce<ChartPoint | null>((highest, point) => {
        if (typeof point.deviation !== "number") return highest;
        if (!highest || point.deviation > (highest.deviation ?? 0)) return point;
        return highest;
    }, null);
}

function lowestDeviation(points: ChartPoint[]): ChartPoint | null {
    return points.reduce<ChartPoint | null>((lowest, point) => {
        if (typeof point.deviation !== "number") return lowest;
        if (!lowest || point.deviation < (lowest.deviation ?? 100)) return point;
        return lowest;
    }, null);
}

function buildChannelSeries(
    points: ChannelChartPoint[],
    channelIds: string[],
    channelNameMap: Record<string, string>,
): ChannelSeries[] {
    return channelIds.map((channelId) => {
        const key = getChannelKey(channelId);
        const values = points
            .map((point) => point[key])
            .filter((value): value is number => typeof value === "number");
        const configuredName = channelNameMap[channelId]?.trim();

        return {
            id: channelId,
            key,
            label: configuredName || `Channel ${channelId}`,
            color: getChannelColor(channelId),
            average: values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : 0,
            highest: values.length ? Math.max(...values) : 0,
        };
    });
}

async function fetchDeviationJson(path: string, token: string, signal: AbortSignal) {
    let lastError: Error | null = null;

    for (const baseUrl of API_BASE_CANDIDATES) {
        try {
            const response = await fetch(`${baseUrl}${path}`, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                signal,
            });

            const json = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(json?.message || `Request failed with ${response.status}`);
            }
            return json;
        } catch (error) {
            if ((error as { name?: string })?.name === "AbortError") throw error;
            lastError = error instanceof Error ? error : new Error("Failed to load deviation report");
        }
    }

    throw lastError || new Error("Failed to load deviation report");
}

export default function DowntimePage() {
    const email = getUserEmail();
    const fullName = getUserName();
    const token = getToken();

    const [scope, setScope] = useState<Scope>("organization");
    const [period, setPeriod] = useState<PeriodKey>("1w");
    const [selectedDevice, setSelectedDevice] = useState("");
    const [reports, setReports] = useState<NormalizedReport[]>([]);
    const [channelReports, setChannelReports] = useState<NormalizedChannelReport[]>([]);
    const [channelNameMap, setChannelNameMap] = useState<Record<string, string>>({});
    const [meta, setMeta] = useState<DeviationMeta>({ organizationName: "", deviceIds: [] });
    const [loading, setLoading] = useState(false);
    const [channelLoading, setChannelLoading] = useState(false);
    const [error, setError] = useState("");
    const [channelError, setChannelError] = useState("");

    useEffect(() => {
        if (!isAuthenticated()) {
            window.location.href = "/login";
        }
    }, []);

    const deviceOptions = useMemo<DeviceOption[]>(() => {
        return meta.deviceIds
            .filter(Boolean)
            .map((id) => ({
                id,
                label: id === selectedDevice && meta.deviceName ? `${meta.deviceName} (${id})` : id,
            }));
    }, [meta.deviceIds, meta.deviceName, selectedDevice]);

    const fallbackDeviceId = meta.deviceIds[0] || "";

    const loadReport = useCallback(async () => {
        if (!token) return;
        if (scope === "device") {
            setReports([]);
            setError("");
            return;
        }

        setLoading(true);
        setError("");
        const controller = new AbortController();

        try {
            const path = "/reports/organization/device/deviation";

            const json = await fetchDeviationJson(path, token, controller.signal);
            const data = json?.data || {};
            const nextReports = normalizeReports(Array.isArray(data.reports) ? data.reports : []);

            setReports(nextReports);
            setMeta((previous) => {
                const responseDeviceIds = Array.isArray(data.deviceIds) ? data.deviceIds : [];
                const deviceIdFromReport = data.device?.id ? [data.device.id] : [];
                const deviceIds = responseDeviceIds.length
                    ? responseDeviceIds
                    : Array.from(new Set([...previous.deviceIds, ...deviceIdFromReport]));

                return {
                    organizationName: data.organization?.name || previous.organizationName || "",
                    deviceName: data.device?.name,
                    totalDevices: data.totalDevices ?? previous.totalDevices,
                    deviceIds,
                };
            });

            if (!selectedDevice && scope === "organization") {
                const firstDevice = data.deviceIds?.[0] || "";
                if (firstDevice) setSelectedDevice(firstDevice);
            }
        } catch (err) {
            if ((err as { name?: string })?.name !== "AbortError") {
                setReports([]);
                setError(err instanceof Error ? err.message : "Failed to load deviation report.");
            }
        } finally {
            setLoading(false);
        }
    }, [scope, selectedDevice, token]);

    useEffect(() => {
        loadReport();
    }, [loadReport]);

    const loadChannelReport = useCallback(async () => {
        if (!token || scope !== "device") {
            setChannelReports([]);
            setChannelError("");
            return;
        }

        const deviceId = selectedDevice || fallbackDeviceId;
        if (!deviceId) {
            setChannelReports([]);
            setChannelError("");
            return;
        }

        setChannelLoading(true);
        setChannelError("");
        const controller = new AbortController();

        try {
            const json = await fetchDeviationJson(
                `/reports/user/device/${encodeURIComponent(deviceId)}/deviation/channel`,
                token,
                controller.signal,
            );
            const data = json?.data || {};
            setChannelReports(normalizeChannelReports(Array.isArray(data.reports) ? data.reports : []));
            setMeta((previous) => ({
                ...previous,
                organizationName: data.organization?.name || previous.organizationName || "",
                deviceName: data.device?.name || previous.deviceName,
                deviceIds: Array.from(new Set([...previous.deviceIds, data.device?.id].filter(Boolean))),
            }));
        } catch (err) {
            if ((err as { name?: string })?.name !== "AbortError") {
                setChannelReports([]);
                setChannelError(err instanceof Error ? err.message : "Failed to load channel-wise deviation report.");
            }
        } finally {
            setChannelLoading(false);
        }
    }, [fallbackDeviceId, scope, selectedDevice, token]);

    useEffect(() => {
        loadChannelReport();
    }, [loadChannelReport]);

    useEffect(() => {
        if (!token || scope !== "device") {
            setChannelNameMap({});
            return;
        }

        const deviceId = selectedDevice || fallbackDeviceId;
        if (!deviceId) {
            setChannelNameMap({});
            return;
        }

        let cancelled = false;

        async function loadChannelNames() {
            try {
                const response = await fetch(`/api/device-config?serialId=${encodeURIComponent(deviceId)}`, {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: "no-store",
                });
                if (!response.ok) {
                    if (!cancelled) setChannelNameMap({});
                    return;
                }

                const json = await response.json();
                const cfg = json?.data?.config;
                if (!cfg || typeof cfg !== "object") {
                    if (!cancelled) setChannelNameMap({});
                    return;
                }

                const next: Record<string, string> = {};
                let index = 1;
                while (cfg[`SNO${index}`] !== undefined) {
                    const label = String(cfg[`SNO${index}`] ?? "").trim();
                    if (label) {
                        const id = String(index);
                        next[id] = label;
                        next[`CH${id}`] = label;
                        next[`RawCH${id}`] = label;
                        next[`SNO${id}`] = label;
                    }
                    index += 1;
                }

                if (!cancelled) setChannelNameMap(next);
            } catch (err) {
                console.error("[Downtime] Failed to load channel names:", err);
                if (!cancelled) setChannelNameMap({});
            }
        }

        loadChannelNames();

        return () => {
            cancelled = true;
        };
    }, [fallbackDeviceId, scope, selectedDevice, token]);

    const chartData = useMemo(() => buildChartData(reports, period), [period, reports]);
    const channelIds = useMemo(() => getChannelIds(channelReports), [channelReports]);
    const channelChartData = useMemo(
        () => buildChannelChartData(channelReports, period, channelIds),
        [channelIds, channelReports, period],
    );
    const channelSeries = useMemo(
        () => buildChannelSeries(channelChartData, channelIds, channelNameMap),
        [channelChartData, channelIds, channelNameMap],
    );
    const hasChannelData = channelIds.length > 0 && channelChartData.some((point) =>
        channelIds.some((channelId) => typeof point[getChannelKey(channelId)] === "number"),
    );
    const average = useMemo(() => averageDeviation(chartData), [chartData]);
    const highest = useMemo(() => highestDeviation(chartData), [chartData]);
    const lowest = useMemo(() => lowestDeviation(chartData), [chartData]);
    const validReadingTotal = useMemo(() => chartData.reduce((sum, point) => sum + point.validCount, 0), [chartData]);
    const latestDate = reports[reports.length - 1]?.date || "";

    const pageTitle = scope === "organization" ? "Organization Deviation" : (meta.deviceName || selectedDevice || "Device Deviation");

    return (
        <DashboardLayout
            title="Downtime"
            subtitle="Deviation percentage trends from organization and device reports."
            breadcrumbs={[{ label: "Workspace", href: "/" }, { label: "Downtime" }]}
            user={{ name: fullName || "", email: email || "" }}
        >
            <div className="space-y-5">
                <section className="rounded-2xl border border-border-subtle bg-white p-4 sm:p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                                {meta.organizationName || "Deviation Report"}
                            </p>
                            <h2 className="mt-1 text-xl font-bold text-text-primary">{pageTitle}</h2>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="inline-flex rounded-xl border border-border-default bg-surface-muted p-1">
                                <button
                                    type="button"
                                    onClick={() => setScope("organization")}
                                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${scope === "organization" ? "bg-primary text-white" : "text-text-secondary"}`}
                                >
                                    <Building2 className="h-4 w-4" />
                                    Organization
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setScope("device")}
                                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${scope === "device" ? "bg-primary text-white" : "text-text-secondary"}`}
                                >
                                    <Cpu className="h-4 w-4" />
                                    Device
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    loadReport();
                                    loadChannelReport();
                                }}
                                disabled={loading || channelLoading}
                                className="inline-flex items-center gap-2 rounded-xl border border-border-default bg-white px-3 py-2 text-sm font-semibold text-text-secondary hover:border-primary/50 disabled:opacity-60"
                            >
                                {loading || channelLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                Refresh
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
                        <div className="flex flex-wrap gap-2">
                            {PERIODS.map((option) => (
                                <button
                                    key={option.key}
                                    type="button"
                                    onClick={() => setPeriod(option.key)}
                                    className={`rounded-xl border px-3 py-2 text-sm font-semibold ${period === option.key
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-border-default bg-white text-text-secondary hover:border-primary/40"
                                        }`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>

                        {scope === "device" && (
                            <select
                                value={selectedDevice}
                                onChange={(event) => setSelectedDevice(event.target.value)}
                                className="min-h-10 rounded-xl border border-border-default bg-white px-3 py-2 text-sm font-semibold text-text-primary outline-none focus:border-primary"
                            >
                                {deviceOptions.map((device) => (
                                    <option key={device.id} value={device.id}>
                                        {device.label}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                </section>

                {scope === "organization" && (
                    <section className="grid grid-cols-1 gap-3 md:grid-cols-5">
                        <div className="rounded-2xl border border-border-subtle bg-white p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Average Deviation</p>
                            <p className={`mt-2 text-2xl font-bold ${getDeviationTextClass(average)}`}>{average}%</p>
                        </div>
                        <div className="rounded-2xl border border-border-subtle bg-white p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Highest Deviation</p>
                            <p className={`mt-2 text-2xl font-bold ${getDeviationTextClass(highest?.deviation)}`}>{highest?.deviation ?? 0}%</p>
                        </div>
                        <div className="rounded-2xl border border-border-subtle bg-white p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Lowest Deviation</p>
                            <p className={`mt-2 text-2xl font-bold ${getDeviationTextClass(lowest?.deviation)}`}>{lowest?.deviation ?? 0}%</p>
                        </div>
                        <div className="rounded-2xl border border-border-subtle bg-white p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Valid Readings</p>
                            <p className="mt-2 text-2xl font-bold text-text-primary">{validReadingTotal}</p>
                        </div>
                        <div className="rounded-2xl border border-border-subtle bg-white p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Latest Report</p>
                            <p className="mt-2 text-2xl font-bold text-text-primary">{latestDate ? formatShortDate(latestDate) : "--"}</p>
                        </div>
                    </section>
                )}

                {error && (
                    <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                        <AlertTriangle className="h-4 w-4" />
                        {error}
                    </div>
                )}

                {scope === "organization" && (
                <section className="rounded-2xl border border-border-subtle bg-white p-4 sm:p-5">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h3 className="text-base font-bold text-text-primary">
                                Organization Bar Graph - {PERIODS.find((item) => item.key === period)?.label}
                            </h3>
                            <p className="text-xs text-text-muted">
                                {meta.totalDevices || deviceOptions.length || 0} devices · deviation in percentage
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {lowest && (
                                <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                                    <Check className="h-4 w-4" />
                                    Lowest {lowest.deviation}% on {lowest.dateLabel}
                                </div>
                            )}
                            {highest && (
                                <div className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                                    <BarChart3 className="h-4 w-4" />
                                    Peak {highest.deviation}% on {highest.dateLabel}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="h-[420px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 18, right: 18, left: 0, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} interval={period === "2w" ? 1 : 0} />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "#64748b" }} tickFormatter={(value) => `${value}%`} />
                                <Tooltip
                                    formatter={(value: number) => [`${value}%`, "Deviation"]}
                                    labelFormatter={(_, payload) => payload?.[0]?.payload?.dateLabel || ""}
                                    contentStyle={{ borderRadius: 12, borderColor: "#dbe3ef" }}
                                />
                                <Bar
                                    dataKey="deviation"
                                    name="Deviation"
                                    fill="#0ea5e9"
                                    radius={[8, 8, 0, 0]}
                                    label={{
                                        position: "top",
                                        formatter: (value: number | null) => (typeof value === "number" ? `${value}%` : ""),
                                        fontSize: 12,
                                        fill: "#0f172a",
                                        fontWeight: 700,
                                    }}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>
                )}

                {scope === "device" && (
                    <section className="rounded-2xl border border-border-subtle bg-white p-4 sm:p-5">
                        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h3 className="text-base font-bold text-text-primary">
                                    Channel-wise Deviation - {PERIODS.find((item) => item.key === period)?.label}
                                </h3>
                                <p className="text-xs text-text-muted">
                                    {selectedDevice || fallbackDeviceId || "Selected device"} · each channel shown as percentage deviation
                                </p>
                            </div>
                            {channelLoading && (
                                <div className="inline-flex items-center gap-2 rounded-xl bg-surface-muted px-3 py-2 text-sm font-semibold text-text-secondary">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading channels
                                </div>
                            )}
                        </div>

                        {channelError && (
                            <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                                <AlertTriangle className="h-4 w-4" />
                                {channelError}
                            </div>
                        )}

                        {hasChannelData ? (
                            <>
                                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                    {channelSeries.map((series) => (
                                        <div key={series.id} className="rounded-2xl border border-border-subtle bg-surface-muted p-4">
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className="h-3 w-3 rounded-full"
                                                    style={{ backgroundColor: series.color }}
                                                />
                                                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                                                    {series.label}
                                                </p>
                                            </div>
                                            <div className="mt-3 flex items-end justify-between gap-3">
                                                <div>
                                                    <p className="text-2xl font-bold text-text-primary">{series.average}%</p>
                                                    <p className="text-xs text-text-muted">Average</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-bold text-text-primary">{series.highest}%</p>
                                                    <p className="text-xs text-text-muted">Peak</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="h-[380px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={channelChartData} margin={{ top: 18, right: 18, left: 0, bottom: 4 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                            <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} interval={period === "2w" ? 1 : 0} />
                                            <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "#64748b" }} tickFormatter={(value) => `${value}%`} />
                                            <Tooltip
                                                formatter={(value: number, name: string) => [`${value}%`, name]}
                                                labelFormatter={(_, payload) => payload?.[0]?.payload?.dateLabel || ""}
                                                contentStyle={{ borderRadius: 12, borderColor: "#dbe3ef" }}
                                            />
                                            <Legend />
                                            {channelSeries.map((series) => (
                                                <Bar
                                                    key={series.key}
                                                    dataKey={series.key}
                                                    name={series.label}
                                                    fill={series.color}
                                                    radius={[7, 7, 0, 0]}
                                                />
                                            ))}
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </>
                        ) : (
                            <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-border-default bg-surface-muted p-6 text-center">
                                <div>
                                    <BarChart3 className="mx-auto h-8 w-8 text-text-muted" />
                                    <p className="mt-3 text-sm font-semibold text-text-secondary">
                                        {channelLoading ? "Loading channel-wise deviation..." : "No channel-wise deviation data available for this device."}
                                    </p>
                                </div>
                            </div>
                        )}
                    </section>
                )}
            </div>
        </DashboardLayout>
    );
}
