import fs from 'fs';
import path from 'path';

/**
 * Interface representing a registered device subscription
 */
export interface DeviceSubscription {
  token: string;
  flightNumber: string;
  platform?: string;
  updatedAt: string;
}

/**
 * Interface representing a flight notification history item for deduplication
 */
export interface NotificationHistoryItem {
  flightNumber: string;
  terminal: string;
  gate: string;
  timestamp: string;
}

const DATA_DIR = path.resolve(__dirname, '../../data');
const DEVICES_FILE = path.join(DATA_DIR, 'device_subscriptions.json');
const HISTORY_FILE = path.join(DATA_DIR, 'flight_notification_history.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Load device subscriptions from local JSON storage
 */
export function getDeviceSubscriptions(): DeviceSubscription[] {
  try {
    ensureDataDir();
    if (!fs.existsSync(DEVICES_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(DEVICES_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[NotificationStorage] Failed to read device subscriptions:', err);
    return [];
  }
}

/**
 * Register or update a device token mapped to a specific flightNumber
 */
export function registerDeviceToken(token: string, flightNumber: string, platform = 'android'): DeviceSubscription {
  ensureDataDir();
  const normalizedFlight = flightNumber.trim().toUpperCase();
  const devices = getDeviceSubscriptions();
  
  const existingIdx = devices.findIndex((d) => d.token === token);
  const subscription: DeviceSubscription = {
    token,
    flightNumber: normalizedFlight,
    platform,
    updatedAt: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    devices[existingIdx] = subscription;
  } else {
    devices.push(subscription);
  }

  fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2), 'utf-8');
  console.log(`[NotificationStorage] Registered device token for flight ${normalizedFlight}`);
  return subscription;
}

/**
 * Get device tokens registered for a specific flight
 */
export function getTokensForFlight(flightNumber: string): string[] {
  const normalizedFlight = flightNumber.trim().toUpperCase();
  const devices = getDeviceSubscriptions();
  return devices
    .filter((d) => d.flightNumber === normalizedFlight)
    .map((d) => d.token);
}

/**
 * Load the last recorded notification state per flight for deduplication
 */
export function getNotificationHistory(): Record<string, NotificationHistoryItem> {
  try {
    ensureDataDir();
    if (!fs.existsSync(HISTORY_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[NotificationStorage] Failed to read notification history:', err);
    return {};
  }
}

/**
 * Save notification state to persistent storage
 */
export function saveNotificationHistory(history: Record<string, NotificationHistoryItem>) {
  try {
    ensureDataDir();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
  } catch (err) {
    console.error('[NotificationStorage] Failed to save notification history:', err);
  }
}
