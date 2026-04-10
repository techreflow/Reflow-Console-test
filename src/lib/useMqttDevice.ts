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
    index: number;
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
    /** true when latest payload has ERR === 1 (sensor not connected / malfunctioning) */
    sensorErr: boolean;
    /** Raw UpdateTimeStamp string from device payload, for display */
    updateTs: string | null;
    /** Rolling history of raw readings — up to `maxHistory` points */
    history: MqttHistoryRow[];
    /** Latest raw channel readings from MQTT payload (RawCH1..RawCH6). */
    rawData: Record<string, number | null>;
    /** Latest calibrated channel readings from MQTT payload (CH1..CH6). */
    calibratedData: Record<string, number | null>;
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
    const raw = data._ts ?? data._rxTs ?? data.ts ?? data.timestamp ?? data.createdAt;

    if (typeof raw === "number" && Number.isFinite(raw)) {
        return raw < 1e12 ? raw * 1000 : raw;
    }

    if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (!trimmed) return null;

        if (/^\d+$/.test(trimmed)) {
            const asNum = Number(trimmed);
            if (Number.isFinite(asNum)) {
                return asNum < 1e12 ? asNum * 1000 : asNum;
            }
        }

        const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
        const parsed = Date.parse(hasZone ? trimmed : `${trimmed}+05:30`);
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
    const [sensorErr, setSensorErr] = useState(false);
    const [updateTs, setUpdateTs] = useState<string | null>(null);
    const [history, setHistory] = useState<MqttHistoryRow[]>([]);
    const [rawData, setRawData] = useState<Record<string, number | null>>({});
    const [calibratedData, setCalibratedData] = useState<Record<string, number | null>>({});

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

            // Build separate raw/calibrated vectors.
            const rawValues = [1, 2, 3, 4, 5, 6].map((i) => {
                const rawVal = data[`RawCH${i}`];
                return rawVal !== null && rawVal !== undefined ? Number(rawVal) : null;
            }) as (number | null)[];
            const calibratedValues = [1, 2, 3, 4, 5, 6].map((i) => {
                const cal = data[`CH${i}`];
                return cal !== null && cal !== undefined ? Number(cal) : null;
            }) as (number | null)[];
            // Use calibrated CH values for display; fall back to RawCH if CH absent.
            const displayValues = calibratedValues.map((cal, idx) => cal ?? rawValues[idx]) as (number | null)[];

            const hasData = displayValues.some((v) => v !== null);
            const payloadTs = getPayloadTimestamp(data as Record<string, unknown>);
            const isRetained = (data as any)?._isRetained === true;

            // ── Freshness determination ──────────────────────────────────────
            // PRIMARY:  UpdateTimeStamp (_ts) from device payload – if within 60s → Online
            // FALLBACK: _rxTs (server receive time) – ONLY for live messages
            //           (subscribedAt window on server sets _rxTs=0 for retained replays)
            const rxTs =
                !isRetained &&
                typeof (data as any)?._rxTs === "number" &&
                (data as any)._rxTs > 0
                    ? (data as any)._rxTs as number
                    : null;

            const sampleTs = payloadTs ?? rxTs ?? 0;
            const age = sampleTs > 0 ? Date.now() - sampleTs : Number.POSITIVE_INFINITY;
            const isFresh = sampleTs > 0 && age < onlineThresholdMs;


            if (hasData) {
                // Build channel objects
                const built: MqttChannel[] = displayValues
                    .map((v, i) => ({
                        index: i + 1,
                        name: `Channel ${i + 1}`,
                        channel: `CH-0${i + 1}`,
                        unit: "—",
                        value: v,
                        trend: deriveTrend(prevRaw.current[i], v),
                    }))
                    .filter((c) => c.value !== null);

                prevRaw.current = displayValues;
                setChannels(built);

                // ERR field: 0 = ok, 1 = sensor not connected / malfunctioning
                const errVal = (data as any)?._err;
                setSensorErr(errVal === 1 || errVal === "1");

                // Raw UpdateTimeStamp string for display
                const rawUpdateTs = (data as any)?._updateTs ?? null;
                setUpdateTs(typeof rawUpdateTs === "string" ? rawUpdateTs : null);

                // Build raw data map
                const rawMap: Record<string, number | null> = {};
                rawValues.forEach((v, i) => {
                    rawMap[DEVICE_CHANNELS.NAMES[i] ?? `RawCH${i + 1}`] = v;
                });
                setRawData(rawMap);
                const calibratedMap: Record<string, number | null> = {};
                calibratedValues.forEach((v, i) => {
                    calibratedMap[`CH${i + 1}`] = v;
                });
                setCalibratedData(calibratedMap);

                const timeLabel = new Date(sampleTs || Date.now()).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    timeZone: "Asia/Kolkata",
                });

                if (isFresh && sampleTs > lastDataTs.current) {
                    // Append only fresh, newer samples to history.
                    const row: MqttHistoryRow = { time: timeLabel, ts: sampleTs };
                    displayValues.forEach((v, i) => {
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
        sensorErr,
        updateTs,
        history,
        rawData,
        calibratedData,
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
): { isOnline: boolean; checked: boolean; sensorErr: boolean } {
    const [isOnline, setIsOnline] = useState(false);
    const [checked, setChecked] = useState(false);
    const [sensorErr, setSensorErr] = useState(false);

    useEffect(() => {
        if (!serialNumber) return;
        let mounted = true;

        const check = async () => {
            try {
                const res = await fetch(`/api/mqtt-readings?serialId=${serialNumber}`);
                if (!res.ok) throw new Error("bad response");
                const data = await res.json();
                const hasData = data && !data.error && [1, 2, 3, 4, 5, 6].some(
                    (i) => (data[`CH${i}`] ?? data[`RawCH${i}`]) !== null &&
                           (data[`CH${i}`] ?? data[`RawCH${i}`]) !== undefined
                );
                const payloadTs = getPayloadTimestamp(data as Record<string, unknown>);
                const isRetained = (data as any)?._isRetained === true;
                // PRIMARY: UpdateTimeStamp. FALLBACK: _rxTs (live only via subscribedAt window)
                const rxTs =
                    !isRetained &&
                    typeof (data as any)?._rxTs === "number" &&
                    (data as any)._rxTs > 0
                        ? (data as any)._rxTs as number
                        : null;
                const freshnessTs = payloadTs ?? rxTs;
                const isFresh = freshnessTs !== null
                    ? (Date.now() - freshnessTs) < onlineThresholdMs
                    : false;
                // ERR field: 0 = ok, 1 = sensor not connected / malfunctioning
                const errVal = (data as any)?._err;
                if (mounted) {
                    setIsOnline(Boolean(hasData && isFresh));
                    setSensorErr(errVal === 1 || errVal === "1");
                    setChecked(true);
                }
            } catch {
                if (mounted) {
                    setIsOnline(false);
                    setSensorErr(false);
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

    return { isOnline, checked, sensorErr };
}
