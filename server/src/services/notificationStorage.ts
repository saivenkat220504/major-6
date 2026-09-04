/**
 * notificationStorage.ts
 *
 * CRITICAL RELIABILITY:
 *   - All device registrations are stored permanently in PostgreSQL via Prisma.
 *   - Unique constraint @@unique([flightNumber, deviceToken]) enforces no duplicates.
 *   - Prisma upsert updates existing records without duplication.
 *   - Bidirectional flight number matching handles "AI-102", "AI102", and "ai-102".
 *   - Automatic token deletion for tokens marked invalid/unregistered by Firebase.
 *   - The flight-watcher baseline (terminal/gate) is stored in PostgreSQL (FlightStateSnapshot)
 *     so it survives Render restarts and redeployments.
 */

import prisma from '../prisma/client';

// ─── Type Exports ─────────────────────────────────────────────────────────────

export interface DeviceSubscription {
  token: string;
  flightNumber: string;
  platform?: string;
  updatedAt: string;
}

export interface FlightStateSnapshot {
  flightNumber: string;
  terminal: string;
  gate: string;
  recordedAt: string;
}

// ─── Flight Number Canonicalization & Variants ────────────────────────────────

/**
 * Standardize flight numbers into canonical format.
 * e.g., "ai 102" -> "AI-102", "AI102" -> "AI-102", "6E2412" -> "6E-2412"
 */
export function toCanonicalFlightNumber(flightNumber: string): string {
  if (!flightNumber) return '';
  const clean = flightNumber.trim().toUpperCase();
  const match = clean.match(/^([A-Z]{2,3}|[A-Z0-9]{2})[\s\-_]*([0-9]+)$/);
  if (match) {
    return `${match[1]}-${match[2]}`;
  }
  return clean;
}

/**
 * Generate all plausible query variants for a flight number to guarantee matching
 * between registration and database queries (e.g. "AI-102", "AI102", "AI 102").
 */
export function getFlightNumberVariants(flightNumber: string): string[] {
  if (!flightNumber) return [];
  const clean = flightNumber.trim().toUpperCase();
  const set = new Set<string>();
  set.add(clean);

  const match = clean.match(/^([A-Z]{2,3}|[A-Z0-9]{2})[\s\-_]*([0-9]+)$/);
  if (match) {
    const code = match[1];
    const num = match[2];
    set.add(`${code}-${num}`);
    set.add(`${code}${num}`);
    set.add(`${code} ${num}`);
  }

  return Array.from(set);
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
  const canonicalFlight = toCanonicalFlightNumber(flightNumber);

  const record = await prisma.deviceSubscription.upsert({
    where: {
      flightNumber_deviceToken: {
        flightNumber: canonicalFlight,
        deviceToken: token,
      },
    },
    update: { platform },
    create: { deviceToken: token, flightNumber: canonicalFlight, platform },
  });

  console.log(
    `[NotificationStorage] ✅ Upserted device for flight ${canonicalFlight} (token: ${maskToken(token)}) in PostgreSQL`,
  );

  return {
    token: record.deviceToken,
    flightNumber: record.flightNumber,
    platform: record.platform,
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * Return distinct device tokens registered for a flight number.
 * Queries PostgreSQL across all plausible flight-number variants.
 */
export async function getTokensForFlight(flightNumber: string): Promise<string[]> {
  const variants = getFlightNumberVariants(flightNumber);

  const records = await prisma.deviceSubscription.findMany({
    where: {
      flightNumber: { in: variants },
    },
    select: { deviceToken: true, flightNumber: true },
  });

  console.log(
    `[NotificationStorage] PostgreSQL lookup for flight "${flightNumber}" (variants: [${variants.join(', ')}]) returned ${records.length} record(s)`,
  );

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
 * Permanently delete invalid / unregistered tokens from PostgreSQL.
 * Called when Firebase returns registration-token-not-registered or invalid-registration-token.
 */
export async function deleteInvalidTokens(tokens: string[]): Promise<number> {
  if (!tokens || tokens.length === 0) return 0;
  try {
    const res = await prisma.deviceSubscription.deleteMany({
      where: { deviceToken: { in: tokens } },
    });
    console.log(
      `[NotificationStorage] 🗑️ Cleaned up ${res.count} unregistered/invalid FCM token(s) from PostgreSQL.`,
    );
    return res.count;
  } catch (err: any) {
    console.error('[NotificationStorage] Failed to delete invalid tokens:', err.message);
    return 0;
  }
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
 * Returns null if no baseline has been recorded yet.
 */
export async function getFlightStateSnapshot(
  flightNumber: string,
): Promise<FlightStateSnapshot | null> {
  const variants = getFlightNumberVariants(flightNumber);
  const record = await prisma.flightStateSnapshot.findFirst({
    where: { flightNumber: { in: variants } },
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
 */
export async function saveFlightStateSnapshot(
  flightNumber: string,
  terminal: string,
  gate: string,
): Promise<void> {
  const canonicalFlight = toCanonicalFlightNumber(flightNumber);
  await prisma.flightStateSnapshot.upsert({
    where: { flightNumber: canonicalFlight },
    update: { terminal, gate },
    create: { flightNumber: canonicalFlight, terminal, gate },
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

export function maskToken(token: string): string {
  if (!token || token.length <= 10) return '***';
  return `${token.substring(0, 6)}...${token.substring(token.length - 4)}`;
}

