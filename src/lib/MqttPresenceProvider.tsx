"use client";

import { ReactNode, useEffect } from "react";
import { initMqttPresenceRuntime } from "@/lib/useMqttDevice";

export function MqttPresenceProvider({ children }: { children: ReactNode }) {
    useEffect(() => {
        initMqttPresenceRuntime();
    }, []);

    return <>{children}</>;
}
