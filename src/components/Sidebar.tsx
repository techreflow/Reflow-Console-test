"use client";

import Image from "next/image";
import { clearAuth, getProfile } from "@/lib/api";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  FolderOpen,
  Cpu,
  TrendingDown,
  BarChart3,
  FileText,
  Users,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bot,
  LucideIcon,
} from "lucide-react";
import { useBobAI } from "./BobAIContext";

interface MenuItem {
  name: string;
  icon: LucideIcon;
  path: string;
}

interface SidebarProps {
  user?: {
    name?: string;
    email?: string;
    role?: string;
  } | null;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const menuItems: MenuItem[] = [
  { name: "Dashboard", icon: LayoutDashboard, path: "/" },
  { name: "Projects", icon: FolderOpen, path: "/projects" },
  { name: "Devices", icon: Cpu, path: "/devices" },
  { name: "Downtime", icon: TrendingDown, path: "/downtime" },
  { name: "Analytics", icon: BarChart3, path: "/analytics" },
  { name: "Reports", icon: FileText, path: "/reports" },
  { name: "Access", icon: Users, path: "/access" },
  { name: "Settings", icon: Settings, path: "/settings" },
];

export default function Sidebar({ user, mobileOpen = false, onMobileClose }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const { isOpen: isBobOpen, toggle: toggleBob } = useBobAI();
  const [mounted, setMounted] = useState(false);
  const [clientUser, setClientUser] = useState(user);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    const syncUser = async () => {
      try {
        const res = await getProfile();
        const profile = res?.data?.profile;
        if (!cancelled && profile) {
          setClientUser({
            name: profile.name || "",
            email: profile.email || "",
          });
        }
      } catch (e) {
        // failed to fetch profile
      } finally {
        if (!cancelled) setMounted(true);
      }
    };

    // Fetch once on mount
    syncUser();

    // Only re-fetch when explicitly triggered (e.g. after profile update)
    window.addEventListener("reflow:user-info-changed", syncUser);

    return () => {
      cancelled = true;
      window.removeEventListener("reflow:user-info-changed", syncUser);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = (): void => {
    clearAuth();
    window.location.href = "/login";
  };

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  const handleNavClick = () => {
    // Close mobile drawer when navigating
    if (onMobileClose) onMobileClose();
  };

  const sidebarContent = (collapsed: boolean) => (
    <>
      {/* Logo */}
      <div className="h-14 flex items-center justify-center px-5 border-b border-border-subtle flex-shrink-0">
        <Image
          src="https://res.cloudinary.com/dvkqelyrt/image/upload/v1774383096/translogo_q2ulef.png"
          alt="ReFlow Logo"
          width={collapsed ? 32 : 160}
          height={collapsed ? 32 : 40}
          className="object-contain flex-shrink-0 transition-all duration-300"
          priority
          unoptimized
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <li key={item.name}>
                <Link
                  href={item.path}
                  onClick={handleNavClick}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${active ? "bg-primary text-white font-medium" : "text-text-secondary hover:bg-surface-muted"
                    } ${collapsed ? "justify-center px-2" : ""}`}
                  title={collapsed ? item.name : undefined}
                >
                  <Icon
                    className={`w-[18px] h-[18px] flex-shrink-0 ${active ? "text-white" : "text-text-muted group-hover:text-text-secondary"
                      }`}
                  />
                  {!collapsed && <span className="text-[13px]">{item.name}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bob AI Button */}
      <div className="px-3 mb-3">
        <button
          onClick={() => { toggleBob(); handleNavClick(); }}
          title={collapsed ? "Bob AI" : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group border ${isBobOpen
              ? "bg-primary border-primary text-white shadow-md"
              : "bg-surface text-text-primary border-border-default hover:border-primary/50 hover:shadow-sm"
            } ${collapsed ? "justify-center px-2" : ""}`}
        >
          <div className="relative flex-shrink-0">
            <Bot className={`w-[18px] h-[18px] ${isBobOpen ? "text-white" : "text-primary group-hover:text-primary-hover"}`} />
            <span
              className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border-2 ${isBobOpen ? "border-primary bg-white" : "border-white bg-primary animate-pulse"
                }`}
            />
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 text-left">
                <p className={`text-[13px] font-semibold leading-none ${isBobOpen ? "text-white" : "text-text-primary"}`}>Bob AI</p>
                <p className={`text-[10px] mt-0.5 leading-none ${isBobOpen ? "text-white/80" : "text-text-muted"}`}>
                  {isBobOpen ? "Panel open" : "Ask anything"}
                </p>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${isBobOpen ? "bg-white/20 text-white" : "bg-primary/10 text-primary"}`}>
                AI
              </span>
            </>
          )}
        </button>
      </div>

      {/* User Profile */}
      <div className="px-3 pb-3 border-t border-border-subtle pt-3 flex-shrink-0">
        <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-semibold text-white">
              {mounted ? (clientUser?.name?.charAt(0) || "U") : "U"}
            </span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {mounted ? (clientUser?.name || "User") : "User"}
              </p>
              <p className="text-[11px] text-text-muted truncate">
                {mounted ? (clientUser?.email || "user@reflow.io") : "user@reflow.io"}
              </p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md text-text-muted hover:text-error hover:bg-error/5 transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* ── Desktop sidebar (hidden on mobile) ── */}
      <aside
        className={`relative h-screen flex-col bg-white border-r border-border-subtle transition-all duration-300 hidden md:flex ${isCollapsed ? "w-[72px]" : "w-[250px]"
          }`}
      >
        {sidebarContent(isCollapsed)}
        {/* Collapse Toggle */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-[3.25rem] w-6 h-6 bg-white shadow-md border border-border-subtle text-text-muted rounded-full flex items-center justify-center hover:bg-surface-muted transition-colors z-10"
        >
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </aside>

      {/* ── Mobile overlay drawer ── */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-40 md:hidden"
            onClick={onMobileClose}
          />
          {/* Drawer */}
          <aside className="fixed inset-y-0 left-0 w-[260px] flex flex-col bg-white border-r border-border-subtle z-50 md:hidden shadow-2xl">
            {sidebarContent(false)}
          </aside>
        </>
      )}
    </>
  );
}
