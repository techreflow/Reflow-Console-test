"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import {
    getUserEmail,
    getUserName,
    getProfile,
    generateOTP,
    updateUserPassword,
    isAuthenticated,
} from "@/lib/api";
import {
    User,
    Bell,
    Palette,
    Shield,
    Save,
    Moon,
    Sun,
    Monitor,
    CheckCircle2,
    AlertCircle,
} from "lucide-react";

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState("Profile");
    const [theme, setTheme] = useState("Light");

    // Profile form state
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [orgName, setOrgName] = useState("");
    const [orgRole, setOrgRole] = useState("Member");
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
    const [verificationCode, setVerificationCode] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [sendingOtp, setSendingOtp] = useState(false);
    const [otpCountdown, setOtpCountdown] = useState(0);
    const [updatingPassword, setUpdatingPassword] = useState(false);

    // For sidebar/header
    const fallbackName = getUserName();
    const fallbackEmail = getUserEmail();

    // Fetch real profile on mount
    useEffect(() => {
        async function load() {
            if (!isAuthenticated()) return;
            try {
                const res = await getProfile();
                const profile = res?.data?.profile;
                if (profile) {
                    const parts = (profile.name || "").split(" ");
                    setFirstName(parts[0] || "");
                    setLastName(parts.slice(1).join(" ") || "");
                    setEmail(profile.email || "");
                    setOrgName(profile.organization?.name || "");
                    setOrgRole(profile.organization?.role || "Member");
                }
            } catch {
                // fallback to JWT values
                const parts = (fallbackName || "").split(" ");
                setFirstName(parts[0] || "");
                setLastName(parts.slice(1).join(" ") || "");
                setEmail(fallbackEmail || "");
            }
        }
        load();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSave = async () => {
        setSaving(true);
        try {
            const { default: api } = await import("@/lib/api") as any;
            const fullName = [firstName, lastName].filter(Boolean).join(" ");
            await api.updateProfile?.({ name: fullName }) ?? 
                fetch("/api/profile", { method: "PUT", body: JSON.stringify({ name: fullName }) });
            setToast({ msg: "✓ Profile updated successfully", ok: true });
            window.dispatchEvent(new Event("reflow:user-info-changed"));
        } catch {
            setToast({ msg: "Failed to save changes", ok: false });
        } finally {
            setSaving(false);
            setTimeout(() => setToast(null), 3500);
        }
    };

    const handlePasswordUpdate = async () => {
        setToast(null);

        if (!verificationCode.trim() || !newPassword || !confirmPassword) {
            setToast({ msg: "Verification code, new password and confirm password are required.", ok: false });
            return;
        }
        if (newPassword.length < 6) {
            setToast({ msg: "New password must be at least 6 characters.", ok: false });
            return;
        }
        if (newPassword !== confirmPassword) {
            setToast({ msg: "New password and confirm password do not match.", ok: false });
            return;
        }

        setUpdatingPassword(true);
        try {
            await updateUserPassword({
                verificationCode: verificationCode.trim(),
                newPassword,
                confirmPassword,
            });
            setToast({ msg: "Password updated successfully.", ok: true });
            setVerificationCode("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Failed to update password.";
            setToast({ msg: message, ok: false });
        } finally {
            setUpdatingPassword(false);
            setTimeout(() => setToast(null), 3500);
        }
    };

    const handleSendPasswordOtp = async () => {
        setToast(null);
        const targetEmail = (email || fallbackEmail || "").trim();
        if (!targetEmail) {
            setToast({ msg: "Could not detect your email. Refresh and try again.", ok: false });
            return;
        }

        setSendingOtp(true);
        setOtpCountdown(30);

        // Countdown tick every second
        const countdownTick = setInterval(() => {
            setOtpCountdown(prev => {
                if (prev <= 1) { clearInterval(countdownTick); return 0; }
                return prev - 1;
            });
        }, 1000);

        try {
            await generateOTP(targetEmail, "login");
            setToast({ msg: `OTP sent to ${targetEmail}. Enter it below to update password.`, ok: true });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Failed to send OTP.";
            setToast({ msg: message, ok: false });
        } finally {
            clearInterval(countdownTick);
            setSendingOtp(false);
            setOtpCountdown(0);
            setTimeout(() => setToast(null), 5000);
        }
    };

    const tabs = [
        { name: "Profile", icon: User },
        { name: "Notifications", icon: Bell },
        { name: "Appearance", icon: Palette },
        { name: "Security", icon: Shield },
    ];

    const initials = [firstName[0], lastName[0]].filter(Boolean).join("").toUpperCase() || "U";

    return (
        <DashboardLayout
            title="Settings"
            breadcrumbs={[
                { label: "Workspace", href: "/" },
                { label: "Settings" },
            ]}
            user={{ name: fallbackName || firstName || "", email: fallbackEmail || email || "" }}
        >
            <div className="space-y-6">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                >
                    <h2 className="text-2xl font-bold text-text-primary">Settings</h2>
                    <p className="text-sm text-text-muted mt-1">
                        Manage your account preferences and console configuration.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
                    {/* Settings Nav */}
                    <motion.nav
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                        className="space-y-1"
                    >
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.name}
                                    onClick={() => setActiveTab(tab.name)}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab.name
                                        ? "bg-primary text-white"
                                        : "text-text-secondary hover:bg-surface-muted"
                                        }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {tab.name}
                                </button>
                            );
                        })}
                    </motion.nav>

                    {/* Settings Content */}
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="rounded-xl bg-white border border-border-subtle"
                    >
                        {/* Profile */}
                        {activeTab === "Profile" && (
                            <div className="p-6 space-y-6">
                                <div>
                                    <h3 className="text-base font-bold text-text-primary mb-1">
                                        Profile Information
                                    </h3>
                                    <p className="text-sm text-text-muted">
                                        Update your personal details and contact information.
                                    </p>
                                </div>

                                <div className="flex items-center gap-4 pb-6 border-b border-border-subtle">
                                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center">
                                        <span className="text-xl font-bold text-white">{initials}</span>
                                    </div>
                                    <div>
                                        <p className="text-base font-semibold text-text-primary">
                                            {[firstName, lastName].filter(Boolean).join(" ") || "User"}
                                        </p>
                                        <p className="text-sm text-text-muted">
                                            {orgRole}
                                        </p>
                                        <button className="mt-1 text-xs font-medium text-primary hover:text-primary-hover transition-colors">
                                            Change avatar
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm font-medium text-text-primary mb-1.5 block">
                                            First Name
                                        </label>
                                        <input
                                            type="text"
                                            value={firstName}
                                            onChange={e => setFirstName(e.target.value)}
                                            placeholder="First name"
                                            className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-text-primary mb-1.5 block">
                                            Last Name
                                        </label>
                                        <input
                                            type="text"
                                            value={lastName}
                                            onChange={e => setLastName(e.target.value)}
                                            placeholder="Last name"
                                            className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-text-primary mb-1.5 block">
                                            Email
                                        </label>
                                        <input
                                            type="email"
                                            value={email}
                                            readOnly
                                            className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-surface-muted text-sm text-text-primary cursor-not-allowed"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-text-primary mb-1.5 block">
                                            Role
                                        </label>
                                        <input
                                            type="text"
                                            defaultValue="Engineering Lead"
                                            disabled
                                            className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-surface-muted text-sm text-text-muted cursor-not-allowed"
                                        />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="text-sm font-medium text-text-primary mb-1.5 block">
                                            Organization
                                        </label>
                                        <input
                                            type="text"
                                            value={orgName}
                                            onChange={e => setOrgName(e.target.value)}
                                            placeholder="Organization name"
                                            className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                                        />
                                    </div>
                                </div>

                                {/* Toast */}
                                {toast && (
                                    <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${toast.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                                        {toast.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                                        {toast.msg}
                                    </div>
                                )}

                                <div className="flex justify-end pt-4 border-t border-border-subtle">
                                    <button
                                        onClick={handleSave}
                                        disabled={saving}
                                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-60"
                                    >
                                        {saving ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <Save className="w-4 h-4" />}
                                        {saving ? "Saving…" : "Save Changes"}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Notifications */}
                        {activeTab === "Notifications" && (
                            <div className="p-6 space-y-6">
                                <div>
                                    <h3 className="text-base font-bold text-text-primary mb-1">
                                        Notification Preferences
                                    </h3>
                                    <p className="text-sm text-text-muted">
                                        Control how and when you receive alerts and updates.
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    {[
                                        { title: "Device Alerts", desc: "Get notified when devices go offline or report warnings", default: true },
                                        { title: "Project Updates", desc: "Notifications about project changes and new shared access", default: true },
                                        { title: "System Maintenance", desc: "Alerts about scheduled maintenance and downtime", default: false },
                                        { title: "Weekly Summary", desc: "Receive a weekly digest of your IoT platform activity", default: true },
                                        { title: "Email Notifications", desc: "Receive notifications via email in addition to in-app", default: false },
                                    ].map((item) => (
                                        <div
                                            key={item.title}
                                            className="flex items-center justify-between py-3 border-b border-border-subtle last:border-0"
                                        >
                                            <div>
                                                <p className="text-sm font-medium text-text-primary">
                                                    {item.title}
                                                </p>
                                                <p className="text-xs text-text-muted mt-0.5">
                                                    {item.desc}
                                                </p>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    defaultChecked={item.default}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-9 h-5 bg-border-default peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Appearance */}
                        {activeTab === "Appearance" && (
                            <div className="p-6 space-y-6">
                                <div>
                                    <h3 className="text-base font-bold text-text-primary mb-1">
                                        Appearance
                                    </h3>
                                    <p className="text-sm text-text-muted">
                                        Customize the look and feel of your console.
                                    </p>
                                </div>

                                <div>
                                    <p className="text-sm font-medium text-text-primary mb-3">
                                        Theme
                                    </p>
                                    <div className="grid grid-cols-3 gap-3">
                                        {[
                                            { name: "Light", icon: Sun },
                                            { name: "Dark", icon: Moon },
                                            { name: "System", icon: Monitor },
                                        ].map((t) => {
                                            const Icon = t.icon;
                                            return (
                                                <button
                                                    key={t.name}
                                                    onClick={() => setTheme(t.name)}
                                                    className={`p-4 rounded-xl border text-center transition-all ${theme === t.name
                                                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                                        : "border-border-subtle hover:border-border-default"
                                                        }`}
                                                >
                                                    <Icon
                                                        className={`w-5 h-5 mx-auto mb-2 ${theme === t.name ? "text-primary" : "text-text-muted"
                                                            }`}
                                                    />
                                                    <span className="text-sm font-medium text-text-primary">
                                                        {t.name}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <p className="text-sm font-medium text-text-primary mb-3">
                                        Language & Region
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs text-text-muted mb-1 block">
                                                Language
                                            </label>
                                            <select className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary focus:outline-none focus:border-primary">
                                                <option>English (US)</option>
                                                <option>Hindi</option>
                                                <option>Spanish</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-text-muted mb-1 block">
                                                Timezone
                                            </label>
                                            <select className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary focus:outline-none focus:border-primary">
                                                <option>Asia/Kolkata (IST)</option>
                                                <option>America/New_York (EST)</option>
                                                <option>Europe/London (GMT)</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Security */}
                        {activeTab === "Security" && (
                            <div className="p-6 space-y-6">
                                <div>
                                    <h3 className="text-base font-bold text-text-primary mb-1">
                                        Security Settings
                                    </h3>
                                    <p className="text-sm text-text-muted">
                                        Manage your password, two-factor authentication, and API keys.
                                    </p>
                                </div>

                                {toast && (
                                    <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${toast.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                                        {toast.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                                        {toast.msg}
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <div className="p-4 rounded-xl border border-border-subtle">
                                        <div className="space-y-4">
                                            <div>
                                                <p className="text-sm font-medium text-text-primary">
                                                    Change Password
                                                </p>
                                                <p className="text-xs text-text-muted mt-0.5">
                                                    Uses authenticated route `/v1/profile/update/password` with your Bearer token.
                                                </p>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                <input
                                                    type="text"
                                                    value={verificationCode}
                                                    onChange={(e) => setVerificationCode(e.target.value)}
                                                    placeholder="Verification code"
                                                    className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                                                />
                                                <input
                                                    type="password"
                                                    value={newPassword}
                                                    onChange={(e) => setNewPassword(e.target.value)}
                                                    placeholder="New password"
                                                    className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                                                />
                                                <input
                                                    type="password"
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    placeholder="Confirm password"
                                                    className="w-full px-3 py-2.5 rounded-lg border border-border-subtle bg-white text-sm text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                                                />
                                            </div>
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <button
                                                    onClick={handleSendPasswordOtp}
                                                    disabled={sendingOtp}
                                                    className="px-4 py-2 rounded-lg border border-border-subtle text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors disabled:opacity-60 min-w-[120px]"
                                                >
                                                    {sendingOtp
                                                        ? `Sending OTP${otpCountdown > 0 ? ` (${otpCountdown}s)` : "\u2026"}`
                                                        : "Send OTP"
                                                    }
                                                </button>
                                                <button
                                                    onClick={handlePasswordUpdate}
                                                    disabled={updatingPassword}
                                                    className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-60"
                                                >
                                                    {updatingPassword ? "Updating..." : "Update Password"}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-4 rounded-xl border border-border-subtle">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-medium text-text-primary">
                                                    Two-Factor Authentication
                                                </p>
                                                <p className="text-xs text-text-muted mt-0.5">
                                                    Add an extra layer of security to your account
                                                </p>
                                            </div>
                                            <button className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors">
                                                Enable 2FA
                                            </button>
                                        </div>
                                    </div>

                                    <div className="p-4 rounded-xl border border-border-subtle">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-medium text-text-primary">
                                                    API Keys
                                                </p>
                                                <p className="text-xs text-text-muted mt-0.5">
                                                    Manage API keys for programmatic access
                                                </p>
                                            </div>
                                            <button className="px-4 py-2 rounded-lg border border-border-subtle text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors">
                                                Manage Keys
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </div>
            </div>
        </DashboardLayout>
    );
}
