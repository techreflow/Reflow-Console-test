/**
 * useMqttDevice — shared real-time MQTT hooks
 *
 * Global polling model:
 * - One poller per serial number (singleton, shared across pages/components)
 * - Subscribers receive cached presence state immediately
 * - Polling pauses when no subscribers, cache retained with TTL for route changes
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
    /** false = checking grace window, true = resolved online/offline */
    checked: boolean;
    lastSync: string | null;
    mqttError: boolean;
    sensorErr: boolean;
    updateTs: string | null;
    history: MqttHistoryRow[];
    rawData: Record<string, number | null>;
    calibratedData: Record<string, number | null>;
    refresh: () => void;
}

type PresenceState = "checking" | "online" | "offline";

type MqttPayload = Record<string, unknown>;

interface PresenceSnapshot {
    state: PresenceState;
    isOnline: boolean;
    checked: boolean;
    sensorErr: boolean;
    mqttError: boolean;
    lastHealthyAt: number;
    mountedAt: number;
    updatedAt: number;
    data: MqttPayload | null;
    sampleTs: number | null;
    isFreshSignal: boolean;
}

interface PresenceEntry {
    serial: string;
    intervalMs: number;
    onlineThresholdMs: number;
    snapshot: PresenceSnapshot;
    subscribers: Set<(snapshot: PresenceSnapshot) => void>;
    timer: ReturnType<typeof setInterval> | null;
    stopTimer: ReturnType<typeof setTimeout> | null;
    inFlight: boolean;
}

const OFFLINE_GRACE_MS = Math.max(10_000, POLLING_CONFIG.MQTT_OFFLINE_GRACE_MS ?? 60_000);
const INITIAL_CHECKING_WINDOW_MS = 30_000;
const PRESENCE_CACHE_TTL_MS = 5 * 60_000;
const UNSUBSCRIBE_STOP_DELAY_MS = 60_000;
const HIDDEN_INTERVAL_MULTIPLIER = 3;
const MIN_INTERVAL_MS = 2_000;
const MAX_INTERVAL_MS = 60_000;

const presenceStore = new Map<string, PresenceEntry>();
let runtimeInitialized = false;
let isPageHidden = false;

function clampInterval(intervalMs: number): number {
    if (!Number.isFinite(intervalMs)) return POLLING_CONFIG.MQTT_STATUS_POLL;
    return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.round(intervalMs)));
}

function getEffectiveInterval(baseIntervalMs: number): number {
    const base = clampInterval(baseIntervalMs);
    return isPageHidden ? Math.min(MAX_INTERVAL_MS, base * HIDDEN_INTERVAL_MULTIPLIER) : base;
}

function deriveTrend(prev: number | null, curr: number | null): "up" | "down" | "stable" | "warning" {
    if (prev === null || curr === null) return "stable";
    if (curr > prev * 1.1) return "up";
    if (curr < prev * 0.9) return "down";
    return "stable";
}

function getPayloadTimestamp(data: MqttPayload | null | undefined): number | null {
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

function resolvePresence(now: number, mountedAt: number, lastHealthyAt: number): { state: PresenceState; isOnline: boolean; checked: boolean } {
    if (lastHealthyAt > 0) {
        if ((now - lastHealthyAt) < OFFLINE_GRACE_MS) {
            return { state: "online", isOnline: true, checked: true };
        }
        return { state: "offline", isOnline: false, checked: true };
    }

    if ((now - mountedAt) < INITIAL_CHECKING_WINDOW_MS) {
        return { state: "checking", isOnline: false, checked: false };
    }

    return { state: "offline", isOnline: false, checked: true };
}

function buildInitialSnapshot(now: number): PresenceSnapshot {
    return {
        state: "checking",
        isOnline: false,
        checked: false,
        sensorErr: false,
        mqttError: false,
        lastHealthyAt: 0,
        mountedAt: now,
        updatedAt: now,
        data: null,
        sampleTs: null,
        isFreshSignal: false,
    };
}

function isEntryStale(entry: PresenceEntry): boolean {
    if (entry.subscribers.size > 0) return false;
    return (Date.now() - entry.snapshot.updatedAt) > PRESENCE_CACHE_TTL_MS;
}

function notifyEntry(entry: PresenceEntry) {
    entry.subscribers.forEach((subscriber) => {
        try {
            subscriber(entry.snapshot);
        } catch (err) {
            console.error("[mqtt-presence] subscriber error", err);
        }
    });
}

function stopEntryTimer(entry: PresenceEntry) {
    if (entry.timer) {
        clearInterval(entry.timer);
        entry.timer = null;
    }
}

function restartEntryTimer(entry: PresenceEntry) {
    stopEntryTimer(entry);
    if (entry.subscribers.size === 0) return;

    const interval = getEffectiveInterval(entry.intervalMs);
    entry.timer = setInterval(() => {
        void pollEntry(entry);
    }, interval);
}

function scheduleEntryStop(entry: PresenceEntry) {
    if (entry.stopTimer) {
        clearTimeout(entry.stopTimer);
        entry.stopTimer = null;
    }

    entry.stopTimer = setTimeout(() => {
        if (entry.subscribers.size > 0) return;
        stopEntryTimer(entry);
        if (isEntryStale(entry)) {
            presenceStore.delete(entry.serial);
        }
    }, UNSUBSCRIBE_STOP_DELAY_MS);
}

function refreshAllEntryTimers() {
    presenceStore.forEach((entry) => {
        if (entry.subscribers.size > 0) {
            restartEntryTimer(entry);
        }
    });
}

function ensureEntry(serial: string, intervalMs: number, onlineThresholdMs: number): PresenceEntry {
    const current = presenceStore.get(serial);
    if (current && !isEntryStale(current)) {
        current.intervalMs = Math.min(current.intervalMs, clampInterval(intervalMs));
        current.onlineThresholdMs = Math.max(current.onlineThresholdMs, onlineThresholdMs);
        return current;
    }

    if (current && isEntryStale(current)) {
        presenceStore.delete(serial);
    }

    const now = Date.now();
    const entry: PresenceEntry = {
        serial,
        intervalMs: clampInterval(intervalMs),
        onlineThresholdMs,
        snapshot: buildInitialSnapshot(now),
        subscribers: new Set(),
        timer: null,
        stopTimer: null,
        inFlight: false,
    };
    presenceStore.set(serial, entry);
    return entry;
}

async function pollEntry(entry: PresenceEntry, force = false) {
    if (entry.inFlight && !force) return;
    entry.inFlight = true;

    try {
        const res = await fetch(`/api/mqtt-readings?serialId=${entry.serial}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (data?.error) throw new Error("mqtt error payload");

        const payload = data as MqttPayload;
        const now = Date.now();

        const hasData = [1, 2, 3, 4, 5, 6].some((i) => {
            const v = payload[`CH${i}`] ?? payload[`RawCH${i}`];
            return v !== null && v !== undefined;
        });

        const payloadTs = getPayloadTimestamp(payload);
        const isRetained = payload._isRetained === true;
        const rxTs =
            !isRetained &&
            typeof payload._rxTs === "number" &&
            payload._rxTs > 0
                ? (payload._rxTs as number)
                : null;

        const sampleTs = (rxTs ?? payloadTs ?? null);
        const freshFromPayload = payloadTs !== null && (now - payloadTs) < entry.onlineThresholdMs;
        const freshFromRx = rxTs !== null && (now - rxTs) < OFFLINE_GRACE_MS;
        const isFreshSignal = hasData && (freshFromPayload || freshFromRx);

        const lastHealthyAt = isFreshSignal ? now : entry.snapshot.lastHealthyAt;
        const presence = resolvePresence(now, entry.snapshot.mountedAt, lastHealthyAt);
        const errVal = payload._err;

        entry.snapshot = {
            ...entry.snapshot,
            state: presence.state,
            isOnline: presence.isOnline,
            checked: presence.checked,
            sensorErr: errVal === 1 || errVal === "1",
            mqttError: false,
            lastHealthyAt,
            updatedAt: now,
            data: payload,
            sampleTs,
            isFreshSignal,
        };
        notifyEntry(entry);
    } catch {
        const now = Date.now();
        const presence = resolvePresence(now, entry.snapshot.mountedAt, entry.snapshot.lastHealthyAt);

        entry.snapshot = {
            ...entry.snapshot,
            state: presence.state,
            isOnline: presence.isOnline,
            checked: presence.checked,
            sensorErr: false,
            mqttError: true,
            updatedAt: now,
            data: null,
            sampleTs: null,
            isFreshSignal: false,
        };
        notifyEntry(entry);
    } finally {
        entry.inFlight = false;
    }
}

function subscribePresence(
    serial: string,
    options: { intervalMs: number; onlineThresholdMs: number },
    subscriber: (snapshot: PresenceSnapshot) => void
): () => void {
    initMqttPresenceRuntime();

    const entry = ensureEntry(serial, options.intervalMs, options.onlineThresholdMs);

    if (entry.stopTimer) {
        clearTimeout(entry.stopTimer);
        entry.stopTimer = null;
    }

    entry.subscribers.add(subscriber);
    subscriber(entry.snapshot);

    if (!entry.timer) {
        restartEntryTimer(entry);
    }

    const shouldPollNow =
        entry.snapshot.updatedAt === 0 ||
        (Date.now() - entry.snapshot.updatedAt) > getEffectiveInterval(entry.intervalMs);

    if (shouldPollNow || entry.snapshot.data === null) {
        void pollEntry(entry);
    }

    return () => {
        entry.subscribers.delete(subscriber);
        if (entry.subscribers.size === 0) {
            scheduleEntryStop(entry);
        }
    };
}

function requestPresencePoll(serial: string) {
    const entry = presenceStore.get(serial);
    if (!entry) return;
    void pollEntry(entry, true);
}

export function initMqttPresenceRuntime() {
    if (runtimeInitialized) return;
    if (typeof window === "undefined") return;

    runtimeInitialized = true;
    isPageHidden = document.visibilityState === "hidden";

    document.addEventListener("visibilitychange", () => {
        isPageHidden = document.visibilityState === "hidden";
        refreshAllEntryTimers();
    });
}

export function useMqttDevice(
    serialNumber: string | null | undefined,
    intervalMs = POLLING_CONFIG.MQTT_POLL_INTERVAL,
    maxHistory = POLLING_CONFIG.MQTT_HISTORY_MAX_POINTS,
    onlineThresholdMs = POLLING_CONFIG.MQTT_ONLINE_THRESHOLD,
    enabled = true
): UseMqttDeviceResult {
    const [channels, setChannels] = useState<MqttChannel[]>([]);
    const [isOnline, setIsOnline] = useState(false);
    const [checked, setChecked] = useState(false);
    const [lastSync, setLastSync] = useState<string | null>(null);
    const [mqttError, setMqttError] = useState(false);
    const [sensorErr, setSensorErr] = useState(false);
    const [updateTs, setUpdateTs] = useState<string | null>(null);
    const [history, setHistory] = useState<MqttHistoryRow[]>([]);
    const [rawData, setRawData] = useState<Record<string, number | null>>({});
    const [calibratedData, setCalibratedData] = useState<Record<string, number | null>>({});

    const prevRaw = useRef<(number | null)[]>([null, null, null, null, null, null]);
    const lastDataTs = useRef<number>(0);

    useEffect(() => {
        if (!serialNumber || !enabled) {
            setChannels([]);
            setIsOnline(false);
            setChecked(false);
            setMqttError(false);
            setSensorErr(false);
            setUpdateTs(null);
            return;
        }

        const unsubscribe = subscribePresence(
            serialNumber,
            { intervalMs, onlineThresholdMs },
            (snapshot) => {
                setIsOnline(snapshot.isOnline);
                setChecked(snapshot.checked);
                setMqttError(snapshot.mqttError);
                setSensorErr(snapshot.sensorErr);

                const data = snapshot.data;
                if (!data) return;

                const rawValues = [1, 2, 3, 4, 5, 6].map((i) => {
                    const rawVal = data[`RawCH${i}`];
                    return rawVal !== null && rawVal !== undefined ? Number(rawVal) : null;
                }) as (number | null)[];

                const calibratedValues = [1, 2, 3, 4, 5, 6].map((i) => {
                    const cal = data[`CH${i}`];
                    return cal !== null && cal !== undefined ? Number(cal) : null;
                }) as (number | null)[];

                const displayValues = calibratedValues.map((cal, idx) => cal ?? rawValues[idx]) as (number | null)[];
                const hasData = displayValues.some((v) => v !== null);

                if (hasData) {
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
                }

                const rawUpdateTs = data._updateTs;
                setUpdateTs(typeof rawUpdateTs === "string" ? rawUpdateTs : null);

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

                const sampleTs = snapshot.sampleTs ?? 0;
                if (snapshot.isFreshSignal && sampleTs > lastDataTs.current) {
                    const timeLabel = new Date(sampleTs).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        timeZone: "Asia/Kolkata",
                    });

                    const row: MqttHistoryRow = { time: timeLabel, ts: sampleTs };
                    displayValues.forEach((v, i) => {
                        if (v !== null) row[`CH${i + 1}`] = v;
                    });

                    setHistory((prev) => {
                        const next = [...prev, row];
                        return next.length > maxHistory ? next.slice(next.length - maxHistory) : next;
                    });
                    setLastSync(timeLabel);
                    lastDataTs.current = sampleTs;
                }
            }
        );

        return unsubscribe;
    }, [serialNumber, intervalMs, maxHistory, onlineThresholdMs, enabled]);

    const refresh = useCallback(() => {
        if (!serialNumber) return;
        requestPresencePoll(serialNumber);
    }, [serialNumber]);

    return {
        channels,
        isOnline,
        checked,
        lastSync,
        mqttError,
        sensorErr,
        updateTs,
        history,
        rawData,
        calibratedData,
        refresh,
    };
}

/**
 * Lightweight shared status hook for list pages.
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
        if (!serialNumber) {
            setIsOnline(false);
            setChecked(false);
            setSensorErr(false);
            return;
        }

        const unsubscribe = subscribePresence(
            serialNumber,
            { intervalMs, onlineThresholdMs },
            (snapshot) => {
                setIsOnline(snapshot.isOnline);
                setChecked(snapshot.checked);
                setSensorErr(snapshot.sensorErr);
            }
        );

        return unsubscribe;
    }, [serialNumber, intervalMs, onlineThresholdMs]);

    return { isOnline, checked, sensorErr };
}
