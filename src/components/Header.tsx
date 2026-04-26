"use client";

import { useState, useEffect, useRef } from "react";
import { Bell, Search, HelpCircle, ChevronDown, User, Settings, LogOut, X, Activity, BookOpen, Cpu, BarChart2, FileText, Zap } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

interface HeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: { label: string; href?: string }[];
}

interface NotificationItem {
  id: number;
  icon: typeof Activity;
  color: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
}

// ─── Help guide steps ──────────────────────────────────────────────────────
const HELP_STEPS = [
  {
    icon: Cpu,
    color: "bg-blue-50 text-blue-600",
    title: "Add Your Devices",
    desc: "Go to Projects → Add Device. Enter the device serial number and subscription key from your hardware label.",
  },
  {
    icon: Activity,
    color: "bg-emerald-50 text-emerald-600",
    title: "View Live Readings",
    desc: "Click any device from Projects or the Devices page. You'll see real-time MQTT channel data updating every 3 seconds.",
  },
  {
    icon: BarChart2,
    color: "bg-purple-50 text-purple-600",
    title: "Analyse Historical Data",
    desc: "Open Analytics, select a device and date range, then click Load. Switch between Line and Bar charts. Toggle Deviation % mode to see signal drift.",
  },
  {
    icon: FileText,
    color: "bg-orange-50 text-orange-600",
    title: "Export Reports",
    desc: "Go to Reports, pick a device and date range, then click Export. You'll get a CSV file you can open in Excel or any analysis tool.",
  },
  {
    icon: Zap,
    color: "bg-rose-50 text-rose-600",
    title: "Configure Device Parameters",
    desc: "Open a device and click Set/Edit Parameters to adjust channel calibration, thresholds, sampling rate and transmission interval via MQTT.",
  },
  {
    icon: BookOpen,
    color: "bg-slate-100 text-slate-600",
    title: "Monitor Downtime on Home",
    desc: "The home page Downtime widget shows the organization deviation trend for the latest one-week window.",
  },
];

export default function Header({ title, subtitle, breadcrumbs }: HeaderProps) {
  const [userName, setUserName] = useState("User");
  const [userRole, setUserRole] = useState("Member");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    const api = await import("../lib/api");
    api.clearAuth();
    window.location.href = "/login";
  };

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;

    import("../lib/api").then((api) => {
      if (disposed) return;

      const syncUser = async () => {
        try {
          const res = await api.getProfile();
          const profile = res?.data?.profile;
          if (!disposed && profile) {
            setUserName(profile.name);
            setUserRole("Member");
            return;
          }
        } catch (e) {
          // Fallback if network fails
        }
        
        if (!disposed) {
          const isLoggedIn = api.isAuthenticated();
          if (isLoggedIn) {
            setUserName("User");
            setUserRole("Member");
          } else {
            setUserName("User");
            setUserRole("Guest");
          }
        }
      };

      // Fetch once on mount
      syncUser();

      // Only re-fetch when explicitly triggered (e.g. after profile update)
      window.addEventListener("reflow:user-info-changed", syncUser);

      cleanup = () => {
        window.removeEventListener("reflow:user-info-changed", syncUser);
      };
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const initials = getInitials(userName);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  const markRead = (id: number) => setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));

  return (
    <>
      <header className="h-14 bg-white border-b border-border-subtle flex items-center justify-between px-6 sticky top-0 z-20">
        {/* Left: Breadcrumbs / Title */}
        <div className="flex items-center gap-2">
          {breadcrumbs && breadcrumbs.length > 0 ? (
            <nav className="flex items-center gap-1.5 text-sm">
              {breadcrumbs.map((crumb, index) => (
                <span key={index} className="flex items-center gap-1.5">
                  {index > 0 && <span className="text-text-muted">›</span>}
                  {crumb.href ? (
                    <a href={crumb.href} className="text-text-muted hover:text-text-primary transition-colors">
                      {crumb.label}
                    </a>
                  ) : (
                    <span className="text-text-primary font-medium">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          ) : (
            <h1 className="text-sm font-semibold text-text-primary">{title}</h1>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-3">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search projects or devices..."
              className="pl-9 pr-4 py-2 bg-surface-muted border border-border-subtle rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 w-64 transition-all"
            />
          </div>

          {/* ── Bell / Notifications ───────────────────────────────── */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => { setIsNotifOpen((v) => !v); setIsDropdownOpen(false); }}
              className="relative p-2 rounded-lg text-text-muted hover:bg-surface-muted hover:text-text-secondary transition-colors"
            >
              <Bell className="w-[18px] h-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
              )}
            </button>

            <AnimatePresence>
              {isNotifOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-80 bg-white border border-border-subtle rounded-xl shadow-xl overflow-hidden z-50"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-surface-muted/30">
                    <span className="text-sm font-bold text-text-primary">Notifications</span>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-[11px] text-primary font-semibold hover:underline">
                        Mark all read
                      </button>
                    )}
                  </div>

                  {/* List */}
                  <div className="max-h-72 overflow-y-auto divide-y divide-border-subtle">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <Bell className="mx-auto h-6 w-6 text-text-muted" />
                        <p className="mt-2 text-sm font-semibold text-text-primary">No notifications</p>
                        <p className="mt-1 text-xs text-text-muted">New device and deviation alerts will appear here.</p>
                      </div>
                    ) : notifications.map((n) => {
                      const Icon = n.icon;
                      return (
                        <button
                          key={n.id}
                          onClick={() => markRead(n.id)}
                          className={`w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-surface-muted/50 transition-colors ${!n.read ? "bg-primary/[0.03]" : ""}`}
                        >
                          <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${n.color}`}>
                            <Icon className="w-4 h-4" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-text-primary truncate">{n.title}</p>
                              {!n.read && <span className="w-1.5 h-1.5 bg-primary rounded-full flex-shrink-0" />}
                            </div>
                            <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">{n.body}</p>
                            <p className="text-[10px] text-text-muted mt-1 font-medium">{n.time}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {notifications.length > 0 && (
                    <div className="px-4 py-2.5 border-t border-border-subtle bg-surface-muted/20 text-center">
                      <span className="text-[11px] text-text-muted">Only showing recent notifications</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Help / ? ──────────────────────────────────────────── */}
          <button
            onClick={() => { setIsHelpOpen(true); setIsNotifOpen(false); }}
            className="p-2 rounded-lg text-text-muted hover:bg-surface-muted hover:text-text-secondary transition-colors"
          >
            <HelpCircle className="w-[18px] h-[18px]" />
          </button>

          {/* ── User dropdown ──────────────────────────────────────── */}
          <div className="relative hidden lg:block" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2 pl-3 border-l border-border-subtle hover:bg-surface-muted p-1 rounded-lg transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-white">{initials}</span>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-text-primary leading-tight">{userName}</p>
                <p className="text-[10px] text-text-muted">{userRole}</p>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-border-subtle rounded-xl shadow-lg py-1 z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-border-subtle bg-surface-muted/30">
                  <p className="text-sm font-medium text-text-primary truncate">{userName}</p>
                  <p className="text-xs text-text-muted truncate">{userRole}</p>
                </div>
                <div className="py-1">
                  <Link href="/settings" className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-colors" onClick={() => setIsDropdownOpen(false)}>
                    <Settings className="w-4 h-4" /> Settings
                  </Link>
                  <Link href="/settings" className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-colors" onClick={() => setIsDropdownOpen(false)}>
                    <User className="w-4 h-4" /> Profile
                  </Link>
                </div>
                <div className="py-1 border-t border-border-subtle">
                  <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
                    <LogOut className="w-4 h-4" /> Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Help Modal (portal-style, fixed overlay) ──────────────────────── */}
      <AnimatePresence>
        {isHelpOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setIsHelpOpen(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl shadow-2xl border border-border-subtle w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-border-subtle bg-gradient-to-r from-primary/5 to-transparent">
                <div>
                  <h2 className="text-lg font-bold text-text-primary">How to Use ReFlow Console</h2>
                  <p className="text-xs text-text-muted mt-0.5">Get up and running in minutes</p>
                </div>
                <button
                  onClick={() => setIsHelpOpen(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-surface-muted hover:text-text-primary transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Steps */}
              <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                {HELP_STEPS.map((step, i) => {
                  const Icon = step.icon;
                  return (
                    <div key={i} className="flex items-start gap-4 p-4 rounded-xl border border-border-subtle hover:border-primary/30 hover:bg-primary/[0.02] transition-colors">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${step.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Step {i + 1}</span>
                        </div>
                        <p className="text-sm font-bold text-text-primary">{step.title}</p>
                        <p className="text-xs text-text-muted mt-1 leading-relaxed">{step.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-border-subtle bg-surface-muted/30 flex items-center justify-between">
                <p className="text-xs text-text-muted">Need more help? Contact your ReFlow administrator.</p>
                <button
                  onClick={() => setIsHelpOpen(false)}
                  className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-hover transition-colors"
                >
                  Got it!
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
