"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import {
    getUserEmail,
    getUserName,
    isAuthenticated,
    exportDeviceData,
    getToken,
} from "@/lib/api";
import { useProjects } from "@/lib/ProjectsContext";
import { useMqttStatus } from "@/lib/useMqttDevice";
import {
    FileDown,
    Calendar,
    Database,
    FileText,
    Loader2,
    Download,
    Clock,
    Trash2,
    Mail,
    Plus,
    ChevronDown,
    Check,
} from "lucide-react";

interface Device {
    id?: string;
    serialNumber?: string;
    serial_no?: string;
    name: string;
}

interface Project {
    id?: string;
    _id?: string;
    name: string;
    devices?: Device[];
}

interface ScheduleEntry {
    _id?: string;
    device: string;
    email: string;
    frequency: string;
    reportType: string;
    error?: string;
}

// Simple status dot component matching Analytics/Devices list
function DeviceStatusDot({ serial }: { serial: string }) {
    const { isOnline, checked } = useMqttStatus(serial, 10000);
    if (!checked) return <span className="w-2 h-2 rounded-full bg-slate-300 flex-shrink-0" title="Checking..." />;
    return (
        <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}
            title={isOnline ? "Online" : "Offline"}
        />
    );
}

function uniqueNonEmpty(values: Array<string | undefined | null>): string[] {
    return Array.from(new Set(values.map((v) => (v || "").trim()).filter(Boolean)));
}

function extractChannelIndex(key: string): number | null {
    const normalized = String(key || "").trim();
    const snoMatch = normalized.match(/^sno(\d+)$/i);
    if (snoMatch?.[1]) return Number(snoMatch[1]);
    const chMatch = normalized.match(/(?:raw)?ch(\d+)$/i);
    if (chMatch?.[1]) return Number(chMatch[1]);
    return null;
}

export default function ReportsPage() {
    const email = getUserEmail();
    const fullName = getUserName();

    // Device selection
    const [projects, setProjects] = useState<Project[]>([]);
    const [allDevices, setAllDevices] = useState<Device[]>([]);
    const [selectedDevice, setSelectedDevice] = useState("");
    const [loading, setLoading] = useState(true);

    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [useTimeFilter, setUseTimeFilter] = useState(false);
    const [startTime, setStartTime] = useState("05:00");
    const [endTime, setEndTime] = useState("09:00");
    const [exportFormat, setExportFormat] = useState<"csv" | "pdf">("csv");
    const [exportInterval, setExportInterval] = useState<"1 min" | "5 mins" | "15 mins">("1 min");
    const [exporting, setExporting] = useState(false);
    const [exportData, setExportData] = useState<any[]>([]);
    const [channelNameMap, setChannelNameMap] = useState<Record<number, string>>({});

    // Dropdown state for Export
    const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
    const exportDropdownRef = useRef<HTMLDivElement>(null);

    // Dropdown state for Schedule
    const [scheduleDropdownOpen, setScheduleDropdownOpen] = useState(false);
    const scheduleDropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdowns on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
                setExportDropdownOpen(false);
            }
            if (scheduleDropdownRef.current && !scheduleDropdownRef.current.contains(event.target as Node)) {
                setScheduleDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Email scheduling
    const [scheduleEmail, setScheduleEmail] = useState("");
    const [scheduleFrequency, setScheduleFrequency] = useState("daily");
    const [scheduleDevice, setScheduleDevice] = useState("");
    const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
    const [savingSchedule, setSavingSchedule] = useState(false);
    const [loadingSchedules, setLoadingSchedules] = useState(false);

    const chartRef = useRef<HTMLDivElement>(null);

    // Load devices from global cache
    const { projects: cachedProjects, devices: cachedDevices, loading: cacheLoading } = useProjects();

    useEffect(() => {
        if (cacheLoading) return;

        setProjects(cachedProjects as any);

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
            const first = devices[0].id || devices[0].serialNumber || "";
            setSelectedDevice(first);
            setScheduleDevice(devices[0].serialNumber || first);
        }
        setLoading(false);
    }, [cacheLoading, cachedProjects, cachedDevices]);

    const selectedDeviceMeta = useMemo(() => {
        const matched = allDevices.find((d) => {
            const id = (d.id || "").trim();
            const sn = (d.serialNumber || "").trim();
            return (id && id === selectedDevice) || (sn && sn === selectedDevice);
        });

        const id = (matched?.id || selectedDevice || "").trim();
        const serial = (matched?.serialNumber || selectedDevice || "").trim();
        return {
            id,
            serial,
            name: matched?.name || selectedDevice,
            exportCandidates: uniqueNonEmpty([id, serial, selectedDevice]),
        };
    }, [allDevices, selectedDevice]);

    const fetchExportData = useCallback(async (start: string, end: string, interval?: string) => {
        let lastErr: unknown = null;
        for (const identifier of selectedDeviceMeta.exportCandidates) {
            try {
                return await exportDeviceData(identifier, start, end, interval);
            } catch (err) {
                lastErr = err;
            }
        }
        throw lastErr || new Error("Failed to export device data");
    }, [selectedDeviceMeta.exportCandidates]);

    const scheduleDeviceMeta = useMemo(() => {
        const matched = allDevices.find((d) => {
            const id = (d.id || "").trim();
            const sn = (d.serialNumber || "").trim();
            return (id && id === scheduleDevice) || (sn && sn === scheduleDevice);
        });
        const id = (matched?.id || scheduleDevice || "").trim();
        const serial = (matched?.serialNumber || scheduleDevice || "").trim();
        return {
            id,
            serial,
            name: matched?.name || scheduleDevice,
            candidates: uniqueNonEmpty([serial, id, scheduleDevice]),
        };
    }, [allDevices, scheduleDevice]);

    useEffect(() => {
        if (!selectedDeviceMeta.serial) {
            setChannelNameMap({});
            return;
        }
        const token = getToken();
        async function loadChannelNames() {
            try {
                const res = await fetch(`/api/device-config?serialId=${selectedDeviceMeta.serial}`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                });
                if (!res.ok) return;
                const json = await res.json();
                const cfg = json?.data?.config;
                if (!cfg || typeof cfg !== "object") return;
                const next: Record<number, string> = {};
                let i = 1;
                while (cfg[`SNO${i}`] !== undefined) {
                    const label = String(cfg[`SNO${i}`] ?? "").trim();
                    if (label) next[i] = label;
                    i++;
                }
                setChannelNameMap(next);
            } catch {
                // keep silent; fallback to raw column names
            }
        }
        loadChannelNames();
    }, [selectedDeviceMeta.serial]);

    const getHeaderLabel = useCallback((rawKey: string) => {
        const index = extractChannelIndex(rawKey);
        if (index && channelNameMap[index]) return channelNameMap[index];
        return rawKey;
    }, [channelNameMap]);

    // Load schedules for selected device
    useEffect(() => {
        if (!scheduleDeviceMeta.id && !scheduleDeviceMeta.serial) return;
        loadSchedule(scheduleDeviceMeta.candidates);
    }, [scheduleDeviceMeta.id, scheduleDeviceMeta.serial, scheduleDeviceMeta.candidates]);

    async function loadSchedule(deviceIdentifiers: string[]) {
        setLoadingSchedules(true);
        try {
            for (const deviceId of deviceIdentifiers) {
                const res = await fetch("/api/email-config/get-device-info", {
                    headers: { device: deviceId },
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data && !data.message) {
                        setSchedules([data]);
                        return;
                    }
                }
            }
            setSchedules([]);
        } catch {
            setSchedules([]);
        } finally {
            setLoadingSchedules(false);
        }
    }

    // Export data from PostgreSQL
    async function handleExport() {
        if (!selectedDevice || !startDate || !endDate) {
            alert("Please select a device and date range");
            return;
        }

        setExporting(true);
        try {
            let backendStartDate = startDate;
            let backendEndDate = endDate;

            if (useTimeFilter) {
                // The backend accepts "YYYY-MM-DD HH:mm:00" for precise time filtering
                backendStartDate = `${startDate} ${startTime}:00`;
                backendEndDate = `${endDate} ${endTime}:00`;
            }

            // Convert "1 min" -> "1min", "5 mins" -> "5min"
            const backendInterval = exportInterval.replace(/\s+/g, '').replace(/s$/, '');

            const resData = await fetchExportData(backendStartDate, backendEndDate, backendInterval);
            
            // Handle array or nested data structures
            let dataRowArray = Array.isArray(resData) ? resData 
                                 : (resData?.data || resData?.readings || resData?.deviceData || []);

            if (!dataRowArray || dataRowArray.length === 0) throw new Error("No data found");
            setExportData(dataRowArray);

            if (exportFormat === "csv") {
                downloadCSV(dataRowArray);
            } else {
                downloadPDF(dataRowArray);
            }
        } catch (err) {
            console.error("Export error:", err);
            alert("Failed to export data. Please check if the device has data in the selected range.");
        } finally {
            setExporting(false);
        }
    }

    function downloadCSV(data: Record<string, string | number>[]) {
        if (!data || data.length === 0) {
            alert("No data found for the selected range");
            return;
        }
        const headers = Object.keys(data[0]);
        const displayHeaders = headers.map(getHeaderLabel);
        const csvContent = [
            displayHeaders.join(","),
            ...data.map((row) => headers.map((h) => row[h] ?? "").join(",")),
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${selectedDeviceMeta.name || selectedDevice}_${startDate}_to_${endDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async function downloadPDF(data: Record<string, string | number>[]) {
        if (!data || data.length === 0) {
            alert("No data found for the selected range");
            return;
        }
        try {
            const { default: jsPDF } = await import("jspdf");
            const doc = new jsPDF();
            doc.setFontSize(16);
            doc.text(`Device Report: ${selectedDeviceMeta.name || selectedDevice}`, 14, 20);
            doc.setFontSize(10);
            doc.text(`${startDate} to ${endDate}`, 14, 28);
            doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 34);

            const headers = Object.keys(data[0]);
            let y = 44;
            doc.setFontSize(8);

            // Header row
            headers.forEach((h, i) => {
                doc.text(getHeaderLabel(h), 14 + i * 30, y);
            });
            y += 6;

            // Data rows
            data.slice(0, 100).forEach((row) => {
                if (y > 280) {
                    doc.addPage();
                    y = 20;
                }
                headers.forEach((h, i) => {
                    const val = row[h];
                    doc.text(String(val ?? ""), 14 + i * 30, y);
                });
                y += 5;
            });

            if (data.length > 100) {
                doc.text(`... and ${data.length - 100} more rows`, 14, y + 5);
            }

            doc.save(`${selectedDeviceMeta.name || selectedDevice}_report.pdf`);
        } catch (err) {
            console.error("PDF generation error:", err);
            alert("Failed to generate PDF");
        }
    }

    // Save email schedule
    async function handleSaveSchedule() {
        if (!scheduleEmail || !scheduleDevice) {
            alert("Please fill in all schedule fields");
            return;
        }
        setSavingSchedule(true);
        try {
            const res = await fetch("/api/email-config/post-device-info", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    device: scheduleDeviceMeta.serial || scheduleDeviceMeta.id || scheduleDevice,
                    email: scheduleEmail,
                    frequency: scheduleFrequency,
                    reportType: exportFormat,
                }),
            });
            if (res.ok) {
                await loadSchedule(scheduleDeviceMeta.candidates);
                setScheduleEmail("");
            }
        } catch (err) {
            console.error("Error saving schedule:", err);
        } finally {
            setSavingSchedule(false);
        }
    }

    // Delete schedule
    async function handleDeleteSchedule(deviceId: string) {
        if (!confirm("Delete this report schedule?")) return;
        try {
            await fetch("/api/email-config/delete-schedule", {
                method: "DELETE",
                headers: { device: deviceId },
            });
            setSchedules((prev: any[]) => prev.filter((s: any) => s.device !== deviceId));
        } catch (err) {
            console.error("Error deleting schedule:", err);
        }
    }

    if (loading) {
        return (
            <DashboardLayout title="Reports" breadcrumbs={[{ label: "Reports" }]} user={{ name: fullName || "", email: email || "" }}>
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout
            title="Reports"
            breadcrumbs={[
                { label: "Workspace", href: "/" },
                { label: "Reports" },
            ]}
            user={{ name: fullName || "", email: email || "" }}
        >
            <div className="space-y-6">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                >
                    <h2 className="text-2xl font-bold text-text-primary">Reports & Export</h2>
                    <p className="text-sm text-text-muted mt-1">
                        Export device data and schedule automated email reports.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Data Export Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                        className="rounded-xl bg-white border border-border-subtle p-6"
                    >
                        <div className="flex items-center gap-2 mb-5">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                <FileDown className="w-4 h-4 text-primary" />
                            </div>
                            <h3 className="text-base font-bold text-text-primary">Export Device Data</h3>
                        </div>

                        <div className="space-y-4">
                            {/* Device Selection */}
                            <div className="relative z-30" ref={exportDropdownRef}>
                                <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5 block">
                                    Select Device
                                </label>
                                <button
                                    onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
                                >
                                    {selectedDevice ? (
                                        <span className="flex items-center gap-2 truncate">
                                            <DeviceStatusDot serial={selectedDeviceMeta.serial} />
                                            <span className="truncate">
                                                {selectedDeviceMeta.name || selectedDevice}
                                            </span>
                                        </span>
                                    ) : (
                                        <span className="text-text-muted">No devices available</span>
                                    )}
                                    <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${exportDropdownOpen ? "rotate-180" : ""}`} />
                                </button>

                                <AnimatePresence>
                                    {exportDropdownOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                                            className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-border-subtle rounded-lg shadow-xl overflow-hidden py-1 max-h-60 overflow-y-auto"
                                        >
                                            {allDevices.length === 0 ? (
                                                <p className="px-3 py-2 text-sm text-text-muted text-center">No devices found</p>
                                            ) : (
                                                allDevices.map((d: Device) => {
                                                    const key = d.id || d.serialNumber || "";
                                                    const sn = d.serialNumber || d.id || "";
                                                    const isSelected = selectedDevice === key;
                                                    return (
                                                        <button
                                                            key={key}
                                                            onClick={() => {
                                                                setSelectedDevice(key);
                                                                setExportDropdownOpen(false);
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

                            {/* Date Range */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5 block">
                                        Start Date
                                    </label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary focus:outline-none focus:border-primary"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5 block">
                                        End Date
                                    </label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary focus:outline-none focus:border-primary"
                                    />
                                </div>
                            </div>

                            {/* Time Filter */}
                            <div className="space-y-3 p-3 bg-surface-muted/30 border border-border-subtle rounded-lg">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={useTimeFilter}
                                        onChange={(e) => setUseTimeFilter(e.target.checked)}
                                        className="w-4 h-4 text-primary rounded border-border-subtle focus:ring-primary/20 accent-primary"
                                    />
                                    <span className="text-sm font-semibold text-text-primary mb-0.5">Enable Specific Time Period</span>
                                </label>
                                
                                {useTimeFilter && (
                                    <div className="grid grid-cols-2 gap-3 mt-2">
                                        <div>
                                            <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5 block">
                                                Start Time
                                            </label>
                                            <input
                                                type="time"
                                                value={startTime}
                                                onChange={(e) => setStartTime(e.target.value)}
                                                className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary focus:outline-none focus:border-primary time-input-no-ampm"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5 block">
                                                End Time
                                            </label>
                                            <input
                                                type="time"
                                                value={endTime}
                                                onChange={(e) => setEndTime(e.target.value)}
                                                className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary focus:outline-none focus:border-primary time-input-no-ampm"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Interval and Format Selection */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5 block">
                                        Data Interval
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={exportInterval}
                                            onChange={(e) => setExportInterval(e.target.value as any)}
                                            className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary focus:outline-none focus:border-primary appearance-none pr-10"
                                        >
                                            <option value="1 min">1 min</option>
                                            <option value="5 mins">5 mins</option>
                                            <option value="15 mins">15 mins</option>
                                        </select>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5 block">
                                        Format
                                    </label>
                                    <div className="flex gap-2">
                                        {(["csv", "pdf"] as const).map((fmt) => (
                                            <button
                                                key={fmt}
                                                onClick={() => setExportFormat(fmt)}
                                                className={`flex-1 px-2 py-2.5 rounded-lg border text-sm font-medium transition-all ${exportFormat === fmt
                                                        ? "border-primary bg-primary/5 text-primary ring-1 ring-primary/20"
                                                        : "border-border-subtle text-text-secondary hover:border-border-default"
                                                    }`}
                                            >
                                                {fmt === "csv" ? (
                                                    <span className="flex items-center gap-1 justify-center">
                                                        <FileText className="w-4 h-4 hidden sm:block" /> CSV
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1 justify-center">
                                                        <FileDown className="w-4 h-4 hidden sm:block" /> PDF
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Export Button */}
                            <button
                                onClick={handleExport}
                                disabled={exporting || !selectedDevice || !startDate || !endDate}
                                className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                            >
                                {exporting ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Download className="w-4 h-4" />
                                )}
                                {exporting ? "Exporting..." : `Export ${exportFormat.toUpperCase()}`}
                            </button>

                            {exportData.length > 0 && (
                                <p className="text-xs text-text-muted text-center">
                                    Last export: {exportData.length} rows
                                </p>
                            )}
                        </div>
                    </motion.div>

                    {/* Email Scheduling Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.15 }}
                        className="rounded-xl bg-white border border-border-subtle p-6"
                    >
                        <div className="flex items-center gap-2 mb-5">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Mail className="w-4 h-4 text-primary" />
                            </div>
                            <h3 className="text-base font-bold text-text-primary">Schedule Email Reports</h3>
                        </div>

                        <div className="space-y-4">
                            {/* Device Selection */}
                            <div className="relative z-20" ref={scheduleDropdownRef}>
                                <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5 block">
                                    Device
                                </label>
                                <button
                                    onClick={() => setScheduleDropdownOpen(!scheduleDropdownOpen)}
                                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
                                >
                                    {scheduleDevice ? (
                                        <span className="flex items-center gap-2 truncate">
                                            <DeviceStatusDot serial={scheduleDeviceMeta.serial} />
                                            <span className="truncate">
                                                {scheduleDeviceMeta.name || scheduleDevice}
                                            </span>
                                        </span>
                                    ) : (
                                        <span className="text-text-muted">No devices available</span>
                                    )}
                                    <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${scheduleDropdownOpen ? "rotate-180" : ""}`} />
                                </button>

                                <AnimatePresence>
                                    {scheduleDropdownOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                                            className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-border-subtle rounded-lg shadow-xl overflow-hidden py-1 max-h-60 overflow-y-auto"
                                        >
                                            {allDevices.length === 0 ? (
                                                <p className="px-3 py-2 text-sm text-text-muted text-center">No devices found</p>
                                            ) : (
                                                allDevices.map((d: Device) => {
                                                    const key = d.id || d.serialNumber || "";
                                                    const sn = d.serialNumber || d.id || "";
                                                    const isSelected = scheduleDevice === key;
                                                    return (
                                                        <button
                                                            key={key}
                                                            onClick={() => {
                                                                setScheduleDevice(key);
                                                                setScheduleDropdownOpen(false);
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

                            {/* Email */}
                            <div>
                                <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5 block">
                                    Recipient Email
                                </label>
                                <input
                                    type="email"
                                    value={scheduleEmail}
                                    onChange={(e) => setScheduleEmail(e.target.value)}
                                    placeholder="reports@company.com"
                                    className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
                                />
                            </div>

                            {/* Frequency */}
                            <div>
                                <label className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5 block">
                                    Frequency
                                </label>
                                <div className="flex gap-2">
                                    {["daily", "weekly", "monthly"].map((f) => (
                                        <button
                                            key={f}
                                            onClick={() => setScheduleFrequency(f)}
                                            className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium capitalize transition-all ${scheduleFrequency === f
                                                    ? "border-primary bg-primary/5 text-primary"
                                                    : "border-border-subtle text-text-secondary hover:border-border-default"
                                                }`}
                                        >
                                            {f}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Save */}
                            <button
                                onClick={handleSaveSchedule}
                                disabled={savingSchedule}
                                className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                            >
                                {savingSchedule ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Plus className="w-4 h-4" />
                                )}
                                {savingSchedule ? "Saving..." : "Create Schedule"}
                            </button>
                        </div>

                        {/* Existing Schedules */}
                        <div className="mt-5 pt-4 border-t border-border-subtle">
                            <div className="flex items-center gap-2 mb-3">
                                <Clock className="w-4 h-4 text-text-muted" />
                                <h4 className="text-sm font-bold text-text-primary">Active Schedules</h4>
                            </div>
                            {loadingSchedules ? (
                                <div className="flex justify-center py-4">
                                    <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
                                </div>
                            ) : schedules.length === 0 ? (
                                <p className="text-xs text-text-muted text-center py-3">No schedules configured</p>
                            ) : (
                                <div className="space-y-2">
                                    {schedules.map((s: any, i: number) => (
                                        <div
                                            key={i}
                                            className="flex items-center justify-between p-3 rounded-lg bg-surface-muted/50"
                                        >
                                            <div>
                                                <p className="text-sm font-medium text-text-primary">{s.email}</p>
                                                <p className="text-[11px] text-text-muted">
                                                    {s.device} • {s.frequency} • {s.reportType || "csv"}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteSchedule(s.device)}
                                                className="p-1.5 rounded-md text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            </div>
        </DashboardLayout>
    );
}
