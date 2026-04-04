"use client";

import React, { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { clearAuth, getToken, updateUserPassword } from "@/lib/api";

export default function ResetPasswordPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-blue-100 flex items-center justify-center">
                    <div className="text-blue-700 font-semibold">Loading reset form...</div>
                </div>
            }
        >
            <ResetPasswordContent />
        </Suspense>
    );
}

function ResetPasswordContent() {
    const searchParams = useSearchParams();
    const email = searchParams.get("email") || "";
    const initialCode = searchParams.get("verificationCode") || "";

    const [verificationCode, setVerificationCode] = useState(initialCode);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const maskedEmail = useMemo(() => {
        if (!email.includes("@")) return email;
        const [local, domain] = email.split("@");
        if (local.length <= 2) return `${local[0] || "*"}*@${domain}`;
        return `${local.slice(0, 2)}***@${domain}`;
    }, [email]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        const token = getToken();
        if (!token) {
            setError("This password update API requires an active login session. Please sign in and change password from Settings > Security.");
            return;
        }

        if (!verificationCode.trim()) {
            setError("Missing verification code. Please restart the reset flow.");
            return;
        }
        if (!newPassword || !confirmPassword) {
            setError("Please enter both password fields.");
            return;
        }
        if (newPassword.length < 6) {
            setError("New password must be at least 6 characters.");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("New password and confirm password do not match.");
            return;
        }

        setLoading(true);
        try {
            await updateUserPassword({
                verificationCode: verificationCode.trim(),
                newPassword,
                confirmPassword,
            });
            setSuccess("Password updated successfully. Redirecting to login...");
            clearAuth();
            window.setTimeout(() => {
                window.location.href = "/login?reset=success";
            }, 900);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to reset password.";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-blue-100 relative overflow-hidden">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <motion.div
                    className="absolute top-20 right-20 w-[600px] h-[600px] bg-gradient-to-br from-blue-400/30 to-blue-600/30 rounded-full blur-3xl"
                    animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0], x: [0, 50, 0], y: [0, 30, 0] }}
                    transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                    className="absolute bottom-20 left-20 w-[700px] h-[700px] bg-gradient-to-br from-blue-300/20 to-blue-500/20 rounded-full blur-3xl"
                    animate={{ scale: [1.2, 1, 1.2], rotate: [0, -90, 0], x: [0, -30, 0], y: [0, -50, 0] }}
                    transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
                />
            </div>

            <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
                <motion.div
                    className="w-full max-w-xl bg-white/75 backdrop-blur-2xl p-8 rounded-3xl shadow-2xl border border-white/50"
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45 }}
                >
                    <h1 className="text-3xl font-black mb-2">
                        <span className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-900 bg-clip-text text-transparent">
                            Reset Password
                        </span>
                    </h1>
                    <p className="text-sm text-gray-700 mb-6">
                        Enter OTP, new password and confirm password for {maskedEmail || "your account"}.
                    </p>

                    {error && (
                        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
                            {success}
                        </div>
                    )}

                    <form className="space-y-4" onSubmit={handleSubmit}>
                        <div>
                            <label className="mb-1.5 block text-sm font-semibold text-gray-700">OTP Code</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={verificationCode}
                                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                placeholder="Enter 6-digit OTP"
                                className="w-full px-4 py-3 rounded-xl bg-white/90 border-2 border-blue-100 focus:border-blue-500 focus:outline-none text-gray-800"
                                maxLength={6}
                            />
                        </div>

                        <div>
                            <label className="mb-1.5 block text-sm font-semibold text-gray-700">New Password</label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Enter new password"
                                className="w-full px-4 py-3 rounded-xl bg-white/90 border-2 border-blue-100 focus:border-blue-500 focus:outline-none text-gray-800"
                            />
                        </div>

                        <div>
                            <label className="mb-1.5 block text-sm font-semibold text-gray-700">Confirm Password</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirm new password"
                                className="w-full px-4 py-3 rounded-xl bg-white/90 border-2 border-blue-100 focus:border-blue-500 focus:outline-none text-gray-800"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className={`w-full mt-2 bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 text-white py-3.5 rounded-xl font-bold transition-all ${loading ? "opacity-60 cursor-not-allowed" : "hover:shadow-xl"}`}
                        >
                            {loading ? "Updating..." : "Update Password"}
                        </button>
                    </form>

                    <p className="text-center text-sm text-gray-700 mt-5">
                        <Link href="/login" className="text-blue-600 hover:text-blue-700 font-semibold hover:underline">
                            Back to Login
                        </Link>
                    </p>
                </motion.div>
            </div>
        </div>
    );
}
