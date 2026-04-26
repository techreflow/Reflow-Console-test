/**
 * Centralized configuration and constants
 * Replace hardcoded values throughout the app with these config exports
 */

// ─── MQTT Configuration ───────────────────────────────────────────
export const MQTT_CONFIG = {
  BROKER_URL: process.env.MQTT_BROKER_URL || "mqtt://mqtt.reflowtech.cloud:1883",
  USERNAME: process.env.MQTT_USERNAME || "mqttreflowtech",
  PASSWORD: process.env.MQTT_PASSWORD || "",
  CONNECT_TIMEOUT: 5000,
  RECONNECT_PERIOD: 5000,
  KEEPALIVE: 60,
  CACHE_CHECK_INTERVAL: 5000,
  DATA_WAIT_TIMEOUT: 1500,
};

// ─── Channel Configuration ────────────────────────────────────────
export const DEVICE_CHANNELS = {
  COUNT: 6,
  NAMES: ["RawCH1", "RawCH2", "RawCH3", "RawCH4", "RawCH5", "RawCH6"] as const,
  // Get all channel names dynamically
  getChannelNames: () => DEVICE_CHANNELS.NAMES,
  // Get channel index by name
  getChannelIndex: (name: string) => DEVICE_CHANNELS.NAMES.indexOf(name as any),
  // Check if name is a valid channel
  isValidChannel: (name: string) => DEVICE_CHANNELS.NAMES.includes(name as any),
};

// ─── Device Configuration Defaults ───────────────────────────────
export const DEVICE_DEFAULTS = {
  SAMPLING_RATE: 500, // Hz
  TEMP_THRESHOLD: 85.5, // °C
  BUFFER_SIZE: "512 KB",
  TRANSMISSION_INTERVAL: 10, // seconds
  CHANNEL_CONFIG: {
    CH1: { min: 0, max: 100, factor: 1, offset: 0 },
    CH2: { min: 0, max: 100, factor: 1, offset: 0 },
    CH3: { min: 0, max: 100, factor: 1, offset: 0 },
    CH4: { min: 0, max: 100, factor: 1, offset: 0 },
    CH5: { min: 0, max: 100, factor: 1, offset: 0 },
    CH6: { min: 0, max: 100, factor: 1, offset: 0 },
  },
};

// ─── Polling & Timing Configuration ──────────────────────────────
export const POLLING_CONFIG = {
  MQTT_POLL_INTERVAL: 3000,         // 3 seconds - primary polling
  MQTT_SECONDARY_INTERVAL: 5000,    // 5 seconds - secondary check
  MQTT_HISTORY_MAX_POINTS: 60,
  // 5-min threshold — device UpdateTimeStamp within 5 mins of now → Online.
  // Matches original working config; handles devices that publish every 2-3 minutes.
  MQTT_ONLINE_THRESHOLD: 300_000,
  // Keep device online for 1 minute during transient network latency/dropouts.
  MQTT_OFFLINE_GRACE_MS: 60_000,
  MQTT_STATUS_POLL: 15_000,         // 15 seconds - status badge check interval
  ANALYTICS_AUTO_FETCH: 7000,       // Auto-fetch analytics after delay
  DASHBOARD_MQTT_REFRESH: 30_000,   // 30 seconds - refresh MQTT stats on dashboard
};

// ─── CSV Export Configuration ────────────────────────────────────
export const CSV_CONFIG = {
  HEADERS: ["time", ...DEVICE_CHANNELS.NAMES],
  FILENAME_PATTERN: (deviceId: string, timestamp: string) =>
    `${deviceId}_data_${timestamp}.csv`,
  DATE_FORMAT: "YYYY-MM-DD HH:mm:ss",
};

// ─── Chart & Analytics Configuration ─────────────────────────────
export const CHART_CONFIG = {
  COLORS: [
    "#3b82f6", // Blue
    "#10b981", // Green
    "#f59e0b", // Amber
    "#ef4444", // Red
    "#8b5cf6", // Purple
    "#ec4899", // Pink
  ] as const,
  CHART_TYPES: ["Line", "Bar"] as const,
  MARGIN: { top: 5, right: 30, left: 20, bottom: 5 },
  TOOLTIP_STYLE: {
    backgroundColor: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
    fontSize: "12px",
  },
};

// ─── Project Card Gradients ─────────────────────────────────────
export const PROJECT_GRADIENTS = [
  { from: "blue-400", to: "blue-600" },
  { from: "violet-400", to: "violet-600" },
  { from: "green-400", to: "green-600" },
  { from: "orange-400", to: "orange-600" },
  { from: "rose-400", to: "rose-600" },
  { from: "cyan-400", to: "cyan-600" },
  { from: "emerald-400", to: "emerald-600" },
  { from: "indigo-400", to: "indigo-600" },
];

export const getProjectGradient = (index: number) =>
  PROJECT_GRADIENTS[index % PROJECT_GRADIENTS.length];

// ─── Avatar Colors ──────────────────────────────────────────────
export const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-teal-500",
];

export const getAvatarColor = (index: number) =>
  AVATAR_COLORS[index % AVATAR_COLORS.length];

// ─── Toast/Notification Configuration ────────────────────────────
export const NOTIFICATION_CONFIG = {
  AUTO_DISMISS_TIME: 3000, // 3 seconds
  ERROR_DISMISS_TIME: 5000, // 5 seconds for errors
};

// ─── API Endpoints ──────────────────────────────────────────────
export const API_ENDPOINTS = {
  BASE_URL: process.env.NEXT_PUBLIC_REFLOW_API_URL || "https://reflow-backend.fly.dev/api/v1",
  BOT_CHAT: process.env.NEXT_PUBLIC_BOT_API_URL || "https://reflow-backend.fly.dev/api/v1/bot/chat",
  DASHBOARD: process.env.NEXT_PUBLIC_DASHBOARD_URL || "http://localhost:3001",
};

// ─── Feature Flags ──────────────────────────────────────────────
export const FEATURE_FLAGS = {
  ENABLE_LIVE_MQTT: true,
  ENABLE_EXPORT_CSV: true,
  ENABLE_EXPORT_PDF: true,
  ENABLE_EXPORT_IMAGE: true,
  ENABLE_BOT_CHAT: true,
  ENABLE_MQTT_STATUS: true,
  DEBUG_MODE: process.env.NODE_ENV === "development",
};

// ─── MQTT Topic Pattern ─────────────────────────────────────────
export const MQTT_TOPIC_PATTERN = {
  buildTopic: (serialId: string) => {
    const prefix = serialId.substring(0, 3); // First 3 chars
    const suffix = serialId.substring(3, 5); // Chars 3-5
    return `${prefix}/${suffix}/OUTPUT`;
  },
};

// ─── UI Text Constants ──────────────────────────────────────────
export const UI_TEXT = {
  LOADING: "Loading...",
  ERROR: "Something went wrong. Please try again.",
  NO_DATA: "No data available",
  EMPTY_DEVICES: "No devices found",
  EMPTY_PROJECTS: "No projects found",
  BOT_SUGGESTIONS: [
    "Show me device performance",
    "Analyze temperature trend",
    "What's the device status?",
    "Export last 24 hours data",
  ],
};
