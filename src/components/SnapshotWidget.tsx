"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Shield, AlertTriangle, Wifi, WifiOff } from "lucide-react";
import { useProjects } from "@/lib/ProjectsContext";

export default function SnapshotWidget() {
    const { projects, devices, loading } = useProjects();

    // Generate bar chart data from actual device counts per project
    const barData = useMemo(() => {
        if (projects.length === 0) {
            return [
                { height: 20, opacity: 0.35, label: "", count: 0 },
                { height: 30, opacity: 0.55, label: "", count: 0 },
                { height: 15, opacity: 0.25, label: "", count: 0 },
            ];
        }

        const projectCounts = projects.slice(0, 8).map((p) => {
            const projectId = (p as any).id || (p as any)._id;
            const nestedCount = Array.isArray((p as any).devices) ? (p as any).devices.length : 0;
            if (nestedCount > 0) {
                return { project: p, count: nestedCount };
            }
            const fallbackCount = devices.filter((d: any) => d.projectId === projectId).length;
            return { project: p, count: fallbackCount };
        });

        const maxDevices = Math.max(1, ...projectCounts.map((x) => x.count));

        return projectCounts.map(({ project, count }) => {
            const ratio = count / maxDevices;
            const pct = Math.max(15, Math.round(ratio * 100));
            const opacity = count === maxDevices ? 1 : Math.max(0.25, Number((ratio * 0.9).toFixed(2)));
            return {
                height: pct,
                opacity,
                label: (project as any).name || "Project",
                count,
            };
        });
    }, [projects, devices]);

    const totalDevices = devices.length;
    const totalProjects = projects.length;
    const systemHealthy = totalProjects > 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="rounded-xl bg-white border border-border-subtle p-5"
        >
            <h3 className="text-sm font-bold text-text-primary mb-4">
                Today&apos;s Snapshot
            </h3>

            {/* Usage Load Bar Chart */}
            <div className="mb-5">
                <p className="text-xs text-text-muted mb-3">Devices per Project</p>
                {loading ? (
                    <div className="flex items-end gap-2 h-24 animate-pulse">
                        {[40, 60, 45, 80, 55, 70].map((h, i) => (
                            <div key={i} className="flex-1 bg-slate-100 rounded-t-md" style={{ height: `${h}%` }} />
                        ))}
                    </div>
                ) : (
                    <div className="flex items-end gap-2 h-24">
                        {barData.map((bar, i) => (
                            <motion.div
                                key={i}
                                initial={{ height: 0 }}
                                animate={{ height: `${bar.height}%` }}
                                transition={{ duration: 0.5, delay: 0.4 + i * 0.05 }}
                                className="flex-1 bg-primary rounded-t-md cursor-default"
                                style={{ opacity: bar.opacity }}
                                title={bar.label ? `${bar.label}: ${bar.count} devices` : undefined}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* System Status */}
            <div className="flex items-center justify-between py-3 border-t border-border-subtle">
                <div className="flex items-center gap-2">
                    {systemHealthy ? (
                        <CheckCircle2 className="w-5 h-5 text-success" />
                    ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                    )}
                    <span className="text-sm text-text-primary font-medium">System Status</span>
                </div>
                <span className={`text-sm font-semibold ${systemHealthy ? "text-success" : "text-amber-500"}`}>
                    {systemHealthy ? "Optimal" : "Setup Required"}
                </span>
            </div>

            {/* Total Devices */}
            <div className="flex items-center justify-between py-3 border-t border-border-subtle">
                <div className="flex items-center gap-2">
                    <Wifi className="w-5 h-5 text-text-muted" />
                    <span className="text-sm text-text-primary font-medium">Total Devices</span>
                </div>
                <span className="text-sm font-bold text-text-primary">{totalDevices}</span>
            </div>

            {/* Total Projects */}
            <div className="flex items-center justify-between py-3 border-t border-border-subtle">
                <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-text-muted" />
                    <span className="text-sm text-text-primary font-medium">Active Projects</span>
                </div>
                <span className="text-sm font-bold text-text-primary">{totalProjects}</span>
            </div>
        </motion.div>
    );
}
