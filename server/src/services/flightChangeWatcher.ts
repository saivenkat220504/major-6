/**
 * flightChangeWatcher.ts
 *
 * CRITICAL FIXES applied:
 *  1. Flight baseline (terminal/gate last-known state) is now read from and
 *     written to PostgreSQL via FlightStateSnapshot — survives server restarts.
 *  2. When no devices are registered for a flight, the watcher logs a warning
 *     and skips — it does NOT send a mock broadcast to a fake token.
 *  3. `getTokensForFlight` is properly awaited (it is async/Prisma).
 *  4. No in-memory state is used as the authoritative baseline.
 */

import prisma from '../prisma/client';
import {
  getTokensForFlight,
  getFlightStateSnapshot,
  saveFlightStateSnapshot,
  toCanonicalFlightNumber,
  getFlightNumberVariants,
} from './notificationStorage';
import { sendPushNotification } from './pushNotificationService';

let isWatcherRunning = false;
let watcherTimeoutHandle: NodeJS.Timeout | null = null;
let isCheckInProgress = false;

/**
 * Format a human-readable notification body based on which fields changed.
 */
export function buildNotificationContent(
  flightNumber: string,
  oldState: { terminal: string; gate: string },
  newState: { terminal: string; gate: string },
): { title: string; body: string } {
  const terminalChanged = oldState.terminal !== newState.terminal;
  const gateChanged = oldState.gate !== newState.gate;

  const title = 'Flight Update';
  let body: string;

  if (terminalChanged && gateChanged) {
    body =
      `Your flight ${flightNumber} terminal has been changed to ${newState.terminal} ` +
      `and gate to ${newState.gate}.\nTerminal: ${newState.terminal}\nGate: ${newState.gate}`;
  } else if (gateChanged) {
    body = `Your flight gate has been changed to ${newState.gate}.\nTerminal: ${newState.terminal}`;
  } else if (terminalChanged) {
    body = `Your flight terminal has been changed to ${newState.terminal}.\nGate: ${newState.gate}`;
  } else {
    body =
      `Your flight ${flightNumber} information has been updated.\n` +
      `Terminal: ${newState.terminal}\nGate: ${newState.gate}`;
  }

  return { title, body };
}

/**
 * Single iteration: read all flight_info rows, compare each against the
 * persisted FlightStateSnapshot baseline in PostgreSQL, dispatch real FCM notifications
 * for any changed flights, then update the baseline in PostgreSQL.
 *
 * Concurrency protected: only one check iteration executes at any given time.
 */
export async function checkFlightChanges(): Promise<{
  changesDetected: number;
  notificationsSent: number;
}> {
  if (isCheckInProgress) {
    return { changesDetected: 0, notificationsSent: 0 };
  }

  isCheckInProgress = true;
  let changesDetected = 0;
  let notificationsSent = 0;

  try {
    // 1. Requirement 5, 7, 8, 12: The watcher must load and monitor ONLY that registered flight.
    // Query PostgreSQL device subscriptions to get active registered flights.
    // Never monitor all flights, and never use AI-102 as a default or fallback.
    const activeSubscriptions: any[] = await prisma.deviceSubscription.findMany({
      select: { flightNumber: true, deviceToken: true },
    });

    if (!activeSubscriptions || activeSubscriptions.length === 0) {
      // No devices currently registered. Watcher stays idle without monitoring arbitrary flights.
      return { changesDetected: 0, notificationsSent: 0 };
    }

    // Extract unique canonical flight numbers with active device subscriptions
    const uniqueFlights = Array.from(
      new Set(
        activeSubscriptions
          .map((s) => toCanonicalFlightNumber(s.flightNumber))
          .filter(Boolean),
      ),
    );

    for (const watchedFlight of uniqueFlights) {
      const deviceCount = activeSubscriptions.filter(
        (s) => toCanonicalFlightNumber(s.flightNumber) === watchedFlight,
      ).length;

      // Log: Watched flight
      console.log(
        `[Flow] Watched flight: "${watchedFlight}" (monitoring for ${deviceCount} registered phone subscription(s) in PostgreSQL)`,
      );

      // 2. Look up the current status for THIS watched flight from flight_info
      const variants = getFlightNumberVariants(watchedFlight);
      let record: any = null;

      try {
        record = await (prisma as any).flightInfo?.findFirst({
          where: {
            flightNumber: { in: variants },
          },
        });
      } catch {
        try {
          const raw: any = await prisma.$queryRawUnsafe(
            `SELECT * FROM "flight_info" WHERE UPPER("flight_number") = ANY($1) ORDER BY "updated_at" DESC LIMIT 1`,
            variants.map((v: string) => v.toUpperCase()),
          );
          if (Array.isArray(raw) && raw.length > 0) record = raw[0];
        } catch (rawErr) {
          console.warn(`[FlightWatcher] Raw query failed for flight ${watchedFlight}:`, rawErr);
        }
      }

      if (!record) {
        console.log(`[FlightWatcher] No flight_info record configured in DB for watched flight "${watchedFlight}".`);
        continue;
      }

      const currentTerminal = (
        record.departureTerminal || record.departure_terminal || ''
      ).trim();
      const currentGate = (record.assignedGate || record.assigned_gate || '').trim();

      if (!currentTerminal && !currentGate) continue;

      // 3. Load persisted baseline snapshot from PostgreSQL
      const snapshot = await getFlightStateSnapshot(watchedFlight);

      if (!snapshot) {
        // No baseline yet — record current state as starting baseline in PostgreSQL
        await saveFlightStateSnapshot(watchedFlight, currentTerminal, currentGate);
        console.log(
          `[FlightWatcher] Initialized baseline for watched flight "${watchedFlight}": terminal="${currentTerminal}", gate="${currentGate}"`,
        );
        continue;
      }

      const terminalChanged = snapshot.terminal !== currentTerminal;
      const gateChanged = snapshot.gate !== currentGate;

      if (!terminalChanged && !gateChanged) {
        // No change for this flight
        continue;
      }

      changesDetected++;
      // Log: Triggered notification flight
      console.log(
        `[Flow] Triggered notification flight: "${watchedFlight}" (Gate: "${snapshot.gate}" → "${currentGate}", Terminal: "${snapshot.terminal}" → "${currentTerminal}")`,
      );

      // Update baseline immediately in PostgreSQL to prevent duplicate dispatch
      await saveFlightStateSnapshot(watchedFlight, currentTerminal, currentGate);

      // 4. Build notification payload using the EXACT watched flight number
      const payload = buildNotificationContent(
        watchedFlight,
        { terminal: snapshot.terminal, gate: snapshot.gate },
        { terminal: currentTerminal, gate: currentGate },
      );

      // 5. Retrieve registered device tokens for THIS watched flight from PostgreSQL
      const tokens = await getTokensForFlight(watchedFlight);

      if (tokens.length === 0) {
        console.log(
          `[FlightWatcher] 0 active devices in PostgreSQL for flight "${watchedFlight}". Dispatch skipped.`,
        );
      } else {
        // 6. Dispatch real FCM push notification
        const result = await sendPushNotification(tokens, {
          ...payload,
          data: {
            flightNumber: watchedFlight,
            terminal: currentTerminal,
            gate: currentGate,
            type: 'FLIGHT_CHANGE',
          },
        });
        notificationsSent += result.successCount;
        console.log(
          `[FlightWatcher] FCM delivered to ${result.successCount}/${tokens.length} registered device(s) for flight "${watchedFlight}" (${result.failureCount} failed).`,
        );
      }
    }
  } catch (err) {
    console.error('[FlightWatcher] Error during flight change check:', err);
  } finally {
    isCheckInProgress = false;
  }

  return { changesDetected, notificationsSent };
}

/**
 * Start the background polling watcher daemon.
 * Ensures strictly ONE instance runs with sequential non-overlapping iterations.
 */
export function startFlightChangeWatcher(intervalMs = 3000): void {
  if (isWatcherRunning) {
    console.log('[FlightWatcher] Watcher daemon is already running (singleton enforced).');
    return;
  }

  isWatcherRunning = true;
  console.log(
    `[FlightWatcher] Starting single background watcher daemon (interval: ${intervalMs}ms)...`,
  );

  const loop = async () => {
    if (!isWatcherRunning) return;
    try {
      await checkFlightChanges();
    } catch (err) {
      console.error('[FlightWatcher] Loop iteration error:', err);
    }
    if (isWatcherRunning) {
      watcherTimeoutHandle = setTimeout(loop, intervalMs);
    }
  };

  // Run initial iteration immediately
  loop().catch((err) =>
    console.error('[FlightWatcher] Initial check loop error:', err),
  );
}

/** Stop the background watcher daemon. */
export function stopFlightChangeWatcher(): void {
  if (watcherTimeoutHandle) {
    clearTimeout(watcherTimeoutHandle);
    watcherTimeoutHandle = null;
  }
  isWatcherRunning = false;
  console.log('[FlightWatcher] Background watcher daemon stopped.');
}

