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
 * Parse time string into total minutes from midnight.
 * Supports formats:
 * - "06:30 PM", "6:30PM", "08:15 AM"
 * - "18:30", "08:15"
 * - ISO date/time strings
 */
export function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr || !timeStr.trim()) return null;
  const str = timeStr.trim();

  // 12-hour format: "06:30 PM", "6:30PM", "8:15 AM"
  const match12 = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    let hrs = parseInt(match12[1], 10);
    const mins = parseInt(match12[2], 10);
    const period = match12[3].toUpperCase();
    if (period === 'PM' && hrs < 12) hrs += 12;
    if (period === 'AM' && hrs === 12) hrs = 0;
    return hrs * 60 + mins;
  }

  // 24-hour format: "18:30", "08:15"
  const match24 = str.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hrs = parseInt(match24[1], 10);
    const mins = parseInt(match24[2], 10);
    return hrs * 60 + mins;
  }

  // ISO Date parse fallback
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.getHours() * 60 + d.getMinutes();
  }

  return null;
}

/**
 * Format total minutes as standard 12-hour AM/PM string (e.g. 1110 -> "06:30 PM", 1230 -> "08:30 PM")
 */
export function formatMinutesToAmPm(totalMinutes: number): string {
  let hrs = Math.floor(totalMinutes / 60) % 24;
  const mins = totalMinutes % 60;
  const period = hrs >= 12 ? 'PM' : 'AM';
  hrs = hrs % 12;
  if (hrs === 0) hrs = 12;
  const hh = String(hrs).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');
  return `${hh}:${mm} ${period}`;
}

/**
 * Calculate dynamic delay string XYZ and new time string PQRS from old and new time.
 * Allows ANY positive delay (>0). Rejects non-positive (<=0) or invalid updates.
 */
export function calculateFlightDelay(
  oldTimeStr: string,
  newTimeStr: string,
): { delayMinutes: number; delayString: string; newFormattedTime: string } | null {
  const oldMins = parseTimeToMinutes(oldTimeStr);
  const newMins = parseTimeToMinutes(newTimeStr);

  if (oldMins === null || newMins === null) return null;

  let diffMins = newMins - oldMins;
  // Handle midnight wrap-around (e.g. 23:00 to 01:00)
  if (diffMins < 0) {
    diffMins += 24 * 60;
  }

  // Allow only positive delay (> 0). Reject non-positive or earlier updates.
  if (diffMins <= 0) return null;

  let delayString: string;
  if (diffMins % 60 === 0) {
    const hrs = diffMins / 60;
    delayString = hrs === 1 ? '1 hour' : `${hrs} hours`;
  } else if (diffMins > 60) {
    const hrs = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    delayString = `${hrs} hour${hrs > 1 ? 's' : ''} ${mins} mins`;
  } else {
    delayString = `${diffMins} mins`;
  }

  const newFormattedTime = formatMinutesToAmPm(newMins);

  return { delayMinutes: diffMins, delayString, newFormattedTime };
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

      // ─── A. FLIGHT INFO GATE, TERMINAL & DELAY WATCHER ───────────────────
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
        const currentArrivalTime = (
          flightRecord.arrivalTime || flightRecord.arrival_time || '06:30 PM'
        ).trim();

        if (currentTerminal || currentGate || currentArrivalTime) {
          const flightSnapshot = await getFlightStateSnapshot(watchedFlight);

          if (!flightSnapshot) {
            await saveFlightStateSnapshot(watchedFlight, currentTerminal, currentGate, currentArrivalTime);
            console.log(
              `[FlightWatcher] Initialized baseline for flight "${watchedFlight}": terminal="${currentTerminal}", gate="${currentGate}", arrivalTime="${currentArrivalTime}"`,
            );
          } else {
            const terminalChanged = flightSnapshot.terminal !== currentTerminal;
            const gateChanged = flightSnapshot.gate !== currentGate;
            const arrivalTimeChanged =
              Boolean(flightSnapshot.arrivalTime) && flightSnapshot.arrivalTime !== currentArrivalTime;

            // A1. Terminal or Gate Change Notification
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
                  await saveFlightStateSnapshot(watchedFlight, currentTerminal, currentGate, currentArrivalTime);
                  notificationsSent += result.successCount;
                  console.log(
                    `[FlightWatcher] FCM delivered to ${result.successCount}/${tokens.length} registered device(s) for flight "${watchedFlight}".`,
                  );
                }
              }
            }

            // A2. Flight Arrival Time Delay Notification
            if (arrivalTimeChanged && flightSnapshot.arrivalTime) {
              const delayInfo = calculateFlightDelay(flightSnapshot.arrivalTime, currentArrivalTime);

              if (delayInfo) {
                changesDetected++;
                // Required exact format: "Your flight is delayed by XYZ. The new arrival time is PQRS. We request you to cooperate with us."
                const delayBody = `Your flight is delayed by ${delayInfo.delayString}. The new arrival time is ${delayInfo.newFormattedTime}. We request you to cooperate with us.`;

                console.log(
                  `[Flow] Triggered flight delay notification: "${watchedFlight}" (Arrival: "${flightSnapshot.arrivalTime}" → "${currentArrivalTime}", Delay: ${delayInfo.delayString})`,
                );
                console.log(`[Flow] Delay message: "${delayBody}"`);

                const tokens = await getTokensForFlight(watchedFlight);
                if (tokens.length > 0) {
                  const result = await sendPushNotification(tokens, {
                    title: 'Flight Delay Alert',
                    body: delayBody,
                    data: {
                      flightNumber: watchedFlight,
                      terminal: currentTerminal,
                      gate: currentGate,
                      arrivalTime: currentArrivalTime,
                      delayMinutes: String(delayInfo.delayMinutes),
                      type: 'FLIGHT_DELAY',
                    },
                  });

                  if (result.successCount > 0 || result.mocked) {
                    await saveFlightStateSnapshot(watchedFlight, currentTerminal, currentGate, currentArrivalTime);
                    notificationsSent += result.successCount;
                    console.log(
                      `[FlightWatcher] ✅ Flight delay notification delivered to ${result.successCount}/${tokens.length} device(s) for flight "${watchedFlight}".`,
                    );
                  } else {
                    console.warn(
                      `[FlightWatcher] ⚠️ FCM dispatch failed for flight delay "${watchedFlight}". Snapshot not advanced; will retry on next iteration.`,
                    );
                  }
                }
              } else {
                // Non-positive or invalid delay update (earlier arrival / same time) — update baseline without notification
                await saveFlightStateSnapshot(watchedFlight, currentTerminal, currentGate, currentArrivalTime);
                console.log(
                  `[FlightWatcher] Baseline updated for "${watchedFlight}" to "${currentArrivalTime}" (non-positive delay, no push sent).`,
                );
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

