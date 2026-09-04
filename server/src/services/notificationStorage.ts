/**
 * notificationStorage.ts
 *
 * CRITICAL FIX (reliability):
 *   All device registrations are stored permanently in PostgreSQL via Prisma.
 *   The flight-watcher baseline (terminal/gate last seen) is also stored in
 *   PostgreSQL so it survives Render restarts and redeployments.
 *
 *   Root causes fixed:
 *   1. Previously used local JSON files → gone on every Render deploy.
 *   2. Watcher baseline was in-memory only → first check after restart would
 *      record the current state AS the new baseline, silently swallowing any
 *      gate change that happened while the server was down.
 *   3. Used a local `new PrismaClient()` instead of the shared singleton,
 *      risking connection-pool exhaustion under load.
 */

import prisma from '../prisma/client';

// ─── Type Exports ─────────────────────────────────────────────────────────────

/** Lightweight view of a registered device subscription. */
export interface DeviceSubscription {
  token: string;
  flightNumber: string;
  platform?: string;
  updatedAt: string;
}

/** Persisted notification baseline per flight. */
export interface FlightStateSnapshot {
  flightNumber: string;
  terminal: string;
  gate: string;
  recordedAt: string;
}

// ─── Device registration (PostgreSQL) ────────────────────────────────────────

/**
 * Register or update a device token for a given flight.
 * Upserts on (flightNumber, deviceToken) – never creates duplicates.
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
    update: { platform },
    create: { deviceToken: token, flightNumber: normalizedFlight, platform },
  });

  console.log(
    `[NotificationStorage] Upserted device for flight ${normalizedFlight} (token: ${maskToken(token)})`,
  );

  return {
    token: record.deviceToken,
    flightNumber: record.flightNumber,
    platform: record.platform,
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * Return the distinct device tokens registered for a specific flight.
 * Queries PostgreSQL on every call – never uses in-memory state.
 */
export async function getTokensForFlight(flightNumber: string): Promise<string[]> {
  const normalizedFlight = flightNumber.trim().toUpperCase();

  const records = await prisma.deviceSubscription.findMany({
    where: { flightNumber: normalizedFlight },
    select: { deviceToken: true },
  });

  console.log(
    `[NotificationStorage] Found ${records.length} registered device(s) in DB for flight ${normalizedFlight}`,
  );

  // Deduplicate token strings (DB unique constraint should prevent duplicates,
  // but we deduplicate here as defence-in-depth)
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

/** Return all registered device subscriptions (admin/diagnostic use). */
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

// ─── Flight state snapshots (PostgreSQL – survives restarts) ─────────────────

/**
 * Load the persisted baseline for a flight from PostgreSQL.
 * Returns null if no baseline has been recorded yet (new flight).
 */
export async function getFlightStateSnapshot(
  flightNumber: string,
): Promise<FlightStateSnapshot | null> {
  const record = await prisma.flightStateSnapshot.findUnique({
    where: { flightNumber },
  });
  if (!record) return null;
  return {
    flightNumber: record.flightNumber,
    terminal: record.terminal,
    gate: record.gate,
    recordedAt: record.recordedAt.toISOString(),
  };
}

/**
 * Persist (upsert) the last-known terminal+gate for a flight.
 * Called by the watcher after successfully dispatching a notification,
 * and also when initialising a new flight baseline.
 */
export async function saveFlightStateSnapshot(
  flightNumber: string,
  terminal: string,
  gate: string,
): Promise<void> {
  await prisma.flightStateSnapshot.upsert({
    where: { flightNumber },
    update: { terminal, gate },
    create: { flightNumber, terminal, gate },
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function maskToken(token: string): string {
  if (!token || token.length <= 10) return '***';
  return `${token.substring(0, 6)}...${token.substring(token.length - 4)}`;
}
