/**
 * useMqttDevice — shared real-time MQTT hook
 *
 * Polls /api/mqtt-readings?serialId=X every `intervalMs` milliseconds.
 * Tracks online/offline status by checking whether data was received recently.
 * Keeps a rolling history buffer for spark charts.
 */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { DEVICE_CHANNELS, POLLING_CONFIG } from "@/config/constants";

export interface MqttChannel {
    name: string;
    channel: string;
    unit: string;
    value: number | null;
    trend: "up" | "down" | "stable" | "warning";
}

export interface MqttHistoryRow {
    time: string;
    ts: number;
    [key: string]: string | number;
}

export interface UseMqttDeviceResult {
    channels: MqttChannel[];
    isOnline: boolean;
    lastSync: string | null;
    mqttError: boolean;
    /** Rolling history of raw readings — up to `maxHistory` points */
    history: MqttHistoryRow[];
    /** Raw last message object from MQTT */
    rawData: Record<string, number | null>;
    /** Force an immediate re-poll */
    refresh: () => void;
}

function deriveTrend(
    prev: number | null,
    curr: number | null
): "up" | "down" | "stable" | "warning" {
    if (prev === null || curr === null) return "stable";
    if (curr > prev * 1.1) return "up";
    if (curr < prev * 0.9) return "down";
    return "stable";
}

function getPayloadTimestamp(data: Record<string, unknown> | null | undefined): number | null {
    if (!data) return null;
    const raw = data._ts ?? data.ts ?? data.timestamp ?? data.createdAt;

    if (typeof raw === "number" && Number.isFinite(raw)) {
        return raw;
    }

    if (typeof raw === "string") {
        const parsed = Date.parse(raw);
        return Number.isNaN(parsed) ? null : parsed;
    }

    return null;
}

/**
 * @param serialNumber — device serial number to subscribe to
 * @param intervalMs   — polling interval in ms (default 3000)
 * @param maxHistory   — max history points to keep (default 60)
 * @param onlineThresholdMs — consider offline if no data for this many ms (default 10000)
 * @param enabled      — pause polling when false
 */
export function useMqttDevice(
    serialNumber: string | null | undefined,
    intervalMs = POLLING_CONFIG.MQTT_POLL_INTERVAL,
    maxHistory = POLLING_CONFIG.MQTT_HISTORY_MAX_POINTS,
    onlineThresholdMs = POLLING_CONFIG.MQTT_ONLINE_THRESHOLD,
    enabled = true
): UseMqttDeviceResult {
    const [channels, setChannels] = useState<MqttChannel[]>([]);
    const [isOnline, setIsOnline] = useState(false);
    const [lastSync, setLastSync] = useState<string | null>(null);
    const [mqttError, setMqttError] = useState(false);
    const [history, setHistory] = useState<MqttHistoryRow[]>([]);
    const [rawData, setRawData] = useState<Record<string, number | null>>({});

    const prevRaw = useRef<(number | null)[]>([null, null, null, null, null, null]);
    const lastDataTs = useRef<number>(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchData = useCallback(async () => {
        if (!serialNumber) return;
        try {
            const res = await fetch(`/api/mqtt-readings?serialId=${serialNumber}`);
            if (!res.ok) throw new Error("MQTT fetch failed");
            const data = await res.json();

            if (data?.error) {
                setMqttError(true);
                setIsOnline(false);
                return;
            }

            // Build raw values using channel names from config
            const raw = DEVICE_CHANNELS.getChannelNames().map(
                (ch) => (data[ch] ?? null) as number | null
            );

            const hasData = raw.some((v) => v !== null);
            const payloadTs = getPayloadTimestamp(data as Record<string, unknown>);
            const sampleTs = payloadTs ?? Date.now();
            const age = Date.now() - sampleTs;
            const isFresh = age < onlineThresholdMs;

            if (hasData) {
                // Build channel objects
                const built: MqttChannel[] = raw
                    .map((v, i) => ({
                        name: `Channel ${i + 1}`,
                        channel: `CH-0${i + 1}`,
                        unit: "—",
                        value: v,
                        trend: deriveTrend(prevRaw.current[i], v),
                    }))
                    .filter((c) => c.value !== null);

                prevRaw.current = raw;
                setChannels(built);

                // Build raw data map
                const rawMap: Record<string, number | null> = {};
                raw.forEach((v, i) => {
                    rawMap[DEVICE_CHANNELS.NAMES[i]] = v;
                });
                setRawData(rawMap);

                const timeLabel = new Date(sampleTs).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                });

                if (isFresh && sampleTs > lastDataTs.current) {
                    // Append only fresh, newer samples to history.
                    const row: MqttHistoryRow = { time: timeLabel, ts: sampleTs };
                    raw.forEach((v, i) => {
                        if (v !== null) row[`CH${i + 1}`] = v;
                    });
                    setHistory((prev) => {
                        const next = [...prev, row];
                        return next.length > maxHistory ? next.slice(next.length - maxHistory) : next;
                    });
                    setLastSync(timeLabel);
                }

                lastDataTs.current = Math.max(lastDataTs.current, sampleTs);
                setIsOnline(isFresh);
                setMqttError(false);
            } else {
                // No data returned — check recency
                const lastAge = Date.now() - lastDataTs.current;
                setIsOnline(lastDataTs.current > 0 && lastAge < onlineThresholdMs);
            }
        } catch {
            setMqttError(true);
            setIsOnline(false);
        }
    }, [serialNumber, maxHistory, onlineThresholdMs]);

    useEffect(() => {
        if (!serialNumber || !enabled) {
            setChannels([]);
            setIsOnline(false);
            return;
        }

        // Immediate first fetch
        fetchData();
        intervalRef.current = setInterval(fetchData, intervalMs);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [serialNumber, intervalMs, enabled, fetchData]);

    return {
        channels,
        isOnline,
        lastSync,
        mqttError,
        history,
        rawData,
        refresh: fetchData,
    };
}

/**
 * Lightweight hook for checking online/offline status only — no channel reads held in state.
 * Useful for bulk status checks on the Devices list page.
 */
export function useMqttStatus(
    serialNumber: string | null | undefined,
    intervalMs = POLLING_CONFIG.MQTT_STATUS_POLL,
    onlineThresholdMs = POLLING_CONFIG.MQTT_ONLINE_THRESHOLD
): { isOnline: boolean; checked: boolean } {
    const [isOnline, setIsOnline] = useState(false);
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        if (!serialNumber) return;
        let mounted = true;

        const check = async () => {
            try {
                const res = await fetch(`/api/mqtt-readings?serialId=${serialNumber}`);
                if (!res.ok) throw new Error("bad response");
                const data = await res.json();
                const hasData = data && !data.error &&
                    DEVICE_CHANNELS.getChannelNames()
                        .map((ch) => data[ch])
                        .some((v) => v !== null && v !== undefined);
                const payloadTs = getPayloadTimestamp(data as Record<string, unknown>);
                const isFresh = payloadTs !== null
                    ? (Date.now() - payloadTs) < onlineThresholdMs
                    : hasData;
                if (mounted) {
                    setIsOnline(Boolean(hasData && isFresh));
                    setChecked(true);
                }
            } catch {
                if (mounted) {
                    setIsOnline(false);
                    setChecked(true);
                }
            }
        };

        check();
        const id = setInterval(check, intervalMs);
        return () => {
            mounted = false;
            clearInterval(id);
        };
    }, [serialNumber, intervalMs, onlineThresholdMs]);

    return { isOnline, checked };
}
