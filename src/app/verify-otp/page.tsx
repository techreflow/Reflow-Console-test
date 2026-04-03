"use client";

import React, { useState, useRef, useEffect, Suspense } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { verifyOTP, generateOTP, saveToken, getProfile } from "@/lib/api";

export default function VerifyOTPPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-blue-100 relative overflow-hidden">
            <div className="flex items-center justify-center p-4 pt-32">
                <Suspense
                    fallback={
                        <div className="text-blue-600 font-semibold text-lg animate-pulse">
                            Loading...
                        </div>
                    }
                >
                    <VerifyOTPContent />
                </Suspense>
            </div>
        </div>
    );
}

function VerifyOTPContent() {
    const searchParams = useSearchParams();
    const email = searchParams.get("email");
    const action = searchParams.get("action") || "signup";
    const isResetFlow = action === "reset";

    const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
    const [loading, setLoading] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(6).fill(null));

    useEffect(() => {
        inputRefs.current[0]?.focus();
    }, []);

    const handleChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return;
        const digit = value.slice(-1);
        const newOtp = [...otp];
        newOtp[index] = digit;
        setOtp(newOtp);
        if (digit && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Backspace") {
            if (otp[index]) {
                const newOtp = [...otp];
                newOtp[index] = "";
                setOtp(newOtp);
            } else if (index > 0) {
                inputRefs.current[index - 1]?.focus();
                const newOtp = [...otp];
                newOtp[index - 1] = "";
                setOtp(newOtp);
            }
        }
        if (e.key === "ArrowLeft" && index > 0) inputRefs.current[index - 1]?.focus();
        if (e.key === "ArrowRight" && index < 5) inputRefs.current[index + 1]?.focus();
    };

    // Prevent copy-paste
    const blockEvent = (e: React.ClipboardEvent | React.DragEvent) => e.preventDefault();

    const fullOtp = otp.join("");
    const isComplete = fullOtp.length === 6;

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !isComplete) return;

        setError(null);
        setLoading(true);

        try {
            if (isResetFlow) {
                const sessionToken =
                    (typeof window !== "undefined"
                        ? localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token")
                        : "");

                if (!sessionToken) {
                    setError("Reset password requires an authenticated session token. Please sign in and use Settings > Security.");
                    return;
                }

                window.location.href = `/reset-password?email=${encodeURIComponent(email)}&verificationCode=${encodeURIComponent(fullOtp)}`;
                return;
            }

            const result = await verifyOTP(email, fullOtp);
            const isSuccess =
                result.success ||
                (result.message && result.message.toLowerCase().includes("verified")) ||
                result.data?.token;

            if (isSuccess) {
                const token = result.data?.token || result.token;
                if (token) saveToken(token);

                let target = "/?setup=org";
                try {
                    const profileData = await getProfile();
                    const profile = profileData?.data?.profile;
                    if (profile?.organization?.id) {
                        target = "/";
                    }
                } catch {
                    // Keep fallback route.
                }

                window.location.href = target;
            } else {
                setError(result.message || result.error || "Verification failed. Please check your OTP.");
            }
        } catch {
            setError("An unexpected error occurred. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        if (!email) return;
        setResendLoading(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const result = await generateOTP(email, action);
            if (result.success) {
                setSuccessMessage("OTP has been resent to your email.");
                setOtp(Array(6).fill(""));
                inputRefs.current[0]?.focus();
            } else {
                setError(result.message || "Failed to resend OTP. Please try again.");
            }
        } catch {
            setError("An unexpected error occurred while resending OTP.");
        } finally {
            setResendLoading(false);
        }
    };

    return (
        <>
            {/* Animated Background Blobs */}
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

            <motion.div
                className="w-full max-w-6xl grid lg:grid-cols-2 gap-8 items-center relative z-10"
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
            >
                {/* OTP Form Card */}
                <motion.div
                    className="bg-white/70 backdrop-blur-2xl p-10 lg:p-12 rounded-3xl shadow-2xl border border-white/50 relative overflow-hidden"
                    initial={{ x: -50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                >
                    <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-blue-400/10 to-transparent rounded-bl-full" />

                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.4 }}
                    >
                        <h1 className="text-4xl lg:text-5xl font-black mb-3 relative">
                            <span className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-900 bg-clip-text text-transparent">
                                Verify OTP
                            </span>
                        </h1>
                        <motion.div
                            className="h-1.5 w-20 bg-gradient-to-r from-blue-600 to-blue-400 rounded-full mb-6"
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ delay: 0.6, duration: 0.6 }}
                        />
                        <p className="text-gray-700 mb-2 text-lg">
                            {action === "login"
                                ? "Enter the login OTP sent to"
                                : action === "reset"
                                    ? "Enter the password reset OTP sent to"
                                    : "Enter the 6-digit code sent to"}
                        </p>
                        <p className="text-blue-700 font-bold text-base mb-8 truncate">
                            {email ?? "your email"}
                        </p>
                    </motion.div>

                    {error && (
                        <motion.div
                            className="bg-red-50 border-2 border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6"
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            <p className="font-semibold">{error}</p>
                        </motion.div>
                    )}

                    {successMessage && (
                        <motion.div
                            className="bg-green-50 border-2 border-green-200 text-green-700 px-4 py-3 rounded-xl mb-6"
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            <p className="font-semibold">{successMessage}</p>
                        </motion.div>
                    )}

                    <form onSubmit={handleVerify} className="space-y-8">
                        {/* 6 OTP Boxes */}
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.5 }}
                        >
                            <label className="block text-sm font-semibold text-gray-700 mb-4">
                                One-Time Password
                            </label>
                            <div className="flex gap-3 justify-between">
                                {otp.map((digit, index) => (
                                    <motion.input
                                        key={index}
                                        ref={(el) => { inputRefs.current[index] = el; }}
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={1}
                                        value={digit}
                                        onChange={(e) => handleChange(index, e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(index, e)}
                                        onPaste={blockEvent}
                                        onCopy={blockEvent}
                                        onCut={blockEvent}
                                        onDrop={blockEvent}
                                        autoComplete="off"
                                        className={`w-12 h-14 text-center text-2xl font-black rounded-xl bg-white/80 backdrop-blur-sm border-2 focus:outline-none transition-all duration-300 text-gray-800 shadow-sm
                                            ${digit
                                                ? "border-green-500 shadow-green-200 shadow-md bg-green-50/50"
                                                : "border-blue-100 focus:border-blue-500"
                                            }`}
                                        whileFocus={{ scale: 1.08 }}
                                        whileTap={{ scale: 0.95 }}
                                        animate={digit ? { scale: [1, 1.1, 1] } : {}}
                                        transition={{ duration: 0.2 }}
                                    />
                                ))}
                            </div>
                        </motion.div>

                        {/* Verify Button */}
                        <motion.button
                            type="submit"
                            disabled={loading || !isComplete}
                            className={`w-full bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 text-white py-4 rounded-xl font-bold text-lg shadow-xl hover:shadow-2xl transition-all duration-300 relative overflow-hidden group
                                ${(loading || !isComplete) ? "opacity-50 cursor-not-allowed" : ""}`}
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.7 }}
                            whileHover={!loading && isComplete ? { scale: 1.02 } : {}}
                            whileTap={!loading && isComplete ? { scale: 0.98 } : {}}
                        >
                            <motion.div
                                className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-transparent"
                                animate={{ x: [-100, 400] }}
                                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                            />
                            <span className="relative z-10 flex items-center justify-center gap-2">
                                {loading ? (
                                    <>
                                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Verifying...
                                    </>
                                ) : (
                                    <>
                                        Verify &amp; Continue
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                        </svg>
                                    </>
                                )}
                            </span>
                        </motion.button>

                        {/* Resend + Back */}
                        <motion.div
                            className="text-center space-y-3"
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.85 }}
                        >
                            <p className="text-gray-600 text-sm">
                                Didn&apos;t receive the code?{" "}
                                <button
                                    type="button"
                                    onClick={handleResend}
                                    disabled={resendLoading}
                                    className={`text-blue-600 font-bold hover:text-blue-800 hover:underline transition-all ${resendLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                                >
                                    {resendLoading ? "Resending..." : "Resend Code"}
                                </button>
                            </p>
                            <Link
                                href="/login"
                                className="text-gray-500 hover:text-gray-700 text-sm font-medium transition-all"
                            >
                                Back to Login
                            </Link>
                        </motion.div>
                    </form>
                </motion.div>

                {/* Right Side — Welcome Card */}
                <motion.div
                    className="hidden lg:flex flex-col items-center justify-center text-center"
                    initial={{ x: 50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.4 }}
                >
                    <motion.div
                        className="bg-white/70 backdrop-blur-2xl p-12 rounded-3xl shadow-2xl border border-white/50 relative overflow-hidden"
                        whileHover={{ scale: 1.02 }}
                        transition={{ duration: 0.3 }}
                    >
                        <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-tr from-blue-400/10 to-transparent rounded-tr-full" />

                        <motion.p
                            className="text-2xl font-bold text-gray-800 mb-8"
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.6 }}
                        >
                            WELCOME TO
                        </motion.p>

                        <motion.div
                            className="relative w-80 h-32 mb-8"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.8, type: "spring", stiffness: 200 }}
                            whileHover={{ scale: 1.05 }}
                        >
                            <Image
                                src="https://res.cloudinary.com/dvkqelyrt/image/upload/v1774383096/translogo_q2ulef.png"
                                alt="ReFlow Logo"
                                fill
                                className="object-contain"
                                priority
                                unoptimized
                            />
                        </motion.div>

                        <motion.p
                            className="text-lg text-gray-700 font-semibold"
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 1 }}
                        >
                            Smarter. Better. Faster.
                        </motion.p>

                        <div className="flex justify-center gap-2 mt-8">
                            {[0, 1, 2].map((i) => (
                                <motion.div
                                    key={i}
                                    className="w-3 h-3 bg-blue-500 rounded-full"
                                    animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
                                />
                            ))}
                        </div>
                    </motion.div>
                </motion.div>
            </motion.div>

            {/* Back to Home */}
            <motion.div
                className="absolute top-8 left-8"
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
            >
                <Link
                    href="/"
                    className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold transition-all group"
                >
                    <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to Home
                </Link>
            </motion.div>
        </>
    );
}
