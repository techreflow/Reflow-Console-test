"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import DashboardLayout from "@/components/DashboardLayout";
import LogoLoader from "@/components/LogoLoader";
import {
    getUserEmail,
    getUserName,
    getOrganization,
    inviteToOrganization,
    removeMember as apiRemoveMember,
    updateMemberRole,
    getOrganizationActivities,
    getAllProjects,
    shareProject,
    isAuthenticated,
    isOwnerProject,
    normalizeProjectsResponse,
} from "@/lib/api";
import {
    UserPlus, Trash2, ChevronDown, AtSign, RefreshCw,
    Building2, Users, Activity, Shield, AlertCircle, CheckCircle2, X,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────
interface Member {
    id: string;
    name?: string;
    email: string;
    role: string;
    joinedAt?: string;
    projects?: { id?: string; name: string }[];
}

interface OrgActivity {
    id?: string;
    action?: string;
    description?: string;
    createdAt?: string;
    user?: { name?: string; email?: string };
}

interface Project {
    id?: string;
    _id?: string;
    name: string;
    accessLevel?: string;
    createdBy?: { email?: string };
}

const ROLE_COLORS: Record<string, string> = {
    OWNER: "bg-purple-100 text-purple-700",
    ADMIN: "bg-red-100 text-red-700",
    MEMBER: "bg-blue-100 text-blue-700",
    EDITOR: "bg-blue-100 text-blue-700",
    VIEWER: "bg-green-100 text-green-700",
};

const AVATAR_COLORS = [
    "from-blue-400 to-blue-600",
    "from-violet-400 to-violet-600",
    "from-emerald-400 to-emerald-600",
    "from-orange-400 to-orange-600",
    "from-rose-400 to-rose-600",
    "from-teal-400 to-teal-600",
];

function getInitials(name?: string, email?: string) {
    if (name) return name.split(" ").map(w => w[0]?.toUpperCase()).slice(0, 2).join("");
    if (email) return email.slice(0, 2).toUpperCase();
    return "??";
}

function hashIdx(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    return Math.abs(h);
}

function normalizeMemberProjects(value: unknown): { id?: string; name: string }[] {
    if (!Array.isArray(value)) return [];

    return value
        .map((entry) => {
            if (typeof entry === "string") return { name: entry };
            if (!entry || typeof entry !== "object") return null;

            const project = entry as Record<string, unknown>;
            const nestedProject =
                project.project && typeof project.project === "object"
                    ? (project.project as Record<string, unknown>)
                    : null;

            const name = String(
                project.name ||
                project.projectName ||
                nestedProject?.name ||
                ""
            ).trim();

            if (!name) return null;

            return {
                id: String(project.id || project._id || project.projectId || nestedProject?.id || nestedProject?._id || ""),
                name,
            };
        })
        .filter((project): project is { id?: string; name: string } => Boolean(project));
}

// ─── Toast component ─────────────────────────────────────────────────────────
function Toast({ msg, ok, onClose }: { msg: string; ok: boolean; onClose: () => void }) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const t = setTimeout(onClose, 3500);
        return () => clearTimeout(t);
    }, [onClose]);

    if (!mounted) return null;

    return createPortal(
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className={`fixed top-20 right-4 md:right-5 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium border ${ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}`}>
            {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-red-500" />}
            {msg}
            <button onClick={onClose}><X className="w-3.5 h-3.5 opacity-50 hover:opacity-100" /></button>
        </motion.div>,
        document.body
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AccessPage() {
    const email = getUserEmail();
    const fullName = getUserName();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [orgName, setOrgName] = useState("");
    const [members, setMembers] = useState<Member[]>([]);
    const [activities, setActivities] = useState<OrgActivity[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [ownedProjectCount, setOwnedProjectCount] = useState(0);

    // Invite form
    const [inviteEmail, setInviteEmail] = useState("");
    const [selectedRole, setSelectedRole] = useState("MEMBER");
    const [selectedProjectId, setSelectedProjectId] = useState("");
    const [inviteMode, setInviteMode] = useState<"org" | "project">("org");
    const [inviting, setInviting] = useState(false);

    // Remove confirm
    const [removingId, setRemovingId] = useState<string | null>(null);
    // Role change
    const [changingRoleId, setChangingRoleId] = useState<string | null>(null);

    // Toast
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
    const showToast = (msg: string, ok = true) => setToast({ msg, ok });

    // Load everything
    const loadData = useCallback(async (silent = false) => {
        if (!isAuthenticated()) { setLoading(false); return; }
        if (silent) setRefreshing(true); else setLoading(true);
        try {
            const [orgData, actData, projData] = await Promise.all([
                getOrganization(),
                getOrganizationActivities(),
                getAllProjects(),
            ]);

            // Org + members
            const org = orgData?.data || orgData;
            setOrgName(org?.name || org?.organization?.name || "Your Organisation");
            const rawMembers =
                org?.members || org?.organization?.members ||
                orgData?.members || [];
            setMembers(
                rawMembers.map((m: {
                    _id?: string; id?: string; name?: string;
                    email?: string; user?: { name?: string; email?: string };
                    role?: string; joinedAt?: string; createdAt?: string;
                    projects?: unknown; memberProjects?: unknown; projectAccess?: unknown; accessibleProjects?: unknown;
                }) => ({
                    id: m._id || m.id || m.user?.email || m.email || String(Math.random()),
                    name: m.name || m.user?.name,
                    email: m.email || m.user?.email || "",
                    role: (m.role || "MEMBER").toUpperCase(),
                    joinedAt: m.joinedAt || m.createdAt,
                    projects: normalizeMemberProjects(
                        m.projects || m.memberProjects || m.projectAccess || m.accessibleProjects || []
                    ),
                }))
            );

            // Activities
            const acts = actData?.data?.activities || actData?.activities || actData?.data || [];
            setActivities(Array.isArray(acts) ? acts.slice(0, 10) : []);

            // Projects
            const normalizedProjects = normalizeProjectsResponse(projData);
            const allProjects = normalizedProjects.projects as Project[];
            const shareableProjects = allProjects.filter((project) => isOwnerProject(project, email || ""));
            const inviteProjects = shareableProjects.length > 0 ? shareableProjects : allProjects;

            setProjects(inviteProjects);
            setOwnedProjectCount(
                normalizedProjects.stats.createdByMeCount ||
                allProjects.filter((project) => isOwnerProject(project, email || "")).length
            );

            if (inviteProjects.length > 0 && !selectedProjectId) {
                setSelectedProjectId(inviteProjects[0].id || inviteProjects[0]._id || "");
            }
        } catch (err) {
            console.error("Failed to load access data:", err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { loadData(); }, []);

    // Invite handler
    const handleInvite = async () => {
        if (!inviteEmail.trim()) return;
        setInviting(true);
        try {
            if (inviteMode === "org") {
                const res = await inviteToOrganization(inviteEmail.trim(), selectedRole);
                if (res?.error || res?.success === false) throw new Error(res?.message || res?.error);
                showToast(`✓ Invited ${inviteEmail} successfully as ${selectedRole}`);
            } else {
                if (!selectedProjectId) { showToast("Please select a project", false); return; }
                const res = await shareProject(selectedProjectId, inviteEmail.trim(), selectedRole);
                if (res?.error || res?.success === false) throw new Error(res?.message || res?.error);
                showToast(`✓ Added ${inviteEmail} to project successfully as ${selectedRole}`);
            }
            setInviteEmail("");
            await loadData(true);
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : "Invite failed", false);
        } finally {
            setInviting(false);
        }
    };

    // Remove handler
    const handleRemove = async (memberId: string) => {
        setRemovingId(memberId);
        try {
            await apiRemoveMember(memberId);
            setMembers(prev => prev.filter(m => m.id !== memberId));
            showToast("✓ Member removed successfully");
        } catch {
            showToast("Failed to remove member", false);
        } finally {
            setRemovingId(null);
        }
    };

    // Role change handler
    const handleRoleChange = async (memberId: string, newRole: string) => {
        setChangingRoleId(memberId);
        try {
            await updateMemberRole(memberId, newRole);
            setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
            showToast(`✓ Role updated to ${newRole}`);
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : "Failed to update role", false);
        } finally {
            setChangingRoleId(null);
        }
    };

    // Layout renders instantly; content shows inline loading state

    const isCurrentUserOwner = members.find(m =>
        m.email === email && ["OWNER", "ADMIN"].includes(m.role)
    );

    if (loading) {
        return (
            <DashboardLayout
                title="Access"
                breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Organisation Access" }]}
                user={{ name: fullName || "", email: email || "" }}
            >
                <div className="py-16">
                    <LogoLoader text="Loading access data..." />
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout
            title="Access"
            breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Organisation Access" }]}
            user={{ name: fullName || "", email: email || "" }}
        >
            {/* Toast */}
            <AnimatePresence>
                {toast && <Toast msg={toast.msg} ok={toast.ok} onClose={() => setToast(null)} />}
            </AnimatePresence>

            <div className="space-y-6">
                {/* ── Header ── */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Building2 className="w-5 h-5 text-slate-400" />
                            <h2 className="text-2xl font-bold text-slate-900">{orgName}</h2>
                        </div>
                        <p className="text-sm text-slate-500">Manage who has access to your organisation and projects.</p>
                    </div>
                    <button onClick={() => loadData(true)} disabled={refreshing}
                        className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors self-start sm:self-auto">
                        <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                    </button>
                </motion.div>

                {/* ── Stats row ── */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {[
                        { label: "Total Members", value: members.length, icon: <Users className="w-5 h-5 text-blue-500" />, bg: "bg-blue-50 border-blue-100" },
                        { label: "Owned Projects", value: ownedProjectCount, icon: <Shield className="w-5 h-5 text-violet-500" />, bg: "bg-violet-50 border-violet-100" },
                        { label: "Recent Activity", value: activities.length, icon: <Activity className="w-5 h-5 text-emerald-500" />, bg: "bg-emerald-50 border-emerald-100" },
                    ].map(card => (
                        <motion.div key={card.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                            className={`rounded-xl border p-4 flex items-center gap-3 ${card.bg}`}>
                            <div className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center flex-shrink-0">{card.icon}</div>
                            <div>
                                <p className="text-2xl font-bold text-slate-800">{card.value}</p>
                                <p className="text-xs text-slate-500">{card.label}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* ── Invite Panel ── */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    className="rounded-xl bg-white border border-slate-100 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                            <UserPlus className="w-4 h-4 text-blue-500" /> Invite Member
                        </h3>
                        {/* Mode toggle — sliding pill */}
                        <div className="relative inline-flex rounded-xl bg-slate-100 p-1 gap-0.5 text-xs">
                            {(["org", "project"] as const).map(m => (
                                <button key={m} onClick={() => setInviteMode(m)}
                                    className="relative z-10 px-4 py-1.5 font-semibold transition-colors duration-200 rounded-lg"
                                    style={{ color: inviteMode === m ? "#fff" : "#64748b" }}>
                                    {inviteMode === m && (
                                        <motion.span
                                            layoutId="invite-mode-pill"
                                            className="absolute inset-0 rounded-lg bg-blue-600 shadow-sm"
                                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                        />
                                    )}
                                    <span className="relative z-10">{m === "org" ? "Organisation" : "Project"}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-4 items-end">
                        {/* Email */}
                        <div className="flex-1 min-w-0">
                            <label className="text-sm font-medium text-slate-700 mb-1.5 block">Email Address</label>
                            <div className="relative">
                                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                                    placeholder="colleague@company.com"
                                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200" />
                            </div>
                        </div>

                        {/* Project selector (project mode only) */}
                        {inviteMode === "project" && (
                            <div className="flex-1 min-w-0">
                                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Select Project</label>
                                <div className="relative">
                                    <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}
                                        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:border-blue-400 appearance-none cursor-pointer">
                                        {projects.map(p => (
                                            <option key={p.id || p._id} value={p.id || p._id}>{p.name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                </div>
                            </div>
                        )}

                        {/* Role */}
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-1.5 block">Role</label>
                            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                                {(inviteMode === "org" ? ["MEMBER", "ADMIN"] : ["VIEWER", "EDITOR"]).map(role => (
                                    <button key={role} onClick={() => setSelectedRole(role)}
                                        className={`px-4 py-2.5 text-sm font-medium transition-colors ${selectedRole === role ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                                        {role.charAt(0) + role.slice(1).toLowerCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Invite button */}
                        <button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}
                            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap">
                            <UserPlus className="w-4 h-4" />
                            {inviting ? "Inviting…" : "Invite"}
                        </button>
                    </div>
                </motion.div>

                {/* ── Members Table ── */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                    className="rounded-xl bg-white border border-slate-100 overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                        <h3 className="text-base font-bold text-slate-800">
                            Organisation Members
                        </h3>
                        <span className="text-sm text-slate-500 font-medium">{members.length} member{members.length !== 1 ? "s" : ""}</span>
                    </div>

                    {/* Col headers */}
                    <div className="grid grid-cols-[1.3fr_1.7fr_0.8fr_1.4fr_1fr_0.5fr] gap-4 px-6 py-2.5 bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                        <span>Name</span><span>Email</span><span>Role</span><span>Projects</span><span>Joined</span><span></span>
                    </div>

                    {members.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                                <Users className="w-7 h-7 text-slate-400" />
                            </div>
                            <p className="text-sm font-medium text-slate-600">No members yet</p>
                            <p className="text-xs text-slate-400">Invite someone above to get started</p>
                        </div>
                    ) : (
                        members.map((member, i) => (
                            <motion.div key={member.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                                className="grid grid-cols-[1.3fr_1.7fr_0.8fr_1.4fr_1fr_0.5fr] gap-4 items-center px-6 py-3.5 border-b border-slate-50 last:border-0 hover:bg-slate-50/70 transition-colors group">
                                {/* Name + avatar */}
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${AVATAR_COLORS[hashIdx(member.email) % AVATAR_COLORS.length]} flex items-center justify-center flex-shrink-0`}>
                                        <span className="text-[11px] font-bold text-white">{getInitials(member.name, member.email)}</span>
                                    </div>
                                    <span className="text-sm font-semibold text-slate-800 truncate">{member.name || member.email.split("@")[0]}</span>
                                    {member.email === email && (
                                        <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">You</span>
                                    )}
                                </div>

                                <span className="text-sm text-slate-500 truncate">{member.email}</span>

                                {/* Role — editable dropdown for owners, static badge otherwise */}
                                {isCurrentUserOwner && member.email !== email && member.role !== "OWNER" ? (
                                    <div className="relative">
                                        <select
                                            value={member.role}
                                            disabled={changingRoleId === member.id}
                                            onChange={(e) => handleRoleChange(member.id, e.target.value)}
                                            className={`text-[11px] font-bold px-2.5 py-1 rounded border cursor-pointer appearance-none pr-6 ${ROLE_COLORS[member.role] || "bg-slate-100 text-slate-500"} border-transparent focus:outline-none focus:ring-1 focus:ring-blue-400`}
                                        >
                                            <option value="MEMBER">MEMBER</option>
                                            <option value="ADMIN">ADMIN</option>
                                        </select>
                                        {changingRoleId === member.id && (
                                            <RefreshCw className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-slate-400" />
                                        )}
                                    </div>
                                ) : (
                                    <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded text-[11px] font-bold w-fit ${ROLE_COLORS[member.role] || "bg-slate-100 text-slate-500"}`}>
                                        {member.role}
                                    </span>
                                )}

                                <div className="flex flex-wrap gap-1">
                                    {(member.projects || []).length > 0 ? (
                                        (member.projects || []).slice(0, 2).map((project) => (
                                            <span
                                                key={`${member.id}-${project.id || project.name}`}
                                                className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold"
                                                title={project.name}
                                            >
                                                {project.name}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-xs text-slate-400">No project access</span>
                                    )}
                                    {(member.projects || []).length > 2 && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-200 text-slate-600 text-[10px] font-semibold">
                                            +{(member.projects || []).length - 2}
                                        </span>
                                    )}
                                </div>

                                <span className="text-xs text-slate-400">
                                    {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                                </span>

                                {/* Remove (only for admins, not yourself) */}
                                {isCurrentUserOwner && member.email !== email ? (
                                    <button onClick={() => handleRemove(member.id)} disabled={removingId === member.id}
                                        className="p-1.5 rounded-md hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-30">
                                        {removingId === member.id
                                            ? <RefreshCw className="w-4 h-4 animate-spin" />
                                            : <Trash2 className="w-4 h-4" />}
                                    </button>
                                ) : <span />}
                            </motion.div>
                        ))
                    )}
                </motion.div>

                {/* ── Activity Log ── */}
                {activities.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                        className="rounded-xl bg-white border border-slate-100 overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-slate-400" />
                            <h3 className="text-base font-bold text-slate-800">Recent Activity</h3>
                        </div>
                        <div className="divide-y divide-slate-50">
                            {activities.map((act, i) => (
                                <div key={act.id || i} className="px-6 py-3 flex items-start gap-3">
                                    <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-sm text-slate-700">{act.description || act.action || "Activity recorded"}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            {act.user?.name && <span className="text-xs text-slate-400">{act.user.name}</span>}
                                            {act.createdAt && (
                                                <span className="text-xs text-slate-400">
                                                    {new Date(act.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </div>
        </DashboardLayout>
    );
}
