"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useProjects } from "@/lib/ProjectsContext";
import { getUserEmail, isOwnerProject } from "@/lib/api";

const roleStyles: Record<string, string> = {
    Editor: "badge-editor",
    Viewer: "badge-viewer",
    Admin: "badge-admin",
    EDITOR: "badge-editor",
    VIEWER: "badge-viewer",
    ADMIN: "badge-admin",
};

const avatarColors = ["bg-blue-500", "bg-purple-500", "bg-teal-500", "bg-orange-500", "bg-rose-500"];

export default function SharedWidget() {
    const { projects, loading } = useProjects();

    const sharedProjects = useMemo(() => {
        const userEmail = getUserEmail();
        return projects
            .filter((p) => !isOwnerProject(p, userEmail))
            .map((p) => {
                const myMembership = p.members?.find(
                    (m: any) => m.user?.email === userEmail
                );
                const fallbackRole = typeof p.accessLevel === "string" ? p.accessLevel : "Viewer";
                return {
                    id: p.id || p._id || "",
                    name: p.name,
                    owner: p.createdBy?.name || "Unknown",
                    role: (myMembership?.role || fallbackRole).charAt(0).toUpperCase() +
                          (myMembership?.role || fallbackRole).slice(1).toLowerCase(),
                };
            });
    }, [projects]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="rounded-xl bg-white border border-border-subtle p-5"
        >
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-text-primary">Shared with you</h3>
                <Link
                    href="/shared"
                    className="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center hover:bg-primary-hover transition-colors"
                >
                    <Plus className="w-4 h-4" />
                </Link>
            </div>

            <div className="space-y-3">
                {loading ? (
                    <div className="space-y-3 animate-pulse">
                        {[1, 2].map((i) => (
                            <div key={i} className="flex items-center gap-3 p-2">
                                <div className="w-9 h-9 rounded-full bg-slate-100" />
                                <div className="flex-1 space-y-1.5">
                                    <div className="h-3 bg-slate-100 rounded w-3/4" />
                                    <div className="h-2 bg-slate-100 rounded w-1/2" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : sharedProjects.length === 0 ? (
                    <p className="text-xs text-text-muted text-center py-4">
                        No projects shared with you yet.
                    </p>
                ) : (
                    sharedProjects.slice(0, 4).map((project, i) => (
                        <div
                            key={project.id}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-muted transition-colors cursor-pointer"
                        >
                            <div
                                className={`w-9 h-9 rounded-full ${
                                    avatarColors[i % avatarColors.length]
                                } flex items-center justify-center flex-shrink-0`}
                            >
                                <span className="text-xs font-bold text-white">
                                    {project.owner
                                        .split(" ")
                                        .map((n) => n[0])
                                        .join("")}
                                </span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-text-primary truncate">
                                    {project.name}
                                </p>
                                <p className="text-[11px] text-text-muted">
                                    Owner: {project.owner}
                                </p>
                            </div>
                            <span className={`badge ${roleStyles[project.role] || "badge-viewer"}`}>
                                {project.role}
                            </span>
                        </div>
                    ))
                )}
            </div>

            <Link
                href="/shared"
                className="mt-3 w-full py-2 text-xs font-medium text-text-muted border border-border-subtle rounded-lg hover:bg-surface-muted transition-colors block text-center"
            >
                View All Shared Projects
            </Link>
        </motion.div>
    );
}
