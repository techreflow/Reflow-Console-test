"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw } from "lucide-react";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { getToken } from "@/lib/api";

interface ApiReport {
    scheduledDate?: string;
    averageDeviation?: number;
    avgDeviation?: number;
    validDeviationCount?: number;
}

interface TrendPoint {
    label: string;
    dateLabel: string;
    deviation: number | null;
    validCount: number;
}

const FALLBACK_API_BASE = "https://reflow-backend.fly.dev/api/v1";
const ENV_API_BASE = (process.env.NEXT_PUBLIC_REFLOW_API_URL || FALLBACK_API_BASE).replace(/\/+$/, "");
const API_BASE_CANDIDATES = Array.from(new Set([ENV_API_BASE, FALLBACK_API_BASE].filter(Boolean)));

function round1(value: number): number {
    return Math.round(value * 10) / 10;
}

function clampPercent(value: number): number {
    return round1(Math.max(0, Math.min(100, value)));
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

function formatWeekday(dateKey: string): string {
    return dateFromKey(dateKey).toLocaleDateString("en-IN", { weekday: "short" });
}

function getDeviationColor(value: number | null | undefined): string {
    if (typeof value !== "number") return "#cbd5e1";
    if (value < 30) return "#10b981";
    if (value < 60) return "#f59e0b";
    return "#ef4444";
}

function normalizeReports(reports: ApiReport[] = []): TrendPoint[] {
    const normalized = reports
        .map((report) => {
            const date = report.scheduledDate || "";
            const rawDeviation = report.averageDeviation ?? report.avgDeviation;
            if (!date || typeof rawDeviation !== "number" || !Number.isFinite(rawDeviation)) return null;
            return {
                date,
                deviation: clampPercent(rawDeviation),
                validCount: Number(report.validDeviationCount || 0),
            };
        })
        .filter((report): report is { date: string; deviation: number; validCount: number } => Boolean(report))
        .sort((a, b) => a.date.localeCompare(b.date));

    const latestDate = normalized.length ? dateFromKey(normalized[normalized.length - 1].date) : new Date();
    const startDate = addDays(latestDate, -6);
    const byDate = new Map(normalized.map((report) => [report.date, report]));

    return Array.from({ length: 7 }, (_, index) => {
        const current = addDays(startDate, index);
        const date = toDateKey(current);
        const report = byDate.get(date);
        return {
            label: formatWeekday(date),
            dateLabel: date,
            deviation: report?.deviation ?? null,
            validCount: report?.validCount ?? 0,
        };
    });
}

function averageDeviation(points: TrendPoint[]): number {
    const values = points.map((point) => point.deviation).filter((value): value is number => typeof value === "number");
    if (values.length === 0) return 0;
    return round1(values.reduce((sum, value) => sum + value, 0) / values.length);
}

async function fetchOrganizationDeviation(token: string, signal: AbortSignal) {
    let lastError: Error | null = null;

    for (const baseUrl of API_BASE_CANDIDATES) {
        try {
            const response = await fetch(`${baseUrl}/reports/organization/device/deviation`, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                signal,
            });
            const json = await response.json().catch(() => null);
            if (!response.ok) throw new Error(json?.message || `Request failed with ${response.status}`);
            return json;
        } catch (error) {
            if ((error as { name?: string })?.name === "AbortError") throw error;
            lastError = error instanceof Error ? error : new Error("Failed to load downtime report");
        }
    }

    throw lastError || new Error("Failed to load downtime report");
}

export default function DeviationWidget() {
    const router = useRouter();
    const [points, setPoints] = useState<TrendPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const average = useMemo(() => averageDeviation(points), [points]);
    const validReadings = useMemo(() => points.reduce((sum, point) => sum + point.validCount, 0), [points]);

    const loadReport = useCallback(async () => {
        const token = getToken();
        if (!token) {
            setLoading(false);
            setError("Login required to load downtime report.");
            return;
        }

        const controller = new AbortController();
        setLoading(true);
        setError("");

        try {
            const json = await fetchOrganizationDeviation(token, controller.signal);
            setPoints(normalizeReports(Array.isArray(json?.data?.reports) ? json.data.reports : []));
        } catch (err) {
            if ((err as { name?: string })?.name !== "AbortError") {
                setPoints([]);
                setError(err instanceof Error ? err.message : "Failed to load downtime report.");
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadReport();
    }, [loadReport]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
            onClick={() => router.push("/downtime")}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") router.push("/downtime");
            }}
            className="rounded-xl bg-white border border-border-subtle p-5 cursor-pointer transition-colors hover:border-primary/40 hover:bg-surface-muted/20"
        >
            <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-bold text-text-primary">Downtime</h3>
                    <p className="text-[11px] text-text-muted">Organization deviation · 1 week</p>
                </div>
                <button
                    onClick={(event) => {
                        event.stopPropagation();
                        loadReport();
                    }}
                    disabled={loading}
                    className="p-1 rounded text-text-muted hover:text-primary transition-colors disabled:opacity-40"
                    title="Refresh downtime"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                </button>
            </div>

            <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Average Deviation</p>
                    <p className="mt-1 text-3xl font-black" style={{ color: getDeviationColor(average) }}>
                        {loading ? "--" : `${average}%`}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Readings</p>
                    <p className="mt-1 text-lg font-bold text-text-primary">{validReadings}</p>
                </div>
            </div>

            {error ? (
                <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {error}
                </div>
            ) : (
                <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={points} margin={{ top: 18, right: 4, left: -28, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={(value) => `${value}%`} axisLine={false} tickLine={false} />
                            <Tooltip
                                formatter={(value: number) => [`${value}%`, "Deviation"]}
                                labelFormatter={(_, payload) => payload?.[0]?.payload?.dateLabel || ""}
                                contentStyle={{ borderRadius: 12, borderColor: "#dbe3ef", fontSize: 12 }}
                            />
                            <Bar dataKey="deviation" name="Deviation" radius={[5, 5, 0, 0]}>
                                {points.map((point) => (
                                    <Cell key={point.dateLabel} fill={getDeviationColor(point.deviation)} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            <div className="mt-3 flex items-center gap-3 border-t border-border-subtle pt-3">
                {[
                    { color: "bg-emerald-400", label: "< 30%" },
                    { color: "bg-amber-400", label: "30–60%" },
                    { color: "bg-red-400", label: "> 60%" },
                ].map((item) => (
                    <div key={item.label} className="flex items-center gap-1">
                        <span className={`h-2 w-2 rounded-sm ${item.color}`} />
                        <span className="text-[10px] text-text-muted">{item.label}</span>
                    </div>
                ))}
            </div>
        </motion.div>
    );
}
