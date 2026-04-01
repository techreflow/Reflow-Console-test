import { NextResponse } from "next/server";
import mqtt from "mqtt";
import {
    MQTT_CHANNEL_NAMES,
    buildMqttTopic,
    extractSerialFromTopic,
    MQTT_CLIENT_OPTIONS,
    MQTT_POLLING_CONFIG,
} from "@/lib/mqtt.constants.js";

// ── Persistent singleton MQTT client ──────────────────────────────
const globalForMqtt = global;
let client = globalForMqtt.mqttReadingsClient || null;
// mqttData[serialId] = { RawCH1..6, _ts, _rxTs, _hasPayloadTs, _isRetained }
let mqttData = globalForMqtt.mqttReadingsData || {};
let subscribedTopics = globalForMqtt.mqttReadingsTopics || new Set();
// subscribedAt[topic] = ms timestamp when we last subscribed to that topic
// Used to detect initial broker "retained replay" vs live device messages.
let subscribedAt = globalForMqtt.mqttReadingsSubscribedAt || {};

if (process.env.NODE_ENV !== "production") {
    globalForMqtt.mqttReadingsData = mqttData;
    globalForMqtt.mqttReadingsTopics = subscribedTopics;
    globalForMqtt.mqttReadingsSubscribedAt = subscribedAt;
}

// generateMqttTopic now uses constants from mqtt.constants.js
const generateMqttTopic = buildMqttTopic;

// How long after a subscribe() call do we consider incoming messages to be
// the broker's "retained replay" (potentially stale) rather than live data.
// Typical retained replay arrives within ~50ms. 800ms is a safe margin.
const RETAINED_REPLAY_WINDOW_MS = 800;

/**
 * Parse a timestamp from a device MQTT payload.
 * Priority: UpdateTimeStamp (device IST field) > _ts > ts > timestamp > createdAt > time
 * UpdateTimeStamp strings with no timezone are treated as IST (+05:30).
 */
function parsePayloadTimestamp(payload) {
    if (!payload || typeof payload !== "object") return null;

    // Primary: device-provided UpdateTimeStamp (IST string or epoch)
    const updateTs = payload.UpdateTimeStamp ?? payload.updateTimestamp ?? payload.update_timestamp;
    if (updateTs !== undefined && updateTs !== null) {
        if (typeof updateTs === "number" && Number.isFinite(updateTs)) {
            return updateTs < 1e12 ? updateTs * 1000 : updateTs;
        }
        if (typeof updateTs === "string" && updateTs.trim()) {
            const trimmed = updateTs.trim();
            if (/^\d+$/.test(trimmed)) {
                const asNum = Number(trimmed);
                if (Number.isFinite(asNum)) return asNum < 1e12 ? asNum * 1000 : asNum;
            }
            // No timezone → treat as IST
            const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
            const candidate = hasZone ? trimmed : `${trimmed}+05:30`;
            const parsed = Date.parse(candidate);
            if (!Number.isNaN(parsed)) return parsed;
        }
    }

    // Fallback: generic _ts / ts / timestamp / createdAt / time fields
    const raw = payload._ts ?? payload.ts ?? payload.timestamp ?? payload.createdAt ?? payload.time;
    if (typeof raw === "number" && Number.isFinite(raw)) {
        return raw < 1e12 ? raw * 1000 : raw;
    }
    if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (!trimmed) return null;
        if (/^\d+$/.test(trimmed)) {
            const asNum = Number(trimmed);
            if (Number.isFinite(asNum)) return asNum < 1e12 ? asNum * 1000 : asNum;
        }
        const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
        const candidate = hasZone ? trimmed : `${trimmed}+05:30`;
        const parsed = Date.parse(candidate);
        return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
}

function getClient() {
    if (client && client.connected) return client;

    const brokerUrl = process.env.MQTT_BROKER_URL;
    if (!brokerUrl) return null;

    client = mqtt.connect(brokerUrl, {
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
        ...MQTT_CLIENT_OPTIONS,
        clientId: `readings_${Math.random().toString(16).slice(2, 8)}`,
    });

    if (process.env.NODE_ENV !== "production") {
        globalForMqtt.mqttReadingsClient = client;
    }

    client.on("connect", () => {
        console.log("[MQTT Readings] Connected to broker");
        // Re-subscribe to any topics we had before reconnect
        for (const topic of subscribedTopics) {
            subscribedAt[topic] = Date.now(); // reset window on reconnect
            client.subscribe(topic, (err) => {
                if (err) console.error(`[MQTT] Re-subscribe failed for ${topic}:`, err.message);
            });
        }
    });

    client.on("message", (topic, message, packet) => {
        try {
            const parsed = JSON.parse(message.toString());
            const serialId = extractSerialFromTopic(topic);
            const payloadTs = parsePayloadTimestamp(parsed);
            const receivedAt = Date.now();

            // ── Retained replay vs live message detection ──────────────────
            // We cannot rely solely on packet.retain because some devices publish
            // ALL messages with retain=1, making even live messages look retained.
            //
            // Instead: track when we subscribed to each topic. Messages arriving
            // within RETAINED_REPLAY_WINDOW_MS of subscription = broker's initial
            // retained replay (potentially stale). Messages after that = live.
            const subTime = subscribedAt[topic] ?? 0;
            const msSinceSubscribe = receivedAt - subTime;
            const isInitialRetainedReplay = msSinceSubscribe < RETAINED_REPLAY_WINDOW_MS;

            // For the initial retained replay: _rxTs = device ts (or 0 if unknown)
            // For live messages: _rxTs = server receive time
            const rxTimestamp = isInitialRetainedReplay
                ? (payloadTs ?? 0)   // 0 = "unknown" → hook will treat as Offline
                : receivedAt;        // live message → definitely fresh

            // DEBUG: log every received message so we can see exact payload structure
            console.log(`[MQTT] ${serialId} | retain=${packet?.retain} | msSinceSub=${msSinceSubscribe} | isRetainedReplay=${isInitialRetainedReplay} | payloadTs=${payloadTs} | keys=${Object.keys(parsed).join(",")}`);

            const channelData = {
                _ts: payloadTs,
                _rxTs: rxTimestamp,
                _hasPayloadTs: payloadTs !== null,
                _isRetained: isInitialRetainedReplay,
                _err: parsed.ERR ?? parsed.err ?? parsed.Error ?? null,
                _updateTs: parsed.UpdateTimeStamp ?? parsed.updateTimestamp ?? null,
            };
            MQTT_CHANNEL_NAMES.forEach((ch) => {
                channelData[ch] = parsed[ch] ?? null;
            });
            mqttData[serialId] = channelData;
        } catch (error) {
            console.error("[MQTT Readings] Failed to parse message:", error.message);
        }
    });

    client.on("error", (err) => {
        console.error("[MQTT Readings] Connection error:", err.message);
    });

    client.on("offline", () => {
        console.warn("[MQTT Readings] Client went offline");
    });

    return client;
}

async function ensureSubscribed(mqttClient, serialId) {
    const topic = generateMqttTopic(serialId);
    if (subscribedTopics.has(topic)) return; // already subscribed — persist across requests

    subscribedAt[topic] = Date.now(); // record subscription time for retained-replay detection
    return new Promise((resolve, reject) => {
        mqttClient.subscribe(topic, (err) => {
            if (err) {
                reject(err);
            } else {
                subscribedTopics.add(topic);
                resolve();
            }
        });
    });
}

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const serialId = searchParams.get("serialId");

    if (!serialId) {
        return NextResponse.json({ error: "serialId parameter is required" }, { status: 400 });
    }

    const mqttClient = getClient();
    if (!mqttClient) {
        return NextResponse.json({ error: "MQTT broker not configured" }, { status: 503 });
    }

    try {
        // Wait for connection if not yet connected (up to 5s)
        if (!mqttClient.connected) {
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("Connection timeout")), 5000);
                mqttClient.once("connect", () => { clearTimeout(timeout); resolve(); });
                mqttClient.once("error", (err) => { clearTimeout(timeout); reject(err); });
            });
        }

        // Subscribe (no-op if already subscribed)
        await ensureSubscribed(mqttClient, serialId);

        // If we already have fresh data (received < 5s ago), return it immediately.
        // Use _rxTs (server-receive time) for the cache check — _ts can be null when
        // the device doesn't embed its own timestamp.
        const cached = mqttData[serialId];
        const cachedRxTs = typeof cached?._rxTs === "number" ? cached._rxTs : NaN;
        if (cached && Number.isFinite(cachedRxTs) && (Date.now() - cachedRxTs) < MQTT_POLLING_CONFIG.CACHE_CHECK_INTERVAL) {
            return NextResponse.json(cached);
        }

        // Otherwise wait briefly for first message
        await new Promise((resolve) => setTimeout(resolve, MQTT_POLLING_CONFIG.DATA_WAIT_TIMEOUT));

        const data = mqttData[serialId] || {};
        return NextResponse.json({
            RawCH1: data.RawCH1 ?? null,
            RawCH2: data.RawCH2 ?? null,
            RawCH3: data.RawCH3 ?? null,
            RawCH4: data.RawCH4 ?? null,
            RawCH5: data.RawCH5 ?? null,
            RawCH6: data.RawCH6 ?? null,
            _ts: data._ts ?? null,             // device UpdateTimeStamp (ms epoch)
            _rxTs: data._rxTs ?? null,         // server-receive time (0 = unknown for retained)
            _err: data._err ?? null,           // ERR field: 0=ok, 1=sensor fault
            _updateTs: data._updateTs ?? null, // raw UpdateTimeStamp string
            _isRetained: data._isRetained ?? false, // true = retained broker message (device may be offline)
        });
    } catch (error) {
        console.error("[MQTT Readings] Error:", error.message);
        return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
    }
}
