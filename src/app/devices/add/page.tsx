"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import {
    createDevice,
    getAllProjects,
    getUserEmail,
    getUserName,
    isAuthenticated,
} from "@/lib/api";
import { useProjects } from "@/lib/ProjectsContext";
import {
    Eye,
    EyeOff,
    Info,
    HelpCircle,
    Upload,
    ExternalLink,
} from "lucide-react";

interface Project {
    id?: string;
    _id?: string;
    name: string;
}

function AddDeviceContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const email = getUserEmail();
    const fullName = getUserName();
    const { refresh } = useProjects();

    const urlProjectId = searchParams.get("projectId") || "";

    const [deviceName, setDeviceName] = useState("");
    const [serialNumber, setSerialNumber] = useState("");
    const [subscriptionKey, setSubscriptionKey] = useState("");
    const [description, setDescription] = useState("");
    const [showKey, setShowKey] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState(urlProjectId);

    useEffect(() => {
        async function loadProjects() {
            if (!isAuthenticated()) return;
            try {
                const data = await getAllProjects();
                const list: Project[] = data?.data?.projects || data?.projects || [];
                setProjects(list);
                if (!selectedProjectId && list.length > 0) {
                    setSelectedProjectId(list[0].id || list[0]._id || "");
                }
            } catch { /* ignore */ }
        }
        loadProjects();
    }, []);

    const handleRegister = async () => {
        if (!deviceName || !serialNumber || !subscriptionKey) {
            setError("Device Name, Serial Number, and Subscription Key are required.");
            return;
        }
        if (!selectedProjectId) {
            setError("Please select a project to add this device to.");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Register device directly without local secret key verification
            const result = await createDevice(selectedProjectId, serialNumber, subscriptionKey, deviceName, description);
            
            // If the API returns success: false or an error message (even on 200 OK)
            if (result?.success === false || result?.error || result?.message?.toLowerCase().includes("error")) {
                setError(result?.message || result?.error || "Failed to register device.");
                return;
            }
            
            await refresh();
            setSuccess(true);
            setTimeout(() => router.push(`/projects/${selectedProjectId}`), 1500);
        } catch (err: any) {
            console.error("Error registering device:", err);
            setError(err.message || "Failed to register device. Please check your details and try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <DashboardLayout
            title="Add Device"
            breadcrumbs={[
                { label: "Projects", href: "/projects" },
                ...(selectedProjectId ? [{ label: "Project", href: `/projects/${selectedProjectId}` }] : []),
                { label: "Add Device" },
            ]}
            user={{ name: fullName || "", email: email || "" }}
        >
            <div className="max-w-3xl mx-auto space-y-6">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                >
                    <h2 className="text-2xl font-bold text-text-primary">
                        Register New Device
                    </h2>
                    <p className="text-sm text-text-muted mt-1">
                        Provide the technical specifications to link your hardware to the
                        ReFlow network.
                    </p>
                </motion.div>

                {/* Success Message */}
                {success && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-4 rounded-xl bg-success/10 border border-success/30 text-success text-sm font-medium flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clipRule="evenodd"
                            />
                        </svg>
                        Device registered successfully! Redirecting...
                    </motion.div>
                )}

                {/* Form Card */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                    className="rounded-xl bg-white border border-border-subtle p-6 space-y-5"
                >
                    {/* Project Selector */}
                    {projects.length > 0 && (
                        <div>
                            <label className="text-sm font-semibold text-text-primary mb-1.5 block">
                                Project <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={selectedProjectId}
                                onChange={(e) => setSelectedProjectId(e.target.value)}
                                className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                            >
                                <option value="">Select a project...</option>
                                {projects.map((p) => (
                                    <option key={p.id || p._id} value={p.id || p._id}>
                                        {p.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Device Name & Serial Number */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-semibold text-text-primary mb-1.5 block">
                                Device Name
                            </label>
                            <input
                                type="text"
                                value={deviceName}
                                onChange={(e) => setDeviceName(e.target.value)}
                                placeholder="e.g. North Wing Sensor"
                                className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-text-primary mb-1.5 flex items-center gap-1.5">
                                Serial Number
                                <span className="relative group">
                                    <Info className="w-3.5 h-3.5 text-primary cursor-help" />
                                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-text-primary text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                        Found on the back plate of your hardware
                                    </span>
                                </span>
                            </label>
                            <input
                                type="text"
                                value={serialNumber}
                                onChange={(e) => setSerialNumber(e.target.value)}
                                placeholder="e.g. RF-9900-X"
                                className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                            />
                        </div>
                    </div>

                    {/* Subscription Key */}
                    <div>
                        <label className="text-sm font-semibold text-text-primary mb-1.5 flex items-center gap-1.5">
                            Subscription Key
                            <span className="text-text-muted">🔑</span>
                        </label>
                        <div className="relative">
                            <input
                                type={showKey ? "text" : "password"}
                                value={subscriptionKey}
                                onChange={(e) => setSubscriptionKey(e.target.value)}
                                placeholder="Enter your subscription key"
                                className="w-full px-3 py-2.5 pr-10 rounded-lg border border-border-subtle bg-white text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 font-mono"
                            />
                            <button
                                type="button"
                                onClick={() => setShowKey(!showKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                            >
                                {showKey ? (
                                    <EyeOff className="w-4 h-4" />
                                ) : (
                                    <Eye className="w-4 h-4" />
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="text-sm font-semibold text-text-primary mb-1.5 block">
                            Description{" "}
                            <span className="text-text-muted font-normal">(Optional)</span>
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Briefly describe the device location or purpose..."
                            rows={4}
                            className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 resize-none"
                        />
                    </div>
                </motion.div>

                {/* Info Card */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.15 }}
                    className="rounded-xl bg-surface-muted border border-border-subtle p-6 flex flex-col items-center text-center"
                >
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                        <Upload className="w-6 h-6 text-primary" />
                    </div>
                    <p className="text-sm text-text-muted">
                        Connecting a new device will consume{" "}
                        <span className="font-semibold text-text-primary">1 seat</span> from
                        your
                        <br />
                        current subscription tier.
                    </p>
                </motion.div>

                {/* Error */}
                {error && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-3 rounded-lg bg-error/10 border border-error/30 text-error text-sm"
                    >
                        {error}
                    </motion.div>
                )}

                {/* Actions */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    className="flex items-center justify-end gap-3"
                >
                    <button
                        onClick={() => router.back()}
                        className="px-5 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleRegister}
                        disabled={loading || success}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" />
                        </svg>
                        {loading ? "Registering..." : "Register Device"}
                    </button>
                </motion.div>

                {/* Help Card */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.25 }}
                    className="rounded-xl bg-surface-muted border border-border-subtle p-5 flex gap-4"
                >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <HelpCircle className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-text-primary">
                            Need help finding your Serial Number?
                        </p>
                        <p className="text-xs text-text-muted mt-1">
                            Our hardware components usually have a QR code on the back plate.
                            Scanning it will auto-fill most of these fields in the mobile app.
                        </p>
                        <a
                            href="#"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover transition-colors mt-2"
                        >
                            View Hardware Documentation
                            <ExternalLink className="w-3 h-3" />
                        </a>
                    </div>
                </motion.div>
            </div>
        </DashboardLayout>
    );
}

export default function AddDevicePage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
            <AddDeviceContent />
        </Suspense>
    );
}
