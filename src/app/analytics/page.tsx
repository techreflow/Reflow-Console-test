"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import { getUserEmail, getUserName, isAuthenticated, exportDeviceData, getToken } from "@/lib/api";
import { useProjects } from "@/lib/ProjectsContext";
import { useMqttDevice, useMqttStatus } from "@/lib/useMqttDevice";
import { CHART_CONFIG } from "@/config/constants";
import {
    LineChart, Line,
    AreaChart, Area,
    BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from "recharts";
import {
    FileDown, Loader2, RefreshCw, Cpu,
    Activity, TrendingUp, BarChart2,
    Calendar, Download, Zap, ChevronDown, Check,
    Image as ImageIcon
} from "lucide-react";

interface Device {
    id?: string;
    serialNumber?: string;
    serial_no?: string;
    name: string;
}

interface ChartRow {
    timestamp?: string;
    time: string;
    ts?: number;
    [key: string]: string | number | undefined;
}

interface ChannelStat {
    key: string;
    label: string;
    current: number | null;
    min: number | null;
    max: number | null;
    avg: number | null;
    color: string;
}

const COLORS = CHART_CONFIG.COLORS;
const CHART_TYPES = CHART_CONFIG.CHART_TYPES;
type ChartType = typeof CHART_TYPES[number];

// ── Per-channel stat computation ─────────────────────────────────
function computeStats(data: ChartRow[], keys: string[]): ChannelStat[] {
    return keys.map((key, i) => {
        const vals = data.map((r) => r[key]).filter((v): v is number => typeof v === "number");
        return {
            key,
            label: key,
            current: vals.length > 0 ? vals[vals.length - 1] : null,
            min: vals.length > 0 ? Math.min(...vals) : null,
            max: vals.length > 0 ? Math.max(...vals) : null,
            avg: vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
            color: COLORS[i % COLORS.length],
        };
    });
}

// Simple status dot component matching the Devices list
function DeviceStatusDot({ serial }: { serial: string }) {
    const { isOnline, checked } = useMqttStatus(serial, 10000); // Poll every 10s to keep it lightweight
    if (!checked) return <span className="w-2 h-2 rounded-full bg-slate-300" title="Checking..." />;
    return (
        <span
            className={`w-2 h-2 rounded-full ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}
            title={isOnline ? "Online" : "Offline"}
        />
    );
}

export default function AnalyticsPage() {
    const email = getUserEmail();
    const fullName = getUserName();
    const chartRef = useRef<HTMLDivElement>(null);

    const [allDevices, setAllDevices] = useState<Device[]>([]);
    const [selectedDevice, setSelectedDevice] = useState("");
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    // Date range
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");

    // Chart data
    const [chartData, setChartData] = useState<ChartRow[]>([]);
    const [chartLoading, setChartLoading] = useState(false);
    const [chartError, setChartError] = useState("");
    const [channelKeys, setChannelKeys] = useState<string[]>([]);
    const [channelConfig, setChannelConfig] = useState<Record<string, string>>({});

    // Chart options
    const [chartType, setChartType] = useState<ChartType>("Line");
    const [visibleChannels, setVisibleChannels] = useState<Record<string, boolean>>({});

    // Dropdown state
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Live MQTT
    const [livePolling, setLivePolling] = useState(false);
    const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // New features
    const [csvDropdownOpen, setCsvDropdownOpen] = useState(false);
    const [showDeviation, setShowDeviation] = useState(false);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Set default date range (last 7 days)
    useEffect(() => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 7);
        setStartDate(start.toISOString().split("T")[0]);
        setEndDate(end.toISOString().split("T")[0]);
    }, []);

    // Load devices from global cache instead of making API calls
    const { devices: cachedDevices, loading: cacheLoading } = useProjects();

    useEffect(() => {
        if (cacheLoading) return;

        // Dedupe by serialNumber
        const seen = new Set<string>();
        const devices: Device[] = [];
        cachedDevices.forEach((d: any) => {
            const sn = d.serialNumber || d.serial_no || d.serialNo || d.serial_number || d.id || d._id || "";
            if (sn && !seen.has(sn)) {
                seen.add(sn);
                devices.push({ id: d.id || d._id, serialNumber: sn, name: d.name || sn });
            }
        });

        setAllDevices(devices);
        if (devices.length > 0) {
            setSelectedDevice(devices[0].serialNumber || "");
        } else {
            setLoadError("No devices found. Add a device from the Devices page first.");
        }
        setLoading(false);
    }, [cacheLoading, cachedDevices]);

    // Initialise channel visibility when keys change
    useEffect(() => {
        const init: Record<string, boolean> = {};
        channelKeys.forEach((k) => { init[k] = true; });
        setVisibleChannels(init);
    }, [channelKeys]);

    // Fetch historical data
    const fetchHistoricalData = useCallback(async () => {
        if (!selectedDevice || !startDate || !endDate) return;
        setChartLoading(true);
        setChartError("");
        setLivePolling(false);
        try {
            // Send full timestamp bounds for precision
            const startTimestamp = new Date(startDate).toISOString();
            const endTimestamp = new Date(endDate + "T23:59:59").toISOString();
            
            const resData = await exportDeviceData(selectedDevice, startTimestamp, endTimestamp);
            
            // The data might be directly an array, or nested inside `data` or `readings` or `deviceData`
            const dataRowArray = Array.isArray(resData) ? resData 
                                 : (resData?.data || resData?.readings || resData?.deviceData || []);

            if (!dataRowArray || dataRowArray.length === 0) {
                setChartData([]);
                setChannelKeys([]);
                setChartError("No data found for this device in the selected range.");
                return;
            }

            const keys = Object.keys(dataRowArray[0]).filter((k) => k !== "timestamp" && k !== "createdAt" && !k.startsWith("_"));
            setChannelKeys(keys);

            const mapped: ChartRow[] = dataRowArray.map((row: Record<string, string | number>) => {
                const tsString = (row.timestamp || row.createdAt) as string;
                return {
                    ...row,
                    time: new Date(tsString).toLocaleString("en-IN", {
                        day: "2-digit", month: "short",
                        hour: "2-digit", minute: "2-digit",
                    }),
                    ts: new Date(tsString).getTime(),
                };
            });
            setChartData(mapped);
        } catch (err: any) {
            console.error("[Analytics] Fetch history failed", err);
            setChartError("Failed to load historical data. Check connection.");
        } finally {
            setChartLoading(false);
        }
    }, [selectedDevice, startDate, endDate]);

    // Auto-fetch on device/date change
    useEffect(() => {
        if (selectedDevice && startDate && endDate) fetchHistoricalData();
    }, [selectedDevice, startDate, endDate, fetchHistoricalData]);

    // Load channel config to show human-readable names
    useEffect(() => {
        if (!selectedDevice) return;
        const token = getToken();
        async function loadConfig() {
            try {
                const res = await fetch(`/api/device-config?serialId=${selectedDevice}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const json = await res.json();
                const cfg = json?.data?.config;
                if (!cfg) return;

                let channelCount = 0;
                while (cfg[`SNO${channelCount + 1}`] !== undefined) channelCount++;
                
                const mapping: Record<string, string> = {};
                for (let i = 1; i <= channelCount; i++) {
                    const customName = String(cfg[`SNO${i}`] ?? `Channel ${i}`).trim();
                    mapping[`CH${i}`] = customName;
                    mapping[`RawCH${i}`] = customName;
                    mapping[`${i}`] = customName;
                }
                setChannelConfig(mapping);
            } catch (err) {
                console.error("[Analytics] Failed to load device config for channel names:", err);
            }
        }
        loadConfig();
    }, [selectedDevice]);

    // Live MQTT polling — append to chartData
    useEffect(() => {
        if (!selectedDevice || !livePolling) {
            if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
            return;
        }
        const fetchLive = async () => {
            try {
                const res = await fetch(`/api/mqtt-readings?serialId=${selectedDevice}`);
                if (!res.ok) return;
                const data = await res.json();
                if (data?.error) return;

                const now = Date.now();
                const timeLabel = new Date(now).toLocaleTimeString("en-IN", {
                    hour: "2-digit", minute: "2-digit", second: "2-digit",
                });

                const newRow: ChartRow = { time: timeLabel, ts: now };
                const keys: string[] = [];
                ["RawCH1","RawCH2","RawCH3","RawCH4","RawCH5","RawCH6"].forEach((k) => {
                    if (data[k] !== null && data[k] !== undefined) {
                        newRow[k] = data[k];
                        if (!keys.includes(k)) keys.push(k);
                    }
                });

                // Ensure keys are set
                setChannelKeys((prev) => {
                    const union = Array.from(new Set(prev.concat(keys)));
                    return union.length > prev.length ? union : prev;
                });

                // Append to chart, rolling 100 pt window
                setChartData((prev) => {
                    const next = [...prev, newRow];
                    return next.length > 100 ? next.slice(next.length - 100) : next;
                });
            } catch {
                // silent
            }
        };
        fetchLive();
        liveIntervalRef.current = setInterval(fetchLive, 3000);
        return () => { if (liveIntervalRef.current) clearInterval(liveIntervalRef.current); };
    }, [selectedDevice, livePolling]);

    // Toggle live mode
    const toggleLive = () => {
        if (!livePolling) {
            // Switch to live: clear historical data and switch chart type to Area
            setChartData([]);
            setChartError("");
            setChartType("Area");
        }
        setLivePolling((v) => !v);
    };

    // Toggle channel visibility
    const toggleChannel = (key: string) => {
        setVisibleChannels((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    // Export as PNG
    async function exportImage() {
        if (!chartRef.current) return;
        const { default: html2canvas } = await import("html2canvas");
        const canvas = await html2canvas(chartRef.current);
        const a = Object.assign(document.createElement("a"), {
            href: canvas.toDataURL("image/png"),
            download: `${selectedDevice}_chart.png`,
        });
        a.click();
    }

    // Export as PDF
    async function exportPDF() {
        if (!chartRef.current) return;
        const { default: html2canvas } = await import("html2canvas");
        const { default: jsPDF } = await import("jspdf");
        const canvas = await html2canvas(chartRef.current);
        const doc = new jsPDF("landscape");
        doc.setFontSize(16);
        doc.text(`Analytics: ${selectedDevice}`, 14, 15);
        doc.setFontSize(10);
        doc.text(`${startDate} to ${endDate}`, 14, 22);
        const iw = 270;
        const ih = (canvas.height * iw) / canvas.width;
        doc.addImage(canvas.toDataURL("image/png"), "PNG", 14, 28, iw, ih);
        doc.save(`${selectedDevice}_analytics.pdf`);
    }

    // Export as CSV with dynamic intervals
    async function exportCSV(intervalMinutes?: number) {
        if (chartData.length === 0) return;
        
        let exportData = chartData;
        
        if (intervalMinutes) {
            const ms = intervalMinutes * 60 * 1000;
            const buckets: Record<number, any> = {};
            chartData.forEach(row => {
                if(!row.ts) return;
                const bucketTs = Math.floor(row.ts / ms) * ms;
                if (!buckets[bucketTs]) {
                    buckets[bucketTs] = { ts: bucketTs, time: new Date(bucketTs).toLocaleString("en-IN"), count: 0 };
                }
                const b = buckets[bucketTs];
                b.count++;
                Object.keys(row).forEach(k => {
                    if (k !== 'time' && k !== 'ts' && k !== 'timestamp' && typeof row[k] === 'number') {
                        b[k] = (b[k] || 0) + (row[k] as number);
                    }
                });
            });
            exportData = Object.values(buckets).map((b: any) => {
                const res: any = { time: b.time };
                Object.keys(b).forEach(k => {
                    if (k !== 'time' && k !== 'ts' && k !== 'count') res[k] = Number((b[k] / b.count).toFixed(2));
                });
                return res;
            }).sort((a,b) => new Date(a.time).getTime() - new Date(b.time).getTime());
        }

        const displayHeaders = ["time", ...channelKeys.map(k => channelConfig[k] || k)];
        const rows = exportData.map(row => 
            ["time", ...channelKeys].map(h => row[h] !== undefined ? row[h] : "").join(",")
        );
        const csv = [displayHeaders.join(","), ...rows].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const suffix = intervalMinutes ? `_${intervalMinutes}min` : "";
        a.download = `${selectedDevice}_analytics${suffix}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // Stat computations
    const activeKeys = channelKeys.filter((k) => visibleChannels[k]);
    const stats = computeStats(chartData, activeKeys);

    // Compute deviation chart data if requested
    const processedChartData = useMemo(() => {
        if (!showDeviation || activeKeys.length === 0) return chartData;
        // Compute average per channel based on current window
        const avgs: Record<string, number> = {};
        activeKeys.forEach(k => {
            const stat = stats.find(s => s.key === k);
            avgs[k] = stat?.avg && stat.avg !== 0 ? stat.avg : 1; 
        });
        
        return chartData.map(row => {
            const newRow: any = { ...row };
            activeKeys.forEach(k => {
                if (typeof row[k] === 'number') {
                    const avg = avgs[k];
                    newRow[k] = Number((((row[k] as number - avg) / Math.abs(avg)) * 100).toFixed(2));
                }
            });
            return newRow;
        });
    }, [chartData, showDeviation, activeKeys, stats]);

    // Chart renderer
    const renderChart = () => {
        // ── Y-axis domain: 20% of the data range as padding ──
        // e.g. min=5 max=11 → range=6, padding=1.2 → axis 3.8 – 12.2
        const allValues = processedChartData.flatMap(row =>
            activeKeys.map(k => row[k]).filter((v): v is number => typeof v === "number")
        );
        const dataMin = allValues.length > 0 ? Math.min(...allValues) : 0;
        const dataMax = allValues.length > 0 ? Math.max(...allValues) : 10;
        const range = dataMax - dataMin;
        const padding = range > 0.001 ? range * 0.2 : 1;
        const yMin = dataMin - padding;
        const yMax = dataMax + padding;

        // ── X-axis: use numeric ts for proper time spacing, format for display ──
        const xMin = processedChartData.length > 0 ? processedChartData[0].ts as number : undefined;
        const xMax = processedChartData.length > 0 ? processedChartData[processedChartData.length - 1].ts as number : undefined;

        const formatTick = (ts: number) => {
            if (!ts || typeof ts !== "number") return "";
            const d = new Date(ts);
            const day = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
            const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
            return livePolling ? time : `${day}, ${time}`;
        };

        const sharedProps = {
            data: processedChartData,
            margin: { top: 5, right: 30, left: 20, bottom: 5 },
        };
        const xAxis = (
            <XAxis
                dataKey="ts"
                type="number"
                scale="time"
                domain={[xMin ?? "auto", xMax ?? "auto"]}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickFormatter={formatTick}
                tickCount={8}
                minTickGap={60}
            />
        );
        const yAxis = (
            <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                domain={[yMin, yMax]}
                tickFormatter={(v: number) => `${Number(v).toFixed(1)}${showDeviation ? "%" : ""}`}
            />
        );
        const grid = <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />;
        const tooltip = (
            <Tooltip
                labelFormatter={(ts: number) => formatTick(ts)}
                contentStyle={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }}
                formatter={(value: number, name: string) => [
                    `${value}${showDeviation ? "%" : ""}`,
                    channelConfig[name] || name
                ]}
            />
        );
        const legend = (
            <Legend
                onClick={(e) => toggleChannel(e.dataKey as string)}
                formatter={(value) => channelConfig[value] || value}
                wrapperStyle={{ cursor: "pointer", fontSize: "12px" }}
            />
        );
        // Ideal range reference lines (only in deviation mode: ±5% ideal band)
        const idealLines = showDeviation ? (
            <>
                <ReferenceLine y={5} stroke="#22c55e" strokeDasharray="6 3" strokeWidth={1.5}
                    label={{ value: "+5% ideal", position: "insideTopRight", fontSize: 10, fill: "#16a34a" }} />
                <ReferenceLine y={-5} stroke="#22c55e" strokeDasharray="6 3" strokeWidth={1.5}
                    label={{ value: "-5% ideal", position: "insideBottomRight", fontSize: 10, fill: "#16a34a" }} />
                <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1} />
            </>
        ) : null;

        if (chartType === "Bar") {
            return (
                <BarChart {...sharedProps}>
                    {grid}{xAxis}{yAxis}{tooltip}{legend}{idealLines}
                    {activeKeys.map((key, i) => (
                        <Bar key={key} dataKey={key} name={channelConfig[key] || key} fill={COLORS[i % COLORS.length]} opacity={0.85} radius={[3,3,0,0]} />
                    ))}
                </BarChart>
            );
        }
        if (chartType === "Area") {
            return (
                <AreaChart {...sharedProps}>
                    <defs>
                        {activeKeys.map((key, i) => (
                            <linearGradient key={key} id={`ag-${key}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.25} />
                                <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
                            </linearGradient>
                        ))}
                    </defs>
                    {grid}{xAxis}{yAxis}{tooltip}{legend}{idealLines}
                    {activeKeys.map((key, i) => (
                        <Area
                            key={key} type="monotone" dataKey={key} name={channelConfig[key] || key}
                            stroke={COLORS[i % COLORS.length]} strokeWidth={2}
                            fill={`url(#ag-${key})`} dot={false} activeDot={{ r: 4 }}
                            isAnimationActive={false}
                        />
                    ))}
                </AreaChart>
            );
        }
        // Line (default)
        return (
            <LineChart {...sharedProps}>
                {grid}{xAxis}{yAxis}{tooltip}{legend}{idealLines}
                {activeKeys.map((key, i) => (
                    <Line
                        key={key} type="monotone" dataKey={key} name={channelConfig[key] || key}
                        stroke={COLORS[i % COLORS.length]} strokeWidth={2}
                        dot={false} activeDot={{ r: 4 }}
                        isAnimationActive={false}
                    />
                ))}
            </LineChart>
        );
    };

    // Loading state is now inline so the layout transition is instant

    return (
        <DashboardLayout
            title="Analytics"
            breadcrumbs={[{ label: "Workspace", href: "/" }, { label: "Analytics" }]}
            user={{ name: fullName || "", email: email || "" }}
        >
            <div className="space-y-6">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                    <div>
                        <h2 className="text-2xl font-bold text-text-primary">Device Analytics</h2>
                        <p className="text-sm text-text-muted mt-1">
                            Historical trends, real-time MQTT stream, and per-channel stats.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* CSV Dropdown */}
                        <div className="relative z-50">
                            <button
                                onClick={() => setCsvDropdownOpen(!csvDropdownOpen)}
                                disabled={chartData.length === 0}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border-subtle text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors disabled:opacity-40"
                            >
                                <Download className="w-4 h-4" /> Export CSV <ChevronDown className="w-3 h-3" />
                            </button>
                            <AnimatePresence>
                                {csvDropdownOpen && (
                                    <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="absolute top-full right-0 mt-1.5 bg-white border border-border-subtle rounded-lg shadow-xl overflow-hidden py-1 w-48 text-left">
                                        <button onClick={() => { exportCSV(); setCsvDropdownOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-surface-muted transition-colors">Raw Data</button>
                                        <button onClick={() => { exportCSV(5); setCsvDropdownOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-surface-muted transition-colors">5 Min Averaged</button>
                                        <button onClick={() => { exportCSV(15); setCsvDropdownOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-surface-muted transition-colors">15 Min Averaged</button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        <button
                            onClick={exportImage}
                            disabled={chartData.length === 0}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border-subtle text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors disabled:opacity-40"
                        >
                            <ImageIcon className="w-4 h-4" /> Save Image
                        </button>
                        <button
                            onClick={exportPDF}
                            disabled={chartData.length === 0}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border-subtle text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors disabled:opacity-40"
                        >
                            <FileDown className="w-4 h-4" /> Save PDF
                        </button>
                    </div>
                </motion.div>

                {/* Controls */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.05 }}
                    className="rounded-xl bg-white border border-border-subtle p-5"
                >
                    {/* No devices warning */}
                    {loadError && allDevices.length === 0 && (
                        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                            <span>⚠</span>
                            <span>{loadError}</span>
                        </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-end">
                        {/* Custom Device Dropdown */}
                        <div className="relative z-20" ref={dropdownRef}>
                            <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5 block">
                                Device {allDevices.length > 0 && <span className="text-primary normal-case font-normal">({allDevices.length})</span>}
                            </label>
                            
                            <button
                                onClick={() => setDropdownOpen(!dropdownOpen)}
                                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                {selectedDevice ? (
                                    <span className="flex items-center gap-2 truncate">
                                        <DeviceStatusDot serial={selectedDevice} />
                                        <span className="truncate">
                                            {allDevices.find((d) => d.serialNumber === selectedDevice)?.name || selectedDevice}
                                        </span>
                                    </span>
                                ) : (
                                    <span className="text-text-muted">Select a device</span>
                                )}
                                <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
                            </button>

                            <AnimatePresence>
                                {dropdownOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                                        className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-border-subtle rounded-lg shadow-xl overflow-hidden py-1 max-h-60 overflow-y-auto"
                                    >
                                        {allDevices.length === 0 ? (
                                            <p className="px-3 py-2 text-sm text-text-muted text-center">No devices found</p>
                                        ) : (
                                            allDevices.map((d) => {
                                                const sn = d.serialNumber || "";
                                                const isSelected = selectedDevice === sn;
                                                return (
                                                    <button
                                                        key={sn}
                                                        onClick={() => {
                                                            setSelectedDevice(sn);
                                                            setChartData([]);
                                                            setChannelKeys([]);
                                                            setDropdownOpen(false);
                                                        }}
                                                        className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                                                            isSelected ? "bg-primary/5 text-primary font-semibold" : "text-text-primary hover:bg-surface-muted"
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2 truncate">
                                                            <DeviceStatusDot serial={sn} />
                                                            <div className="flex flex-col items-start truncate">
                                                                <span className="truncate leading-tight">{d.name}</span>
                                                                <span className="text-[10px] text-text-muted font-mono leading-tight">{sn}</span>
                                                            </div>
                                                        </div>
                                                        {isSelected && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                                                    </button>
                                                );
                                            })
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        {/* Start */}
                        <div>
                            <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5 block">Start</label>
                            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                                className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm focus:outline-none focus:border-primary"
                            />
                        </div>
                        {/* End */}
                        <div>
                            <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5 block">End</label>
                            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                                className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm focus:outline-none focus:border-primary"
                            />
                        </div>
                        {/* Chart type */}
                        <div>
                            <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5 block">Chart Type</label>
                            <div className="flex rounded-lg border border-border-subtle overflow-hidden h-[42px]">
                                {CHART_TYPES.map((t) => (
                                    <button key={t}
                                        onClick={() => setChartType(t)}
                                        className={`flex-1 text-xs font-semibold transition-colors ${
                                            chartType === t
                                                ? "bg-primary text-white"
                                                : "bg-white text-text-secondary hover:bg-surface-muted"
                                        }`}
                                    >
                                        {t === "Line" && <Activity className="w-3 h-3 mx-auto mb-0.5" />}
                                        {t === "Area" && <TrendingUp className="w-3 h-3 mx-auto mb-0.5" />}
                                        {t === "Bar" && <BarChart2 className="w-3 h-3 mx-auto mb-0.5" />}
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {/* Buttons */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={fetchHistoricalData}
                                disabled={chartLoading || livePolling}
                                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                            >
                                {chartLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                Load
                            </button>
                            <button
                                onClick={toggleLive}
                                className={`px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                                    livePolling
                                        ? "bg-green-50 border-green-200 text-green-700"
                                        : "border-border-subtle text-text-secondary hover:bg-surface-muted"
                                }`}
                            >
                                <Zap className={`w-4 h-4 ${livePolling ? "text-green-600" : ""}`} />
                            </button>
                        </div>
                    </div>

                    {/* Live indicator */}
                    {livePolling && (
                        <div className="mt-3 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-xs font-medium text-green-700">
                                Live MQTT — appending every 3s ({chartData.length} pts)
                            </span>
                        </div>
                    )}
                </motion.div>

                {/* Channel Visibility Toggles */}
                {channelKeys.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="flex items-center gap-2 flex-wrap"
                    >
                        <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Channels:</span>
                        {channelKeys.map((key, i) => (
                            <button
                                key={key}
                                onClick={() => toggleChannel(key)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                                    visibleChannels[key]
                                        ? "border-transparent text-white"
                                        : "border-border-subtle bg-white text-text-muted"
                                }`}
                                style={visibleChannels[key] ? { backgroundColor: COLORS[i % COLORS.length] } : {}}
                            >
                                {channelConfig[key] || key}
                            </button>
                        ))}
                        <button
                            onClick={() => {
                                const allOn = channelKeys.every((k) => visibleChannels[k]);
                                const next: Record<string, boolean> = {};
                                channelKeys.forEach((k) => { next[k] = !allOn; });
                                setVisibleChannels(next);
                            }}
                            className="text-xs text-primary font-medium hover:underline ml-2 mr-auto"
                        >
                            {channelKeys.every((k) => visibleChannels[k]) ? "Hide all" : "Show all"}
                        </button>
                        
                        {/* Deviation % Toggle */}
                        <button
                            onClick={() => setShowDeviation(!showDeviation)}
                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                                showDeviation
                                    ? "bg-purple-50 text-purple-700 border-purple-200"
                                    : "bg-white text-text-muted border-border-subtle hover:bg-surface-muted"
                            }`}
                        >
                            <Activity className="w-3.5 h-3.5" />
                            Plot Deviation %
                        </button>
                    </motion.div>
                )}

                {/* Stats Strip */}
                {stats.length > 0 && chartData.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
                    >
                        {stats.map((s) => (
                            <div key={s.key} className="rounded-xl bg-white border border-border-subtle p-3">
                                <div className="flex items-center gap-1.5 mb-2">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{channelConfig[s.key] || s.label}</p>
                                </div>
                                <p className="text-lg font-black text-text-primary" style={{ color: s.color }}>
                                    {s.current !== null ? Number(s.current).toFixed(2) : "—"}
                                </p>
                                <div className="mt-1.5 flex justify-between text-[10px] text-text-muted">
                                    <span>↓ {s.min !== null ? Number(s.min).toFixed(1) : "—"}</span>
                                    <span>~ {s.avg !== null ? Number(s.avg).toFixed(1) : "—"}</span>
                                    <span>↑ {s.max !== null ? Number(s.max).toFixed(1) : "—"}</span>
                                </div>
                            </div>
                        ))}
                    </motion.div>
                )}

                {/* Chart */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                    className="rounded-xl bg-white border border-border-subtle p-6"
                    ref={chartRef}
                >
                    <div className="flex items-center gap-2 mb-5">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <TrendingUp className="w-4 h-4 text-primary" />
                        </div>
                        <h3 className="text-base font-bold text-text-primary">
                            {livePolling ? "Live Feed" : "Trend Analysis"}
                        </h3>
                        <span className="text-xs text-text-muted ml-2">{chartType} chart</span>
                        {chartData.length > 0 && (
                            <span className="text-xs text-text-muted ml-auto">{chartData.length} data points</span>
                        )}
                        {livePolling && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                LIVE
                            </span>
                        )}
                    </div>

                    {chartLoading ? (
                        <div className="flex items-center justify-center h-80">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : chartError ? (
                        <div className="flex flex-col items-center justify-center h-80 text-center">
                            <Cpu className="w-10 h-10 text-text-muted mb-3" />
                            <p className="text-sm text-text-muted">{chartError}</p>
                        </div>
                    ) : chartData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-80 text-center">
                            <Calendar className="w-10 h-10 text-text-muted mb-3" />
                            <p className="text-sm text-text-muted">
                                {livePolling ? "Waiting for live MQTT data…" : "Select a device and date range to view data"}
                            </p>
                        </div>
                    ) : activeKeys.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-80 text-center">
                            <Download className="w-10 h-10 text-text-muted mb-3" />
                            <p className="text-sm text-text-muted">All channels hidden — enable one above</p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={400}>
                            {renderChart()}
                        </ResponsiveContainer>
                    )}
                </motion.div>
            </div>
        </DashboardLayout>
    );
}
