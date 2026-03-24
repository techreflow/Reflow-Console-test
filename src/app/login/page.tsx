"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { login, saveToken, saveUserInfo } from "@/lib/api";

export default function LoginPage() {
    const router = useRouter();
    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            if (!email.trim() || !password) {
                setError("Please enter both email and password.");
                setLoading(false);
                return;
            }

            console.log("Attempting login with:", email);
            const result = await login(email.trim(), password);
            console.log("Login result:", result);

            if (result.success || result.data?.token) {
                const token = result.data?.token || result.token;
                if (token) saveToken(token);
                if (result.data?.user) {
                    saveUserInfo(result.data.user.email, result.data.user.name);
                } else {
                    // Fallback: derive name from email if backend doesn't return user object
                    const derivedName = email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                    saveUserInfo(email.trim(), derivedName);
                }
                // Hard redirect to dashboard
                window.location.href = "/?setup=org";
            } else {
                const errorMsg =
                    result.message ||
                    result.error ||
                    "Login failed. Please check your credentials.";
                setError(errorMsg);
            }
        } catch (err: any) {
            console.error("Login error:", err);
            setError(err.message || "Could not connect to the server. Please try again.");
        } finally {
            setLoading(false);
        }
    };


    return (
        <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-blue-100 relative overflow-hidden">
            <div className="flex items-center justify-center p-4 pt-32">
                {/* Animated Background Blobs */}
                <div className="absolute inset-0 overflow-hidden">
                    <motion.div
                        className="absolute top-20 right-20 w-[600px] h-[600px] bg-gradient-to-br from-blue-400/30 to-blue-600/30 rounded-full blur-3xl"
                        animate={{
                            scale: [1, 1.2, 1],
                            rotate: [0, 90, 0],
                            x: [0, 50, 0],
                            y: [0, 30, 0],
                        }}
                        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.div
                        className="absolute bottom-20 left-20 w-[700px] h-[700px] bg-gradient-to-br from-blue-300/20 to-blue-500/20 rounded-full blur-3xl"
                        animate={{
                            scale: [1.2, 1, 1.2],
                            rotate: [0, -90, 0],
                            x: [0, -30, 0],
                            y: [0, -50, 0],
                        }}
                        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
                    />
                </div>

                <motion.div
                    className="w-full max-w-6xl grid lg:grid-cols-2 gap-8 items-center relative z-10"
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                >
                    {/* Login Form Card */}
                    <motion.div
                        className="bg-white/70 backdrop-blur-2xl p-10 lg:p-12 rounded-3xl shadow-2xl border border-white/50 relative overflow-hidden"
                        initial={{ x: -50, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                    >
                        <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-blue-400/10 to-transparent rounded-bl-full"></div>

                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.4 }}
                        >
                            <h1 className="text-4xl lg:text-5xl font-black mb-3 relative">
                                <span className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-900 bg-clip-text text-transparent">
                                    Login
                                </span>
                            </h1>
                            <motion.div
                                className="h-1.5 w-20 bg-gradient-to-r from-blue-600 to-blue-400 rounded-full mb-6"
                                initial={{ scaleX: 0 }}
                                animate={{ scaleX: 1 }}
                                transition={{ delay: 0.6, duration: 0.6 }}
                            />
                            <p className="text-gray-700 mb-8 text-lg">
                                Fill in the details to login
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

                        <form className="space-y-6" onSubmit={handleLogin}>
                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.5 }}
                            >
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Email ID
                                </label>
                                <motion.input
                                    type="email"
                                    placeholder="Enter your email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-white/80 backdrop-blur-sm border-2 border-blue-100 focus:border-blue-500 focus:outline-none transition-all duration-300 text-gray-800 placeholder-gray-400"
                                    whileFocus={{ scale: 1.02 }}
                                />
                            </motion.div>

                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.6 }}
                            >
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Password
                                </label>
                                <div className="relative">
                                    <motion.input
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Enter your password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl bg-white/80 backdrop-blur-sm border-2 border-blue-100 focus:border-blue-500 focus:outline-none transition-all duration-300 text-gray-800 placeholder-gray-400 pr-12"
                                        whileFocus={{ scale: 1.02 }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-blue-600 transition-colors"
                                    >
                                        {showPassword ? (
                                            <svg
                                                className="w-5 h-5"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                                />
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                                />
                                            </svg>
                                        ) : (
                                            <svg
                                                className="w-5 h-5"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                                                />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </motion.div>

                            <motion.div
                                className="text-right"
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.7 }}
                            >
                                <Link
                                    href="/forgot-password"
                                    className="text-sm text-blue-600 hover:text-blue-700 font-semibold hover:underline transition-all"
                                >
                                    Forgot Password?
                                </Link>
                            </motion.div>

                            <button
                                type="submit"
                                disabled={loading}
                                className={`w-full bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 text-white py-4 rounded-xl font-bold text-lg shadow-xl hover:shadow-2xl transition-all duration-300 ${loading ? "opacity-50 cursor-not-allowed" : ""
                                    }`}
                            >
                                <span className="flex items-center justify-center gap-2">
                                    {loading ? (
                                        <>
                                            <svg
                                                className="animate-spin h-5 w-5 text-white"
                                                xmlns="http://www.w3.org/2000/svg"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                            >
                                                <circle
                                                    className="opacity-25"
                                                    cx="12"
                                                    cy="12"
                                                    r="10"
                                                    stroke="currentColor"
                                                    strokeWidth="4"
                                                ></circle>
                                                <path
                                                    className="opacity-75"
                                                    fill="currentColor"
                                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                ></path>
                                            </svg>
                                            Logging in...
                                        </>
                                    ) : (
                                        <>
                                            Login
                                            <svg
                                                className="w-5 h-5"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                                                />
                                            </svg>
                                        </>
                                    )}
                                </span>
                            </button>

                            <motion.p
                                className="text-center text-gray-700 mt-6"
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.9 }}
                            >
                                Don&apos;t have an account?{" "}
                                <Link
                                    href="/register"
                                    className="text-blue-600 hover:text-blue-700 font-bold hover:underline transition-all"
                                >
                                    Sign Up
                                </Link>
                            </motion.p>
                        </form>
                    </motion.div>

                    {/* Right Side - Welcome Card */}
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
                            <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-tr from-blue-400/10 to-transparent rounded-tr-full"></div>

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
                                    src="/translogo.png"
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
                                        animate={{
                                            scale: [1, 1.5, 1],
                                            opacity: [0.5, 1, 0.5],
                                        }}
                                        transition={{
                                            duration: 2,
                                            repeat: Infinity,
                                            delay: i * 0.3,
                                        }}
                                    />
                                ))}
                            </div>
                        </motion.div>
                    </motion.div>
                </motion.div>

                {/* Back to Home link */}
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
                        <svg
                            className="w-5 h-5 group-hover:-translate-x-1 transition-transform"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M10 19l-7-7m0 0l7-7m-7 7h18"
                            />
                        </svg>
                        Back to Home
                    </Link>
                </motion.div>
            </div>
        </div>
    );
}
