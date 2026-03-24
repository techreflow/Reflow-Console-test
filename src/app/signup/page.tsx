"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { signup, generateOTP, verifyOTP, saveUserInfo, saveToken } from "@/lib/api";
import { Loader2, ArrowRight, ArrowLeft, Mail, Lock, User, Phone, Shield } from "lucide-react";

type SignupStep = "register" | "otp" | "success";

export default function SignupPage() {
    const router = useRouter();
    const [step, setStep] = useState<SignupStep>("register");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [contactNumber, setContactNumber] = useState("");
    const [otp, setOtp] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    async function handleSignup(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim() || !email.trim() || !password || !contactNumber.trim()) {
            setError("All fields are required.");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const result = await signup(email.trim(), name.trim(), password);

            if (result?.error || result?.message?.toLowerCase().includes("already")) {
                setError(result.error || result.message || "Signup failed.");
                setLoading(false);
                return;
            }

            // Generate OTP for verification
            try {
                await generateOTP(email.trim(), "signup");
                setInfo("Account created! Please verify with the OTP sent to your email.");
                setStep("otp");
            } catch {
                setInfo("Account created! Please log in to continue.");
                setTimeout(() => router.push("/login"), 2000);
            }
        } catch (err: any) {
            console.error("Signup error:", err);
            setError(err.message || "An unexpected error occurred. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    async function handleVerifyOTP(e: React.FormEvent) {
        e.preventDefault();
        if (!otp.trim()) {
            setError("Please enter the OTP.");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const result = await verifyOTP(email.trim(), otp.trim());
            const token = result?.data?.token || result?.token;

            if (token) {
                saveToken(token);
                saveUserInfo(email.trim(), name.trim());
                setStep("success");
                setTimeout(() => router.push("/"), 1500);
            } else {
                setError(result?.message || result?.data?.message || "OTP verification failed.");
            }
        } catch (err: any) {
            console.error("OTP verify error:", err);
            setError(err.message || "Verification failed. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    async function handleResendOTP() {
        setLoading(true);
        setError(null);
        try {
            await generateOTP(email.trim(), "signup");
            setInfo("New OTP sent to your email.");
        } catch {
            setError("Failed to resend OTP.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-blue-100 relative overflow-hidden flex items-center justify-center p-4">
            {/* Background Orbs */}
            <motion.div
                className="absolute top-20 right-20 w-[600px] h-[600px] bg-gradient-to-br from-blue-400/25 to-blue-600/25 rounded-full blur-3xl"
                animate={{ scale: [1, 1.2, 1], x: [0, 50, 0], y: [0, 30, 0] }}
                transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
                className="absolute bottom-20 left-20 w-[700px] h-[700px] bg-gradient-to-br from-blue-300/15 to-blue-500/15 rounded-full blur-3xl"
                animate={{ scale: [1.2, 1, 1.2], x: [0, -30, 0], y: [0, -50, 0] }}
                transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
            />

            <motion.div
                className="w-full max-w-5xl grid lg:grid-cols-2 gap-8 items-center relative z-10"
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
            >
                {/* Signup Card */}
                <motion.div
                    className="bg-white/70 backdrop-blur-2xl p-10 lg:p-12 rounded-3xl shadow-2xl border border-white/50 relative overflow-hidden"
                    initial={{ x: -50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                >
                    <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-blue-400/10 to-transparent rounded-bl-full" />

                    {/* Step: Register */}
                    {step === "register" && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            <h1 className="text-4xl lg:text-5xl font-black mb-3">
                                <span className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-900 bg-clip-text text-transparent">
                                    Create Account
                                </span>
                            </h1>
                            <motion.div
                                className="h-1.5 w-24 bg-gradient-to-r from-blue-600 to-blue-400 rounded-full mb-6"
                                initial={{ scaleX: 0 }}
                                animate={{ scaleX: 1 }}
                                transition={{ delay: 0.4, duration: 0.6 }}
                            />
                            <p className="text-gray-600 mb-6 text-sm">
                                Get started with your ReFlow Console
                            </p>

                            {error && (
                                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handleSignup} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name</label>
                                    <div className="relative">
                                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="John Doe"
                                            className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/80 backdrop-blur-sm border-2 border-blue-100 focus:border-blue-500 focus:outline-none transition-all text-gray-800 placeholder-gray-400"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email</label>
                                    <div className="relative">
                                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="you@company.com"
                                            className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/80 backdrop-blur-sm border-2 border-blue-100 focus:border-blue-500 focus:outline-none transition-all text-gray-800 placeholder-gray-400"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
                                    <div className="relative">
                                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Create a strong password"
                                            className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/80 backdrop-blur-sm border-2 border-blue-100 focus:border-blue-500 focus:outline-none transition-all text-gray-800 placeholder-gray-400"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Contact Number</label>
                                    <div className="relative">
                                        <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="tel"
                                            value={contactNumber}
                                            onChange={(e) => setContactNumber(e.target.value)}
                                            placeholder="+91 9876543210"
                                            className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/80 backdrop-blur-sm border-2 border-blue-100 focus:border-blue-500 focus:outline-none transition-all text-gray-800 placeholder-gray-400"
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 text-white py-3.5 rounded-xl font-bold text-base shadow-xl hover:shadow-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span className="flex items-center justify-center gap-2">
                                        {loading ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                Creating Account...
                                            </>
                                        ) : (
                                            <>
                                                Create Account
                                                <ArrowRight className="w-5 h-5" />
                                            </>
                                        )}
                                    </span>
                                </button>

                                <p className="text-center text-gray-600 text-sm">
                                    Already have an account?{" "}
                                    <Link href="/login" className="text-blue-600 hover:text-blue-700 font-bold hover:underline transition-all">
                                        Sign In
                                    </Link>
                                </p>
                            </form>
                        </motion.div>
                    )}

                    {/* Step: OTP */}
                    {step === "otp" && (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                            <button
                                onClick={() => { setStep("register"); setError(null); setInfo(null); }}
                                className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-6"
                            >
                                <ArrowLeft className="w-4 h-4" /> Back
                            </button>

                            <h1 className="text-3xl font-black mb-3">
                                <span className="bg-gradient-to-r from-blue-600 to-blue-900 bg-clip-text text-transparent">
                                    Verify Email
                                </span>
                            </h1>
                            <motion.div className="h-1.5 w-16 bg-gradient-to-r from-blue-600 to-blue-400 rounded-full mb-4" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} />
                            <p className="text-gray-600 mb-6 text-sm">
                                Enter the code sent to <strong>{email}</strong>
                            </p>

                            {info && <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-xl mb-4 text-sm">{info}</div>}
                            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">{error}</div>}

                            <form onSubmit={handleVerifyOTP} className="space-y-5">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Verification Code</label>
                                    <div className="relative">
                                        <Shield className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="text"
                                            value={otp}
                                            onChange={(e) => setOtp(e.target.value)}
                                            placeholder="Enter 6-digit code"
                                            maxLength={6}
                                            className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/80 border-2 border-blue-100 focus:border-blue-500 focus:outline-none text-center text-2xl tracking-[0.5em] font-mono text-gray-800 placeholder:text-base placeholder:tracking-normal"
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-gradient-to-r from-blue-600 to-blue-800 text-white py-3.5 rounded-xl font-bold shadow-xl disabled:opacity-50"
                                >
                                    <span className="flex items-center justify-center gap-2">
                                        {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Verifying...</> : "Verify & Continue"}
                                    </span>
                                </button>

                                <button type="button" onClick={handleResendOTP} disabled={loading} className="w-full text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50">
                                    Resend OTP
                                </button>
                            </form>
                        </motion.div>
                    )}

                    {/* Step: Success */}
                    {step === "success" && (
                        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
                            <motion.div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6" animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 0.5 }}>
                                <svg className="w-10 h-10 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            </motion.div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">Account Created!</h2>
                            <p className="text-gray-500">Redirecting to your dashboard...</p>
                            <Loader2 className="w-5 h-5 animate-spin text-blue-600 mx-auto mt-4" />
                        </motion.div>
                    )}
                </motion.div>

                {/* Right Panel — Branding */}
                <motion.div
                    className="hidden lg:flex flex-col items-center justify-center text-center"
                    initial={{ x: 50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.4 }}
                >
                    <motion.div className="bg-white/70 backdrop-blur-2xl p-12 rounded-3xl shadow-2xl border border-white/50 relative overflow-hidden" whileHover={{ scale: 1.02 }}>
                        <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-tr from-blue-400/10 to-transparent rounded-tr-full" />
                        <p className="text-2xl font-bold text-gray-800 mb-8">REFLOW CONSOLE</p>
                        <div className="relative w-64 h-28 mb-8 mx-auto">
                            <Image src="/translogo.png" alt="ReFlow Logo" fill className="object-contain" priority unoptimized />
                        </div>
                        <p className="text-lg text-gray-600 font-semibold">Smarter. Better. Faster.</p>
                        <div className="flex justify-center gap-2 mt-8">
                            {[0, 1, 2].map((i) => (
                                <motion.div key={i} className="w-3 h-3 bg-blue-500 rounded-full" animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }} />
                            ))}
                        </div>
                    </motion.div>
                </motion.div>
            </motion.div>
        </div>
    );
}
