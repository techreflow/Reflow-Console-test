"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import DashboardLayout from "@/components/DashboardLayout";
import StatCard from "@/components/StatCard";
import ProjectCard from "@/components/ProjectCard";
import SnapshotWidget from "@/components/SnapshotWidget";
import SharedWidget from "@/components/SharedWidget";
import DeviationWidget from "@/components/DeviationWidget";
import LogoLoader from "@/components/LogoLoader";
import OrganizationSetup from "@/components/OrganizationSetup";
import { POLLING_CONFIG } from "@/config/constants";
import {
  getUserEmail,
  getUserName,
  isAuthenticated,
  isOwnerProject,
} from "@/lib/api";
import { useProjects } from "@/lib/ProjectsContext";
import { useOrgGuard } from "@/lib/useOrgGuard";
import {
  FolderOpen,
  Cpu,
  Activity,
  Share2,
  Plus,
  Filter,
  Wifi,
} from "lucide-react";

// ── Quick MQTT status check ──────────────────────────────────────
async function checkDeviceOnline(serialId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/mqtt-readings?serialId=${serialId}`);
    if (!res.ok) return false;
    const data = await res.json();
    const rawTs = data?._ts ?? data?.timestamp ?? data?.createdAt;
    const ts = typeof rawTs === "number" ? rawTs : Date.parse(String(rawTs || ""));
    const isFresh = Number.isFinite(ts)
      ? (Date.now() - ts) < POLLING_CONFIG.MQTT_ONLINE_THRESHOLD
      : true;
    return (
      !data.error &&
      [data.RawCH1, data.RawCH2, data.RawCH3, data.RawCH4, data.RawCH5, data.RawCH6].some(
        (v) => v !== null && v !== undefined
      ) &&
      isFresh
    );
  } catch {
    return false;
  }
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showOrgSetup, setShowOrgSetup] = useState(false);
  const { hasOrg, orgChecked } = useOrgGuard();
  const { projects, devices, loading, error, refresh } = useProjects();
  const [mqttChecking, setMqttChecking] = useState(false);
  const [activeDevices, setActiveDevices] = useState(0);

  const userName = getUserName();
  const userEmail = getUserEmail();

  useEffect(() => {
    if (searchParams.get("setup") === "org") {
      const skipped = typeof window !== "undefined" && sessionStorage.getItem("org_setup_skipped");
      if (!skipped) setShowOrgSetup(true);
      if (typeof window !== "undefined") window.history.replaceState({}, "", "/");
    }
  }, [searchParams]);

  // ── MQTT online check (Non-blocking) ─────────────────────────
  useEffect(() => {
    if (loading || devices.length === 0) return;

    const allSerials = devices
      .map((d) => d.serialNumber || d.serial_no || d.id || d._id)
      .filter(Boolean) as string[];

    if (allSerials.length === 0) return;

    setMqttChecking(true);
    Promise.allSettled(allSerials.map(checkDeviceOnline)).then((results) => {
      const onlineCount = results.filter(
        (r) => r.status === "fulfilled" && r.value === true
      ).length;
      setActiveDevices(onlineCount);
      setMqttChecking(false);
    });

    // Periodic MQTT refresh
    const interval = setInterval(async () => {
      const results = await Promise.allSettled(allSerials.map(checkDeviceOnline));
      const onlineCount = results.filter(
        (r) => r.status === "fulfilled" && r.value === true
      ).length;
      setActiveDevices(onlineCount);
    }, POLLING_CONFIG.DASHBOARD_MQTT_REFRESH);

    return () => clearInterval(interval);
  }, [loading, devices]);

  const stats = useMemo(() => ({
    totalProjects: projects.length,
    totalDevices: devices.length,
    activeDevices,
    ownedProjects: projects.filter((p) => isOwnerProject(p, getUserEmail())).length,
    sharedProjects: projects.filter((p) => !isOwnerProject(p, getUserEmail())).length,
  }), [projects, devices, activeDevices]);

  const recentProjects = useMemo(() => {
    return [...projects]
      .sort((a: any, b: any) => {
        const bTs = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
        const aTs = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
        return bTs - aTs;
      })
      .slice(0, 4);
  }, [projects]);

  const firstName = userName?.split(" ")[0] || "User";
  const uptimePct =
    stats.totalDevices > 0
      ? Math.round((stats.activeDevices / stats.totalDevices) * 100)
      : 0;

  const handleOrgSetupComplete = () => {
    setShowOrgSetup(false);
    refresh();
  };

  return (
    <>
      {showOrgSetup && <OrganizationSetup onComplete={handleOrgSetupComplete} />}
      <DashboardLayout
        title="Overview"
        breadcrumbs={[{ label: "Workspace", href: "/" }, { label: "Overview" }]}
        user={{ name: userName || "", email: userEmail || "" }}
      >
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
          {/* Main content */}
          <div className="space-y-6 min-w-0">
            {/* Welcome Section */}
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <h2 className="text-2xl font-bold text-text-primary">
                  Welcome back, {firstName}!
                </h2>
                <p className="text-sm text-text-muted mt-1">
                  Here&apos;s what&apos;s happening with your projects today.
                </p>
                {error && <p className="text-xs text-amber-600 mt-1">⚠ {error}</p>}
                {mqttChecking && (
                  <p className="text-xs text-blue-500 mt-1 flex items-center gap-1">
                    <Wifi className="w-3 h-3 animate-pulse" /> Checking MQTT status…
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-border-subtle text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors">
                  <Filter className="w-4 h-4" />
                  Filter
                </button>
                <button
                  onClick={() => {
                    if (orgChecked && !hasOrg) { setShowOrgSetup(true); return; }
                    router.push("/projects/new");
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Project
                </button>
              </div>
            </motion.section>

            {/* Stat Cards */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Total Projects"
                value={stats.totalProjects}
                change={`${stats.ownedProjects} owned`}
                changeType="positive"
                icon={FolderOpen}
                iconColor="text-blue-600"
                iconBg="bg-blue-100"
                index={0}
              />
              <StatCard
                title="Total Devices"
                value={stats.totalDevices}
                subtitle="Across all projects"
                icon={Cpu}
                iconColor="text-amber-600"
                iconBg="bg-amber-100"
                index={1}
              />
              <StatCard
                title="Online Now"
                value={stats.activeDevices}
                change={
                  mqttChecking
                    ? "● Checking MQTT…"
                    : stats.totalDevices > 0
                    ? `● ${uptimePct}% Online`
                    : "● No devices"
                }
                changeType={stats.activeDevices > 0 ? "positive" : "neutral"}
                icon={Activity}
                iconColor={stats.activeDevices > 0 ? "text-green-600" : "text-slate-400"}
                iconBg={stats.activeDevices > 0 ? "bg-green-100" : "bg-slate-100"}
                index={2}
              />
              <StatCard
                title="Shared Access"
                value={stats.sharedProjects}
                subtitle={`${stats.sharedProjects} shared project${stats.sharedProjects !== 1 ? "s" : ""}`}
                icon={Share2}
                iconColor="text-purple-600"
                iconBg="bg-purple-100"
                index={3}
              />
            </section>

            {/* Recent Projects */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-text-primary">Recent Projects</h3>
                <Link
                  href="/projects"
                  className="text-xs font-medium text-primary hover:text-primary-hover transition-colors"
                >
                  View All
                </Link>
              </div>

              {loading ? (
                <div className="card p-8 text-center">
                  <p className="text-text-muted text-sm">Loading projects...</p>
                </div>
              ) : projects.length === 0 ? (
                <div className="card p-8 text-center">
                  <p className="text-text-muted text-sm">
                    No projects yet. Create your first project to get started.
                  </p>
                  <button
                    onClick={() => {
                      if (orgChecked && !hasOrg) { setShowOrgSetup(true); return; }
                      router.push("/projects/new");
                    }}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Create Project
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {recentProjects.map((project, index) => (
                    <ProjectCard
                      key={project.id || project._id}
                      project={{ ...project, _id: project.id || project._id || "" }}
                      index={index}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right Sidebar */}
          <aside className="space-y-4">
            <SnapshotWidget />
            <DeviationWidget />
            <SharedWidget />
          </aside>
        </div>
      </DashboardLayout>
    </>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<LogoLoader text="Initializing console..." />}>
      <DashboardContent />
    </Suspense>
  );
}
