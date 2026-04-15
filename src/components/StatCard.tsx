"use client";

import { motion } from "framer-motion";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon?: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  subtitle?: string;
  index?: number;
  onClick?: () => void;
}

export default function StatCard({
  title,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
  iconColor = "text-primary",
  iconBg = "bg-primary/10",
  subtitle,
  index = 0,
  onClick,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      className={`rounded-xl p-5 bg-white border border-border-subtle hover-lift ${
        onClick ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" : ""
      }`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={onClick ? 0 : -1}
      role={onClick ? "button" : undefined}
    >
      <div className="flex items-start justify-between mb-4">
        <p className="text-sm text-text-muted font-medium">{title}</p>
        {Icon && (
          <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
        )}
      </div>

      <div className="flex items-end justify-between">
        <div>
          <h3 className="text-3xl font-bold text-text-primary tracking-tight">
            {value}
          </h3>
          {(change || subtitle) && (
            <div className="flex items-center gap-2 mt-1.5">
              {change && (
                <span
                  className={`inline-flex items-center gap-0.5 text-xs font-medium ${changeType === "positive"
                      ? "text-success"
                      : changeType === "negative"
                        ? "text-error"
                        : "text-text-muted"
                    }`}
                >
                  {changeType === "positive" && (
                    <TrendingUp className="w-3 h-3" />
                  )}
                  {changeType === "negative" && (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {change}
                </span>
              )}
              {subtitle && (
                <span className="text-xs text-text-muted">{subtitle}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
