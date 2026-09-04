import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Type Exports ─────────────────────────────────────────────────────────────

/**
 * Lightweight view of a registered device subscription (no DB internals exposed).
 */
export interface DeviceSubscription {
  token: string;
  flightNumber: string;
  platform?: string;
  updatedAt: string;
}

/**
 * Notification state stored per flight for change-detection deduplication.
 * Kept in-memory only; the app restarts clean which is acceptable since the
 * database already prevents duplicate device registrations.
 */
export interface NotificationHistoryItem {
  flightNumber: string;
  terminal: string;
  gate: string;
  timestamp: string;
}

// ─── In-memory notification history (deduplication) ──────────────────────────

let _notificationHistory: Record<string, NotificationHistoryItem> = {};

export function getNotificationHistory(): Record<string, NotificationHistoryItem> {
  return _notificationHistory;
}

export function saveNotificationHistory(history: Record<string, NotificationHistoryItem>): void {
  _notificationHistory = history;
}

// ─── Database-backed device registration ─────────────────────────────────────

/**
 * Register or update a device token for a given flight.
 * Uses upsert so that registering the same (flightNumber, token) pair again
 * simply refreshes the updatedAt timestamp instead of creating a duplicate row.
 */
export async function registerDeviceToken(
  token: string,
  flightNumber: string,
  platform = 'android',
): Promise<DeviceSubscription> {
  const normalizedFlight = flightNumber.trim().toUpperCase();

  const record = await prisma.deviceSubscription.upsert({
    where: {
      flightNumber_deviceToken: {
        flightNumber: normalizedFlight,
        deviceToken: token,
      },
    },
    update: {
      platform,
      // updatedAt is handled automatically by @updatedAt
    },
    create: {
      deviceToken: token,
      flightNumber: normalizedFlight,
      platform,
    },
  });

  console.log(
    `[NotificationStorage] Upserted device registration for flight ${normalizedFlight} (token: ${maskToken(token)})`,
  );

  return {
    token: record.deviceToken,
    flightNumber: record.flightNumber,
    platform: record.platform,
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * Return the distinct set of device tokens registered for a specific flight.
 * Duplicates are eliminated at the DB level (unique constraint) but we
 * additionally deduplicate here in-memory as a defence-in-depth measure.
 */
export async function getTokensForFlight(flightNumber: string): Promise<string[]> {
  const normalizedFlight = flightNumber.trim().toUpperCase();

  const records = await prisma.deviceSubscription.findMany({
    where: { flightNumber: normalizedFlight },
    select: { deviceToken: true },
  });

  // Deduplicate token strings (should be a no-op due to DB unique constraint)
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const r of records) {
    if (!seen.has(r.deviceToken)) {
      seen.add(r.deviceToken);
      tokens.push(r.deviceToken);
    }
  }

  return tokens;
}

/**
 * Return all registered device subscriptions (admin/diagnostic use).
 */
export async function getDeviceSubscriptions(): Promise<DeviceSubscription[]> {
  const records = await prisma.deviceSubscription.findMany({
    orderBy: { updatedAt: 'desc' },
  });

  return records.map((r) => ({
    token: r.deviceToken,
    flightNumber: r.flightNumber,
    platform: r.platform,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function maskToken(token: string): string {
  if (!token || token.length <= 10) return '***';
  return `${token.substring(0, 6)}...${token.substring(token.length - 4)}`;
}
