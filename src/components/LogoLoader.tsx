"use client";

import { motion } from "framer-motion";
import Image from "next/image";

interface LogoLoaderProps {
  text?: string;
}

export default function LogoLoader({ text = "Loading console..." }: LogoLoaderProps) {
  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-background">
      <div className="relative">
        <motion.div
          className="absolute inset-0 rounded-full"
          animate={{
            boxShadow: [
              "0 0 12px rgba(0, 163, 255, 0.2)",
              "0 0 24px rgba(0, 163, 255, 0.3)",
              "0 0 12px rgba(0, 163, 255, 0.2)",
            ],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        <motion.div
          className="absolute -inset-4 rounded-full border border-border-subtle bg-surface"
          animate={{ rotate: 360 }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "linear",
          }}
        />

        <motion.div
          className="absolute -inset-6 rounded-full bg-surface-muted"
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative w-28 h-28 rounded-full bg-surface flex items-center justify-center"
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
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="mt-10 text-center"
      >
        <p className="text-text-muted text-sm font-medium tracking-wide">
          {text}
        </p>

        <div className="flex justify-center gap-2 mt-4">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-primary"
              animate={{
                scale: [1, 1.4, 1],
                opacity: [0.4, 1, 0.4],
              }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                delay: i * 0.15,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: 160, opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="mt-8 h-1 bg-surface-muted rounded-full overflow-hidden"
      >
        <motion.div
          className="h-full bg-gradient-primary rounded-full"
          animate={{
            x: ["-100%", "100%"],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </motion.div>
    </div>
  );
}
