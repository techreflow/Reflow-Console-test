"use client";

import { ReactNode, useState } from "react";
import Image from "next/image";
import Sidebar from "./Sidebar";
import Header from "./Header";
import Footer from "./Footer";
import BobAIPanel from "./BobAIPanel";
import { BobAIProvider, useBobAI } from "./BobAIContext";
import { Menu } from "lucide-react";

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
          <Image src="/translogo.png" alt="ReFlow" width={120} height={28} className="object-contain" priority unoptimized />
        </div>
        <Header title={title} subtitle={subtitle} breadcrumbs={breadcrumbs} />
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 bg-background relative z-0">
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

