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
    // 1. Fetch current flight records from the database
    let records: any[] = [];
    try {
      records = (await (prisma as any).flightInfo?.findMany()) ?? [];
    } catch {
      try {
        const raw: any = await prisma.$queryRawUnsafe(
          `SELECT * FROM "flight_info" ORDER BY "updated_at" DESC`,
        );
        if (Array.isArray(raw)) records = raw;
      } catch (rawErr) {
        console.warn('[FlightWatcher] Raw query failed:', rawErr);
      }
    }

    if (!records || records.length === 0) {
      return { changesDetected: 0, notificationsSent: 0 };
    }

    for (const record of records) {
      const flightNum = (
        record.flightNumber || record.flight_number || 'AI-102'
      )
        .trim()
        .toUpperCase();
      const currentTerminal = (
        record.departureTerminal || record.departure_terminal || ''
      ).trim();
      const currentGate = (record.assignedGate || record.assigned_gate || '').trim();

      if (!currentTerminal && !currentGate) continue;

      // 2. Load persisted baseline from PostgreSQL
      const snapshot = await getFlightStateSnapshot(flightNum);

      if (!snapshot) {
        // No baseline yet — record current state as starting baseline in PostgreSQL.
        await saveFlightStateSnapshot(flightNum, currentTerminal, currentGate);
        console.log(
          `[FlightWatcher] Initialised baseline for ${flightNum}: terminal="${currentTerminal}", gate="${currentGate}"`,
        );
        continue;
      }

      const terminalChanged = snapshot.terminal !== currentTerminal;
      const gateChanged = snapshot.gate !== currentGate;

      if (!terminalChanged && !gateChanged) {
        // No change — nothing to dispatch.
        continue;
      }

      changesDetected++;
      console.log(`[FlightWatcher] ✈ Flight update detected for flight ${flightNum}:`);
      console.log(`  Terminal: "${snapshot.terminal}" → "${currentTerminal}"`);
      console.log(`  Gate:     "${snapshot.gate}" → "${currentGate}"`);

      // Update baseline immediately to prevent re-triggering while dispatching
      await saveFlightStateSnapshot(flightNum, currentTerminal, currentGate);

      // 3. Build notification payload
      const payload = buildNotificationContent(
        flightNum,
        { terminal: snapshot.terminal, gate: snapshot.gate },
        { terminal: currentTerminal, gate: currentGate },
      );

      // 4. Retrieve registered device tokens from PostgreSQL
      const tokens = await getTokensForFlight(flightNum);

      if (tokens.length === 0) {
        // Strictly report real database count; NEVER mock or fake tokens
        console.log(
          `[FlightWatcher] 0 registered device(s) found in PostgreSQL for flight ${flightNum}. Real push dispatch skipped.`,
        );
      } else {
        // 5. Dispatch real FCM push notification
        const result = await sendPushNotification(tokens, {
          ...payload,
          data: {
            flightNumber: flightNum,
            terminal: currentTerminal,
            gate: currentGate,
            type: 'FLIGHT_CHANGE',
          },
        });
        notificationsSent += result.successCount;
        console.log(
          `[FlightWatcher] FCM delivered to ${result.successCount}/${tokens.length} registered device(s) (${result.failureCount} failed).`,
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

