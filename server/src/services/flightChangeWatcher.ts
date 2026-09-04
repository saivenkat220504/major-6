import prisma from '../prisma/client';
import {
  getTokensForFlight,
  getNotificationHistory,
  saveNotificationHistory,
} from './notificationStorage';
import { sendPushNotification } from './pushNotificationService';

interface FlightState {
  flightNumber: string;
  terminal: string;
  gate: string;
  updatedAt?: string;
}

let isWatcherRunning = false;
let watcherIntervalTimer: NodeJS.Timeout | null = null;

// Local in-memory tracker of current known DB state
const knownState: Record<string, FlightState> = {};

/**
 * Format dynamic notification content based on actual detected changes
 */
export function buildNotificationContent(
  flightNumber: string,
  oldState: { terminal: string; gate: string },
  newState: { terminal: string; gate: string }
): { title: string; body: string } {
  const terminalChanged = oldState.terminal !== newState.terminal;
  const gateChanged = oldState.gate !== newState.gate;

  const title = 'Flight Update';
  let body = '';

  if (terminalChanged && gateChanged) {
    body = `Your flight ${flightNumber} terminal has been changed to ${newState.terminal} and gate to ${newState.gate}.\nTerminal: ${newState.terminal}\nGate: ${newState.gate}`;
  } else if (gateChanged) {
    body = `Your flight gate has been changed to ${newState.gate}.\nTerminal: ${newState.terminal}`;
  } else if (terminalChanged) {
    body = `Your flight terminal has been changed to ${newState.terminal}.\nGate: ${newState.gate}`;
  } else {
    body = `Your flight ${flightNumber} information has been updated.\nTerminal: ${newState.terminal}\nGate: ${newState.gate}`;
  }

  return { title, body };
}

/**
 * Single check iteration across all flight_info records in the database.
 * Detects terminal and gate changes, verifies against persistent history,
 * dispatches notifications, and saves updated history.
 */
export async function checkFlightChanges(): Promise<{ changesDetected: number; notificationsSent: number }> {
  let changesDetected = 0;
  let notificationsSent = 0;

  try {
    // 1. Fetch current flight records from database
    let records: any[] = [];
    try {
      records = await (prisma as any).flightInfo?.findMany();
    } catch {
      try {
        const rawRecords: any = await prisma.$queryRawUnsafe(
          `SELECT * FROM "flight_info" ORDER BY "updated_at" DESC`
        );
        if (Array.isArray(rawRecords)) {
          records = rawRecords;
        }
      } catch (rawErr) {
        console.warn('[FlightWatcher] Raw query failed:', rawErr);
      }
    }

    if (!records || records.length === 0) {
      return { changesDetected: 0, notificationsSent: 0 };
    }

    // 2. Load persistent notification history (to prevent duplicates even across server restarts)
    const history = getNotificationHistory();

    for (const record of records) {
      const flightNum = (record.flightNumber || record.flight_number || 'AI-102').trim().toUpperCase();
      const currentTerminal = (record.departureTerminal || record.departure_terminal || '').trim();
      const currentGate = (record.assignedGate || record.assigned_gate || '').trim();

      if (!currentTerminal && !currentGate) continue;

      const previousRecorded = history[flightNum];
      const previousInMem = knownState[flightNum];

      // If we have no baseline yet (e.g. first run / newly created flight), record current state as baseline
      if (!previousRecorded && !previousInMem) {
        knownState[flightNum] = {
          flightNumber: flightNum,
          terminal: currentTerminal,
          gate: currentGate,
        };
        history[flightNum] = {
          flightNumber: flightNum,
          terminal: currentTerminal,
          gate: currentGate,
          timestamp: new Date().toISOString(),
        };
        saveNotificationHistory(history);
        continue;
      }

      // Prioritize persistent history baseline to survive restarts
      const baseline = previousRecorded || previousInMem;
      const terminalChanged = baseline.terminal !== currentTerminal;
      const gateChanged = baseline.gate !== currentGate;

      // Meaningful change check: Gate or Terminal change
      if (terminalChanged || gateChanged) {
        changesDetected++;
        console.log(`[FlightWatcher] ✈ Change detected for flight ${flightNum}:`);
        console.log(`  Terminal: "${baseline.terminal}" → "${currentTerminal}"`);
        console.log(`  Gate:     "${baseline.gate}" → "${currentGate}"`);

        // Generate dynamic notification payload
        const payload = buildNotificationContent(
          flightNum,
          { terminal: baseline.terminal, gate: baseline.gate },
          { terminal: currentTerminal, gate: currentGate }
        );

        // Retrieve target tokens registered for this flight
        const tokens = getTokensForFlight(flightNum);

        // Dispatch push notification
        if (tokens.length > 0) {
          await sendPushNotification(tokens, {
            ...payload,
            data: {
              flightNumber: flightNum,
              terminal: currentTerminal,
              gate: currentGate,
              type: 'FLIGHT_CHANGE',
            },
          });
          notificationsSent += tokens.length;
        } else {
          // If no specific token is registered for this flight, also notify in mock console for testing
          console.log(`[FlightWatcher] Note: No devices currently registered for flight ${flightNum}. Dispatched mock broadcast:`);
          await sendPushNotification(['mock-device-local-test-token'], {
            ...payload,
            data: {
              flightNumber: flightNum,
              terminal: currentTerminal,
              gate: currentGate,
              type: 'FLIGHT_CHANGE',
            },
          });
        }

        // Update persistent history to prevent duplicate notifications
        history[flightNum] = {
          flightNumber: flightNum,
          terminal: currentTerminal,
          gate: currentGate,
          timestamp: new Date().toISOString(),
        };
        saveNotificationHistory(history);

        // Update in-memory state
        knownState[flightNum] = {
          flightNumber: flightNum,
          terminal: currentTerminal,
          gate: currentGate,
        };
      } else {
        // No change detected: keep baseline, do not send duplicate
      }
    }
  } catch (err) {
    console.error('[FlightWatcher] Error checking flight changes:', err);
  }

  return { changesDetected, notificationsSent };
}

/**
 * Start the background polling watcher.
 * Default interval: 3000ms (3 seconds) for responsive local testing without overloading PostgreSQL.
 */
export function startFlightChangeWatcher(intervalMs = 3000): void {
  if (isWatcherRunning) {
    console.log('[FlightWatcher] Watcher is already running.');
    return;
  }

  isWatcherRunning = true;
  console.log(`[FlightWatcher] Starting background flight change watcher (interval: ${intervalMs}ms)...`);

  // Run initial check immediately to initialize baselines
  checkFlightChanges().catch((err) => console.error('[FlightWatcher] Initial check failed:', err));

  // Start periodic watcher
  watcherIntervalTimer = setInterval(async () => {
    await checkFlightChanges();
  }, intervalMs);
}

/**
 * Stop the background watcher daemon
 */
export function stopFlightChangeWatcher(): void {
  if (watcherIntervalTimer) {
    clearInterval(watcherIntervalTimer);
    watcherIntervalTimer = null;
  }
  isWatcherRunning = false;
  console.log('[FlightWatcher] Background watcher stopped.');
}
