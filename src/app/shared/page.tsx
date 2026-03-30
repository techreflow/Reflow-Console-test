"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import {
    shareProject,
    getUserEmail,
    getUserName,
    isAuthenticated,
    isOwnerProject,
} from "@/lib/api";
import { useProjects } from "@/lib/ProjectsContext";
import {
    ExternalLink,
    X,
    Eye,
    Pencil,
    Shield,
    Info,
    Loader2,
} from "lucide-react";

interface SharedProject {
    id?: string;
    _id?: string;
    name: string;
    updatedAgo?: string;
    owner: string;
    ownerEmail: string;
    role: "Editor" | "Viewer" | "Admin" | "EDITOR" | "VIEWER" | "ADMIN";
    devices: number;
}

interface OwnProject {
    id?: string;
    _id?: string;
    name: string;
}

interface PendingInvite {
    email: string;
    project: string;
    role: string;
}



const roleStyles: Record<string, string> = {
    Editor: "badge-editor",
    Viewer: "badge-viewer",
    Admin: "badge-admin",
    EDITOR: "badge-editor",
    VIEWER: "badge-viewer",
    ADMIN: "badge-admin",
};

const projectIconStyles = [
    { bg: "bg-blue-100", emoji: "🏭" },
    { bg: "bg-yellow-100", emoji: "☀️" },
    { bg: "bg-green-100", emoji: "🚚" },
];

export default function SharedAccessPage() {
    const [selectedProject, setSelectedProject] = useState("");
    const [selectedRole, setSelectedRole] = useState("EDITOR");
    const [inviteEmail, setInviteEmail] = useState("");
    const [sharedProjects, setSharedProjects] = useState<SharedProject[]>([]);
    const [ownProjects, setOwnProjects] = useState<OwnProject[]>([]);
    const [pendingInvites] = useState<PendingInvite[]>([]);
    const [loading, setLoading] = useState(false);
    const [inviteStatus, setInviteStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

    const email = getUserEmail();
    const fullName = getUserName();

    const { projects: cachedProjects } = useProjects();

    useEffect(() => {
        if (!isAuthenticated()) return;
        const userEmail = getUserEmail();

        // Projects I own (for share dropdown)
        const owned = cachedProjects
            .filter((p: any) => isOwnerProject(p, userEmail))
            .map((p: any) => ({
                id: p.id || p._id,
                name: p.name,
            }));

        if (owned.length > 0) {
            setOwnProjects(owned);
            setSelectedProject(owned[0].id || "");
        }

        // Projects shared with me
        const shared = cachedProjects
            .filter((p: any) => !isOwnerProject(p, userEmail))
            .map((p: any) => {
                const myMembership = p.members?.find(
                    (m: any) => m.user?.email === userEmail
                );
                const accessRole = typeof p.accessLevel === "string" ? p.accessLevel : "Viewer";
                return {
                    id: p.id || p._id,
                    name: p.name,
                    owner: p.createdBy?.name || "Unknown",
                    ownerEmail: p.createdBy?.email || "",
                    role: (myMembership?.role || accessRole) as SharedProject["role"],
                    devices: p.devices?.length || 0,
                    updatedAgo: "Recently",
                };
            });

        setSharedProjects(shared);
    }, [cachedProjects]);

    async function handleInvite() {
        if (!inviteEmail || !selectedProject) {
            setInviteStatus({ type: "error", message: "Please fill in all fields" });
            return;
        }

        setLoading(true);
        setInviteStatus(null);

        try {
            const result = await shareProject(selectedProject, inviteEmail, selectedRole);
            if (result?.error) {
                setInviteStatus({ type: "error", message: result.error });
            } else {
                setInviteStatus({ type: "success", message: `Invitation sent to ${inviteEmail}` });
                setInviteEmail("");
            }
        } catch (err) {
            console.error("Error sharing project:", err);
            setInviteStatus({ type: "error", message: "Failed to send invitation" });
        } finally {
            setLoading(false);
        }
    }

    const displayRole = (role: string) => {
        const r = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
        return r;
    };

    return (
        <DashboardLayout
            title="Shared Access"
            breadcrumbs={[
                { label: "Settings", href: "/settings" },
                { label: "Shared Access" },
            ]}
            user={{ name: fullName || "", email: email || "" }}
        >
            <div className="space-y-8">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4"
                >
                    <div>
                        <h2 className="text-2xl font-bold text-text-primary">
                            Access & Permissions
                        </h2>
                        <p className="text-sm text-text-muted mt-1">
                            Manage project sharing and team permissions across your organization.
                        </p>
                    </div>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-medium">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        System Operational
                    </div>
                </motion.div>

                {/* Projects Shared with You */}
                <motion.section
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">📦</span>
                            <h3 className="text-base font-bold text-text-primary">
                                Projects Shared with You
                            </h3>
                        </div>
                        <button className="text-xs font-medium text-primary hover:text-primary-hover transition-colors">
                            View Archived
                        </button>
                    </div>

                    <div className="rounded-xl bg-white border border-border-subtle overflow-hidden">
                        {/* Table Header */}
                        <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_0.5fr] gap-4 table-header">
                            <span>Project Name</span>
                            <span>Owner</span>
                            <span>Role</span>
                            <span>Devices</span>
                            <span>Actions</span>
                        </div>

                        {/* Table Rows */}
                        {sharedProjects.map((project, i) => (
                            <div
                                key={project.name + i}
                                className="grid grid-cols-[2fr_1.5fr_1fr_1fr_0.5fr] gap-4 table-cell items-center hover:bg-surface-muted/50 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div
                                        className={`w-9 h-9 rounded-lg ${projectIconStyles[i % projectIconStyles.length].bg} flex items-center justify-center text-sm`}
                                    >
                                        {projectIconStyles[i % projectIconStyles.length].emoji}
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-text-primary">
                                            {project.name}
                                        </p>
                                        <p className="text-[11px] text-text-muted">{project.updatedAgo}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center">
                                        <span className="text-[10px] font-bold text-white">
                                            {project.owner.charAt(0)}
                                        </span>
                                    </div>
                                    <span className="text-sm text-text-secondary">{project.ownerEmail}</span>
                                </div>

                                <div>
                                    <span className={`badge ${roleStyles[project.role] || "badge-viewer"}`}>
                                        {displayRole(project.role)}
                                    </span>
                                </div>

                                <div className="flex items-center gap-1.5 text-sm text-text-secondary">
                                    <span className="text-text-muted">((•))</span>
                                    {project.devices}
                                </div>

                                <div>
                                    <button className="p-1.5 rounded-md text-text-muted hover:bg-surface-muted transition-colors">
                                        <ExternalLink className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}

                        {/* Footer */}
                        <div className="px-4 py-3 flex items-center justify-between border-t border-border-subtle bg-surface-muted/30">
                            <span className="text-xs text-text-muted">
                                Showing {sharedProjects.length} shared project{sharedProjects.length !== 1 ? "s" : ""}
                            </span>
                            <div className="flex items-center gap-2 text-xs">
                                <button className="text-text-muted hover:text-text-primary transition-colors">
                                    Previous
                                </button>
                                <button className="text-text-primary font-medium">Next</button>
                            </div>
                        </div>
                    </div>
                </motion.section>

                {/* Grant Access & Pending Invites */}
                <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6">
                    {/* Grant Access */}
                    <motion.section
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 }}
                    >
                        <div className="flex items-center gap-2 mb-4">
                            <span className="text-lg">⭐</span>
                            <h3 className="text-base font-bold text-text-primary">Grant Access</h3>
                        </div>

                        <div className="rounded-xl bg-white border border-border-subtle p-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                                <div>
                                    <label className="text-sm font-medium text-text-primary mb-1.5 block">
                                        Select Project
                                    </label>
                                    <select
                                        value={selectedProject}
                                        onChange={(e) => setSelectedProject(e.target.value)}
                                        className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                                    >
                                        {ownProjects.length > 0 ? (
                                            ownProjects.map((p) => (
                                                <option key={p.id || p._id} value={p.id || p._id}>
                                                    {p.name}
                                                </option>
                                            ))
                                        ) : (
                                            <option value="">No projects available</option>
                                        )}
                                    </select>
                                    <p className="text-[11px] text-text-muted mt-1">
                                        Choose the project you want to share.
                                    </p>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-text-primary mb-1.5 block">
                                        User Email
                                    </label>
                                    <input
                                        type="email"
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                        placeholder="colleague@company.com"
                                        className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                                    />
                                    <p className="text-[11px] text-text-muted mt-1">
                                        We&apos;ll send an email invitation with instructions.
                                    </p>
                                </div>
                            </div>

                            <p className="text-sm font-medium text-text-primary mb-3">
                                Permission Level
                            </p>
                            <div className="grid grid-cols-3 gap-3 mb-6">
                                {[
                                    {
                                        key: "VIEWER",
                                        label: "Viewer",
                                        icon: Eye,
                                        desc: "Can view dashboards and device status. Cannot make changes.",
                                    },
                                    {
                                        key: "EDITOR",
                                        label: "Editor",
                                        icon: Pencil,
                                        desc: "Can modify device settings, create alerts, and edit dashboards.",
                                    },
                                    {
                                        key: "ADMIN",
                                        label: "Admin",
                                        icon: Shield,
                                        desc: "Full access including user management and project settings.",
                                    },
                                ].map((role) => {
                                    const Icon = role.icon;
                                    return (
                                        <button
                                            key={role.key}
                                            onClick={() => setSelectedRole(role.key)}
                                            className={`p-4 rounded-xl border text-left transition-all ${selectedRole === role.key
                                                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                                : "border-border-subtle hover:border-border-default"
                                                }`}
                                        >
                                            <div className="flex items-center gap-2 mb-2">
                                                <Icon className={`w-4 h-4 ${selectedRole === role.key ? "text-primary" : "text-text-muted"}`} />
                                                <span className="text-sm font-semibold text-text-primary">
                                                    {role.label}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-text-muted leading-relaxed">
                                                {role.desc}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>

                            {inviteStatus && (
                                <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${inviteStatus.type === "success"
                                    ? "bg-green-50 text-green-700 border border-green-200"
                                    : "bg-red-50 text-red-700 border border-red-200"
                                    }`}>
                                    {inviteStatus.message}
                                </div>
                            )}

                            <div className="flex justify-center">
                                <button
                                    onClick={handleInvite}
                                    disabled={loading}
                                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                                >
                                    {loading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        "➤"
                                    )}
                                    Invite User
                                </button>
                            </div>
                        </div>
                    </motion.section>

                    {/* Pending Invites */}
                    <motion.section
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.25 }}
                    >
                        <div className="flex items-center gap-2 mb-4">
                            <span className="text-lg">📨</span>
                            <h3 className="text-base font-bold text-text-primary">Pending Invites</h3>
                        </div>

                        <div className="rounded-xl bg-white border border-border-subtle p-5 space-y-3">
                            {pendingInvites.map((invite) => (
                                <div
                                    key={invite.email}
                                    className="flex items-center justify-between p-3 rounded-lg bg-surface-muted/50"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                                            <span className="text-[10px] font-bold text-blue-600">
                                                {invite.email.substring(0, 2).toUpperCase()}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-text-primary">
                                                {invite.email}
                                            </p>
                                            <p className="text-[11px] text-text-muted">
                                                {invite.project} • {invite.role}
                                            </p>
                                        </div>
                                    </div>
                                    <button className="p-1 rounded-md text-text-muted hover:text-error hover:bg-error/5 transition-colors">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}

                            <button className="w-full text-xs font-medium text-primary hover:text-primary-hover transition-colors py-2">
                                View all sent invitations
                            </button>
                        </div>

                        {/* Pro Tip */}
                        <div className="mt-4 rounded-xl bg-primary/5 border border-primary/10 p-4">
                            <div className="flex items-start gap-2">
                                <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-semibold text-text-primary mb-1">
                                        Pro Tip
                                    </p>
                                    <p className="text-xs text-text-muted leading-relaxed">
                                        You can create &quot;Read Only&quot; links for public sharing in the
                                        Project Settings page without inviting specific users.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </motion.section>
                </div>
            </div>
        </DashboardLayout>
    );
}
