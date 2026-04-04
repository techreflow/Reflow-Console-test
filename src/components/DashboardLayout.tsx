"use client";

import { ReactNode, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Sidebar from "./Sidebar";
import Header from "./Header";
import Footer from "./Footer";
import BobAIPanel from "./BobAIPanel";
import { BobAIProvider, useBobAI } from "./BobAIContext";
import { Menu, X } from "lucide-react";

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  breadcrumbs?: { label: string; href?: string }[];
  user?: {
    name?: string;
    email?: string;
    role?: string;
  } | null;
}

function LayoutInner({
  children,
  title,
  subtitle,
  breadcrumbs,
  user,
}: DashboardLayoutProps) {
  const { isOpen, close, deviceId } = useBobAI();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showPasswordNotice, setShowPasswordNotice] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem("reflow:password-reset-notice-dismissed:v1") === "1";
      setShowPasswordNotice(!dismissed);
    } catch {
      setShowPasswordNotice(true);
    }
  }, []);

  const dismissPasswordNotice = () => {
    setShowPasswordNotice(false);
    try {
      localStorage.setItem("reflow:password-reset-notice-dismissed:v1", "1");
    } catch {
      // ignore storage issues
    }
  };

  return (
    <div className="flex h-screen bg-background text-text-primary overflow-hidden">
      <Sidebar
        user={user}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 relative">
        {/* Mobile hamburger row */}
        <div className="md:hidden flex items-center gap-3 px-4 h-14 border-b border-border-subtle bg-white flex-shrink-0">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-2 rounded-lg text-text-muted hover:bg-surface-muted transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Image src="https://res.cloudinary.com/dvkqelyrt/image/upload/v1774383096/translogo_q2ulef.png" alt="ReFlow" width={120} height={28} className="object-contain" priority unoptimized />
        </div>
        <Header title={title} subtitle={subtitle} breadcrumbs={breadcrumbs} />
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 bg-background relative z-0">
          {showPasswordNotice && (
            <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-blue-900">
                    Need to change your password?
                  </p>
                  <p className="text-sm text-blue-800 mt-0.5">
                    Go to{" "}
                    <Link href="/settings" className="font-semibold underline underline-offset-2 hover:text-blue-900">
                      Settings
                    </Link>
                    {" "}and update it from the Security section.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dismissPasswordNotice}
                  aria-label="Dismiss password notice"
                  className="rounded-md p-1 text-blue-700 hover:bg-blue-100 hover:text-blue-900 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          {children}
        </main>
        <Footer />
        <BobAIPanel isOpen={isOpen} onClose={close} deviceId={deviceId} />
      </div>
    </div>
  );
}

export default function DashboardLayout(props: DashboardLayoutProps) {
  return (
    <BobAIProvider>
      <LayoutInner {...props} />
    </BobAIProvider>
  );
}
