"use client";

import { ReactNode } from "react";
import { ProjectsProvider } from "@/lib/ProjectsContext";
import { MqttPresenceProvider } from "@/lib/MqttPresenceProvider";

export function Providers({ children }: { children: ReactNode }) {
    return (
        <MqttPresenceProvider>
            <ProjectsProvider>
                {children}
            </ProjectsProvider>
        </MqttPresenceProvider>
    );
}
