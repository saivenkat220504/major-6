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

// ─── ICAO → IATA Airline Code Mapping ────────────────────────────────────────

/**
 * Maps 3-letter ICAO airline codes (as embedded in some BCBP barcodes) to the
 * correct 2/3-character IATA code used in flight numbers.
 *
 * When a PDF417 barcode is decoded, the 3-character carrier field sometimes
 * yields an ICAO code (e.g. "ING" for IndiGo) instead of the IATA code ("6E").
 * This causes malformed flight numbers like "ING6E241" or "ING241".
 */
const ICAO_TO_IATA: Record<string, string> = {
  ING: '6E', // IndiGo Airlines (ICAO: IGO/ING → IATA: 6E)
  IGO: '6E', // IndiGo Airlines alternate ICAO
  IAC: '6E', // Legacy code
  AIC: 'AI', // Air India (ICAO: AIC → IATA: AI)
  AIE: 'AI', // Air India Express (ICAO: AIE → IATA: IX) — keep as IX
  AIX: 'IX', // Air India Express IATA
  SXB: 'S5', // SpiceJet (ICAO: SXB → IATA: SG)
  SEJ: 'SG', // SpiceJet IATA: SG
  GOW: 'G8', // GoAir/Go First
  VTI: 'UK', // Vistara (ICAO: VTI → IATA: UK)
  CTM: 'QP', // Akasa Air
  BTI: '9W', // Jet Airways
};

/**
 * Remove any ICAO airline prefix that may have been prepended to a flight number.
 * E.g. "ING6E241" → "6E241", "AIC102" → "AI102", "ING241" → "6E241"
 *
 * Handles cases where:
 *  a) ICAO prefix + IATA prefix + number  → strip ICAO, keep IATA + number
 *  b) ICAO prefix + number only           → replace ICAO with IATA + number
 */
function stripIcaoPrefix(raw: string): string {
  for (const [icao, iata] of Object.entries(ICAO_TO_IATA)) {
    if (!raw.startsWith(icao)) continue;

    const remainder = raw.substring(icao.length); // e.g. "6E241" or "241"

    // Case a: remainder already starts with the correct IATA code (e.g. ING + 6E241)
    if (remainder.startsWith(iata)) {
      console.log(
        `[FlightNorm] 🔧 ICAO prefix stripped: "${raw}" → "${remainder}" (ICAO "${icao}" + IATA prefix "${iata}")`,
      );
      return remainder; // "6E241"
    }

    // Case b: remainder is just the number (e.g. ING + 241 → 6E241)
    if (/^[0-9]/.test(remainder)) {
      const corrected = `${iata}${remainder}`;
      console.log(
        `[FlightNorm] 🔧 ICAO-to-IATA remapped: "${raw}" → "${corrected}" (ICAO "${icao}" → IATA "${iata}")`,
      );
      return corrected; // "6E241"
    }
  }
  return raw; // No ICAO prefix found
}

// ─── Flight Number Canonicalization & Variants ────────────────────────────────

/**
 * Standardize flight numbers into canonical IATA format.
 *
 * Normalization pipeline (applied in order):
 *  1. Trim & uppercase
 *  2. Strip known ICAO airline prefixes  (ING6E241 → 6E241)
 *  3. Insert hyphen between airline code and number  (6E241 → 6E-241, AI102 → AI-102)
 *
 * Examples:
 *   "ING6E241" → "6E-241"
 *   "IGO6E241" → "6E-241"
 *   "ING241"   → "6E-241"
 *   "AIC102"   → "AI-102"
 *   "6E241"    → "6E-241"
 *   "AI102"    → "AI-102"
 *   "ai-102"   → "AI-102"
 */
export function toCanonicalFlightNumber(flightNumber: string): string {
  if (!flightNumber) return '';

  const raw = flightNumber.trim().toUpperCase();
  console.log(`[FlightNorm] Raw input: "${raw}"`);

  // Step 1: Strip ICAO prefixes
  const deIcao = stripIcaoPrefix(raw);

  // Step 2: Normalize separator (insert hyphen between airline code and number)
  const match = deIcao.match(/^([A-Z]{2,3}|[A-Z0-9]{2})[\s\-_]*([0-9]+)$/);
  if (match) {
    const canonical = `${match[1]}-${match[2]}`;
    if (canonical !== raw) {
      console.log(`[FlightNorm] ✅ Canonical: "${raw}" → "${canonical}"`);
    }
    return canonical;
  }

  // If no standard pattern matched, return de-ICAO'd value
  return deIcao;
}

/**
 * Generate all plausible query variants for a flight number to guarantee matching
 * between registration and database queries (e.g. "6E-241", "6E241", "6E 241").
 */
export function getFlightNumberVariants(flightNumber: string): string[] {
  if (!flightNumber) return [];

  // Always canonicalize first so variants are based on the clean form
  const canonical = toCanonicalFlightNumber(flightNumber);
  const set = new Set<string>();
  set.add(canonical);

  const match = canonical.match(/^([A-Z]{2,3}|[A-Z0-9]{2})-([0-9]+)$/);
  if (match) {
    const code = match[1];
    const num = match[2];
    set.add(`${code}-${num}`); // 6E-241
    set.add(`${code}${num}`);  // 6E241
    set.add(`${code} ${num}`); // 6E 241
  }

  // Also add the raw input as a safety net for legacy records
  const rawClean = flightNumber.trim().toUpperCase();
  set.add(rawClean);

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

  // Requirement 13: Remove stale subscriptions for unrelated flights belonging to the same device
  const stale = await prisma.deviceSubscription.deleteMany({
    where: {
      deviceToken: token,
      flightNumber: { not: canonicalFlight },
    },
  });
  if (stale.count > 0) {
    console.log(
      `[NotificationStorage] 🧹 Cleaned ${stale.count} stale subscription(s) for device [${maskToken(token)}] from previous flights`,
    );
  }

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
    `[Flow] Stored flight in PostgreSQL: "${canonicalFlight}" for device [${maskToken(token)}]`,
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

