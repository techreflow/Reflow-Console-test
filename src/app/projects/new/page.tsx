"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import OrganizationSetup from "@/components/OrganizationSetup";
import LogoLoader from "@/components/LogoLoader";
import {
    createProject,
    getUserEmail,
    getUserName,
    isAuthenticated,
} from "@/lib/api";
import { useProjects } from "@/lib/ProjectsContext";
import { useOrgGuard } from "@/lib/useOrgGuard";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function NewProjectPage() {
    const router = useRouter();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showOrgSetup, setShowOrgSetup] = useState(false);

    const { refresh } = useProjects();

    const email = getUserEmail();
    const fullName = getUserName();

    // Guard: check if user belongs to an org
    const { orgChecked, hasOrg } = useOrgGuard();

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        if (!name.trim()) {
            setError("Project name is required");
            return;
        }

        if (!isAuthenticated()) {
            setError("Please log in to create a project. (Demo mode active)");
            return;
        }

        // Block if org check is done and no org found
        if (orgChecked && !hasOrg) {
            setShowOrgSetup(true);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const result = await createProject(name.trim(), description.trim());

            if (result?.status === "success" || result?.data) {
                // Success - redirect to project
                await refresh();
                const projectId = result?.data?.project?.id || result?.id || result?.data?.project?._id;
                if (projectId) {
                    router.push(`/projects/${projectId}`);
                } else {
                    router.push("/projects");
                }
                // Do NOT set loading to false here, so the button stays disabled during routing
            } else {
                setError(result?.error || result?.message || "Failed to create project");
                setLoading(false);
            }
        } catch (err: any) {
            console.error("Error creating project:", err);
            setError(err.message || "Failed to create project. Please try again.");
            setLoading(false);
        }
    }

    // Show org setup modal if triggered
    if (showOrgSetup) {
        return (
            <OrganizationSetup
                onComplete={() => {
                    setShowOrgSetup(false);
                    // Re-check org status — reload the page so the guard re-runs
                    window.location.reload();
                }}
            />
        );
    }

    // Still checking org status
    if (!orgChecked) {
        return <LogoLoader text="Checking organisation..." />;
    }

    // User has no org — show a clear gate, don't show the form
    if (!hasOrg) {
        return (
            <DashboardLayout
                title="New Project"
                breadcrumbs={[
                    { label: "Projects", href: "/projects" },
                    { label: "New Project" },
                ]}
                user={{ name: fullName || "", email: email || "" }}
            >
                <div className="max-w-lg mx-auto text-center py-20">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-6"
                    >
                        <span className="text-3xl">🏢</span>
                    </motion.div>
                    <h2 className="text-xl font-bold text-text-primary mb-2">
                        Organisation Required
                    </h2>
                    <p className="text-sm text-text-muted mb-8">
                        You need to create or join an organisation before you can create projects.
                        Projects and devices are always managed within an organisation.
                    </p>
                    <div className="flex items-center justify-center gap-3">
                        <button
                            onClick={() => router.back()}
                            className="px-4 py-2.5 rounded-lg border border-border-subtle text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors"
                        >
                            Go Back
                        </button>
                        <button
                            onClick={() => setShowOrgSetup(true)}
                            className="px-6 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
                        >
                            Set Up Organisation
                        </button>
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout
            title="New Project"
            breadcrumbs={[
                { label: "Projects", href: "/projects" },
                { label: "New Project" },
            ]}
            user={{ name: fullName || "", email: email || "" }}
        >
            <div className="max-w-2xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                >
                    <button
                        onClick={() => router.back()}
                        className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors mb-6"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Projects
                    </button>

                    <h2 className="text-2xl font-bold text-text-primary mb-1">
                        Create New Project
                    </h2>
                    <p className="text-sm text-text-muted mb-8">
                        Set up a new IoT project to start managing your devices.
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="rounded-xl bg-white border border-border-subtle p-6 space-y-5">
                            <div>
                                <label className="text-sm font-medium text-text-primary mb-1.5 block">
                                    Project Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g., Factory A - Temperature Monitoring"
                                    className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                                />
                            </div>

                            <div>
                                <label className="text-sm font-medium text-text-primary mb-1.5 block">
                                    Description
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Describe what this project monitors and its purpose..."
                                    rows={4}
                                    className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 resize-none"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                                {error}
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => router.back()}
                                className="px-5 py-2.5 rounded-lg border border-border-subtle text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                            >
                                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                                Create Project
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </DashboardLayout>
    );
}
