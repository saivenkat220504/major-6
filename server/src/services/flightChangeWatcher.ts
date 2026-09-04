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
let watcherIntervalTimer: NodeJS.Timeout | null = null;

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
 * persisted FlightStateSnapshot baseline, dispatch FCM notifications for
 * any changed flights, then update the baseline in the database.
 *
 * This function is safe to call across server restarts because all state
 * it depends on is stored in PostgreSQL.
 */
export async function checkFlightChanges(): Promise<{
  changesDetected: number;
  notificationsSent: number;
}> {
  let changesDetected = 0;
  let notificationsSent = 0;

  try {
    // 1. Fetch current flight records from the database
    let records: any[] = [];
    try {
      records = await (prisma as any).flightInfo?.findMany() ?? [];
    } catch {
      // Fallback: raw SQL (defensive – model name mismatch edge case)
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

      // 2. Load the persisted baseline from PostgreSQL
      const snapshot = await getFlightStateSnapshot(flightNum);

      if (!snapshot) {
        // No baseline yet — record current state as the starting point.
        // Do NOT send a notification; we have no previous value to compare.
        await saveFlightStateSnapshot(flightNum, currentTerminal, currentGate);
        console.log(
          `[FlightWatcher] Initialised baseline for ${flightNum}: terminal=${currentTerminal}, gate=${currentGate}`,
        );
        continue;
      }

      const terminalChanged = snapshot.terminal !== currentTerminal;
      const gateChanged = snapshot.gate !== currentGate;

      if (!terminalChanged && !gateChanged) {
        // No change — nothing to do.
        continue;
      }

      changesDetected++;
      console.log(`[FlightWatcher] ✈ Change detected for flight ${flightNum}:`);
      console.log(`  Terminal: "${snapshot.terminal}" → "${currentTerminal}"`);
      console.log(`  Gate:     "${snapshot.gate}" → "${currentGate}"`);

      // 3. Build notification payload
      const payload = buildNotificationContent(
        flightNum,
        { terminal: snapshot.terminal, gate: snapshot.gate },
        { terminal: currentTerminal, gate: currentGate },
      );

      // 4. Retrieve registered device tokens from PostgreSQL
      const tokens = await getTokensForFlight(flightNum);

      if (tokens.length === 0) {
        // No registered devices — skip silently. Do NOT use mock tokens.
        console.warn(
          `[FlightWatcher] ⚠ No registered devices found in DB for flight ${flightNum}. ` +
            `Notification skipped. (The device must call /register-device first.)`,
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
          `[FlightWatcher] FCM dispatched to ${tokens.length} device(s): ` +
            `${result.successCount} success, ${result.failureCount} failed`,
        );
      }

      // 6. Persist updated baseline AFTER notification is sent
      await saveFlightStateSnapshot(flightNum, currentTerminal, currentGate);
    }
  } catch (err) {
    console.error('[FlightWatcher] Error during flight change check:', err);
  }

  return { changesDetected, notificationsSent };
}

/**
 * Start the background polling watcher.
 * Default interval: 3 000 ms — responsive without overloading PostgreSQL.
 */
export function startFlightChangeWatcher(intervalMs = 3000): void {
  if (isWatcherRunning) {
    console.log('[FlightWatcher] Watcher already running.');
    return;
  }

  isWatcherRunning = true;
  console.log(
    `[FlightWatcher] Starting background watcher (interval: ${intervalMs}ms)...`,
  );

  // Run an initial check immediately so the baselines are loaded / refreshed
  checkFlightChanges().catch((err) =>
    console.error('[FlightWatcher] Initial check failed:', err),
  );

  watcherIntervalTimer = setInterval(async () => {
    await checkFlightChanges();
  }, intervalMs);
}

/** Stop the background watcher. */
export function stopFlightChangeWatcher(): void {
  if (watcherIntervalTimer) {
    clearInterval(watcherIntervalTimer);
    watcherIntervalTimer = null;
  }
  isWatcherRunning = false;
  console.log('[FlightWatcher] Background watcher stopped.');
}
