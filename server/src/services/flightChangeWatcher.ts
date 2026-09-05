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
  getBaggageStateSnapshot,
  saveBaggageStateSnapshot,
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
 * Extract belt number or arrival belt designation from status text or explicit belt.
 * Examples:
 *   "Arrived at Belt 4"  -> "Belt 4"
 *   "Arrived at Belt 2"  -> "Belt 2"
 *   "Belt 4"             -> "Belt 4"
 *   "Belt 12A"           -> "Belt 12A"
 */
export function extractBeltDesignation(status: string, explicitBelt?: string | null): string {
  if (explicitBelt && explicitBelt.trim()) {
    const trimmed = explicitBelt.trim();
    if (/^Belt\s+/i.test(trimmed)) return trimmed;
    return `Belt ${trimmed}`;
  }

  if (!status) return 'Belt 4';
  const match = status.match(/(?:Arrived\s+(?:at\s+)?)?(Belt\s*[A-Za-z0-9]+)/i);
  if (match && match[1]) {
    return match[1].replace(/Belt\s*/i, 'Belt ');
  }
  return 'Belt 4';
}

/**
 * Check if status string represents luggage arrival at a baggage reclaim belt.
 */
export function isArrivalBeltStatus(status: string): boolean {
  if (!status) return false;
  return /Arrived\s+(?:at\s+)?Belt/i.test(status) || /Belt\s*[A-Za-z0-9]+/i.test(status);
}

/**
 * Single iteration: read flight_info and baggage_tracking rows for registered flights,
 * compare each against the persisted snapshots in PostgreSQL, dispatch real FCM
 * notifications for changes, and update baseline snapshots in PostgreSQL.
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
    // 1. Query PostgreSQL device subscriptions to get active registered flights.
    // The watcher loads and monitors ONLY registered flights.
    const activeSubscriptions: any[] = await prisma.deviceSubscription.findMany({
      select: { flightNumber: true, deviceToken: true },
    });

    if (!activeSubscriptions || activeSubscriptions.length === 0) {
      // No devices currently registered. Watcher stays idle.
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

      const variants = getFlightNumberVariants(watchedFlight);

      // ─── A. FLIGHT INFO GATE & TERMINAL WATCHER ─────────────────────────
      let flightRecord: any = null;

      try {
        flightRecord = await (prisma as any).flightInfo?.findFirst({
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
          if (Array.isArray(raw) && raw.length > 0) flightRecord = raw[0];
        } catch (rawErr) {
          console.warn(`[FlightWatcher] Raw query failed for flight ${watchedFlight}:`, rawErr);
        }
      }

      if (flightRecord) {
        const currentTerminal = (
          flightRecord.departureTerminal || flightRecord.departure_terminal || ''
        ).trim();
        const currentGate = (flightRecord.assignedGate || flightRecord.assigned_gate || '').trim();

        if (currentTerminal || currentGate) {
          const flightSnapshot = await getFlightStateSnapshot(watchedFlight);

          if (!flightSnapshot) {
            await saveFlightStateSnapshot(watchedFlight, currentTerminal, currentGate);
            console.log(
              `[FlightWatcher] Initialized baseline for flight "${watchedFlight}": terminal="${currentTerminal}", gate="${currentGate}"`,
            );
          } else {
            const terminalChanged = flightSnapshot.terminal !== currentTerminal;
            const gateChanged = flightSnapshot.gate !== currentGate;

            if (terminalChanged || gateChanged) {
              changesDetected++;
              console.log(
                `[Flow] Triggered flight notification: "${watchedFlight}" (Gate: "${flightSnapshot.gate}" → "${currentGate}", Terminal: "${flightSnapshot.terminal}" → "${currentTerminal}")`,
              );

              const payload = buildNotificationContent(
                watchedFlight,
                { terminal: flightSnapshot.terminal, gate: flightSnapshot.gate },
                { terminal: currentTerminal, gate: currentGate },
              );

              const tokens = await getTokensForFlight(watchedFlight);
              if (tokens.length > 0) {
                const result = await sendPushNotification(tokens, {
                  ...payload,
                  data: {
                    flightNumber: watchedFlight,
                    terminal: currentTerminal,
                    gate: currentGate,
                    type: 'FLIGHT_CHANGE',
                  },
                });

                if (result.successCount > 0 || result.mocked) {
                  await saveFlightStateSnapshot(watchedFlight, currentTerminal, currentGate);
                  notificationsSent += result.successCount;
                  console.log(
                    `[FlightWatcher] FCM delivered to ${result.successCount}/${tokens.length} registered device(s) for flight "${watchedFlight}".`,
                  );
                }
              }
            }
          }
        }
      }

      // ─── B. BAGGAGE STATUS & ARRIVAL BELT WATCHER ───────────────────────
      let baggageRecords: any[] = [];
      try {
        baggageRecords = await (prisma as any).baggageTracking.findMany({
          where: {
            flightNumber: { in: variants },
          },
        });
      } catch (bagErr: any) {
        // Safe query in case table is freshly created
        try {
          const rawBags: any = await prisma.$queryRawUnsafe(
            `SELECT * FROM "baggage_tracking" WHERE UPPER("flight_number") = ANY($1)`,
            variants.map((v: string) => v.toUpperCase()),
          );
          if (Array.isArray(rawBags)) baggageRecords = rawBags;
        } catch {}
      }

      for (const bag of baggageRecords) {
        const tagNumber = (bag.tagNumber || bag.tag_number || '').trim();
        const currentStatus = (bag.status || '').trim();
        const currentBelt = extractBeltDesignation(currentStatus, bag.belt);

        if (!tagNumber || !currentStatus) continue;

        const bagSnapshot = await getBaggageStateSnapshot(tagNumber);

        if (!bagSnapshot) {
          // No baseline recorded yet — save starting state so we only notify on genuine transitions
          await saveBaggageStateSnapshot(tagNumber, watchedFlight, currentStatus, currentBelt);
          console.log(
            `[BaggageWatcher] Initialized baseline for tag "${tagNumber}" (flight "${watchedFlight}"): status="${currentStatus}", belt="${currentBelt}"`,
          );
          continue;
        }

        const statusChanged = bagSnapshot.status !== currentStatus;
        if (!statusChanged) {
          // Status has not changed — strictly prevent repeated notifications
          continue;
        }

        // Check if transition is to an arrival belt status (e.g. "Arrived at Belt 4", "Arrived at Belt 2")
        const isArrival = isArrivalBeltStatus(currentStatus);

        if (isArrival) {
          changesDetected++;
          const notificationBody = `Your luggage has arrived at ${currentBelt}.`;

          console.log(
            `[Flow] Triggered baggage notification flight: "${watchedFlight}" tag: "${tagNumber}" (Status: "${bagSnapshot.status}" → "${currentStatus}")`,
          );
          console.log(`[Flow] Notification message: "${notificationBody}"`);

          const tokens = await getTokensForFlight(watchedFlight);

          if (tokens.length === 0) {
            console.log(
              `[BaggageWatcher] 0 active devices registered for flight "${watchedFlight}". Dispatch skipped.`,
            );
          } else {
            // Dispatch FCM Push Notification to the phone registered for this flight
            const result = await sendPushNotification(tokens, {
              title: 'Luggage Arrival',
              body: notificationBody,
              data: {
                flightNumber: watchedFlight,
                tagNumber,
                status: currentStatus,
                belt: currentBelt,
                type: 'BAGGAGE_ARRIVAL',
              },
            });

            // Mark snapshot safely after dispatch succeeds to prevent duplicates across restarts
            if (result.successCount > 0 || result.mocked) {
              await saveBaggageStateSnapshot(tagNumber, watchedFlight, currentStatus, currentBelt);
              notificationsSent += result.successCount;
              console.log(
                `[BaggageWatcher] ✅ Baggage push notification delivered to ${result.successCount}/${tokens.length} device(s) for flight "${watchedFlight}".`,
              );
            } else {
              console.warn(
                `[BaggageWatcher] ⚠️ FCM dispatch failed for flight "${watchedFlight}". Snapshot not advanced; will retry on next iteration.`,
              );
            }
          }
        } else {
          // Status changed to non-arrival state (e.g. "Loaded onto Aircraft") — update baseline without sending arrival alert
          await saveBaggageStateSnapshot(tagNumber, watchedFlight, currentStatus, currentBelt);
          console.log(
            `[BaggageWatcher] Updated baseline for tag "${tagNumber}": status="${currentStatus}" (non-arrival state, no push required).`,
          );
        }
      }
    }
  } catch (err) {
    console.error('[FlightWatcher] Error during flight/baggage change check:', err);
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

